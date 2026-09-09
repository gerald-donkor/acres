#!/usr/bin/env node

/**
 * scripts/ops/verify-caddy-routing.js
 *
 * Deterministic, pure Node.js validator and route evaluator for Acres Caddy ingress.
 * Validates Caddyfile structure, security headers, request body limits,
 * transport timeouts, and upstream route dispatching (@api, @objects, and fallback)
 * ensuring S3 SigV4 Host header preservation for Garage and proxy headers for API.
 */

const fs = require('fs');
const path = require('path');

const DEFAULT_CADDYFILE_PATH = path.resolve(__dirname, '../../infra/caddy/Caddyfile.example');

/**
 * Strip comments from a line in a quote-aware manner.
 */
function stripInlineComment(line) {
  let inDouble = false;
  let inSingle = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"' && !inSingle && (i === 0 || line[i - 1] !== '\\')) {
      inDouble = !inDouble;
    } else if (char === "'" && !inDouble && (i === 0 || line[i - 1] !== '\\')) {
      inSingle = !inSingle;
    } else if (char === '#' && !inDouble && !inSingle) {
      if (i === 0) return '';
      if (/\s/.test(line[i - 1])) {
        return line.slice(0, i).trim();
      }
    }
  }
  return line.trim();
}

/**
 * Parse Caddyfile text into structured configuration object.
 * Handles blocks, comments, matchers, reverse_proxy directives, headers, and timeouts.
 */
function parseCaddyfile(content) {
  const lines = content.split('\n');

  // Tokenize lines, preserving active content while tracking comments
  const rawLines = [];
  const commentedLines = [];

  for (let i = 0; i < lines.length; i++) {
    const originalLine = lines[i];
    const trimmed = originalLine.trim();

    if (trimmed.startsWith('#')) {
      commentedLines.push({ lineNumber: i + 1, text: trimmed });
      continue;
    }

    if (trimmed === '') continue;

    // Remove inline comment if present (quote-aware)
    const lineContent = stripInlineComment(trimmed);
    if (lineContent === '') continue;

    rawLines.push({ lineNumber: i + 1, text: lineContent });
  }

  // Parse global block and site blocks
  const result = {
    globalBlock: {},
    siteBlocks: [],
    commentedLines,
    rawText: content,
  };

  let currentIndex = 0;

  // Detect global options block (first line is bare '{')
  if (rawLines.length > 0 && rawLines[0].text === '{') {
    let i = 1;
    while (i < rawLines.length && rawLines[i].text !== '}') {
      const parts = rawLines[i].text.split(/\s+/);
      result.globalBlock[parts[0]] = parts.slice(1).join(' ');
      i++;
    }
    currentIndex = i + 1; // skip closing '}'
  }

  // Parse site block(s)
  while (currentIndex < rawLines.length) {
    const line = rawLines[currentIndex].text;
    if (line.endsWith('{')) {
      const siteHeader = line.slice(0, -1).trim();
      const site = {
        domain: siteHeader,
        encode: [],
        headers: {},
        removedHeaders: [],
        hstsEnabled: false,
        requestBody: {},
        matchers: {},
        proxies: [],
      };

      currentIndex++;
      let depth = 1;

      while (currentIndex < rawLines.length && depth > 0) {
        const curLine = rawLines[currentIndex].text;

        if (curLine === '}') {
          depth--;
          if (depth === 0) {
            currentIndex++;
            break;
          }
        }

        // Header block
        if (curLine === 'header {' || curLine.startsWith('header {')) {
          currentIndex++;
          while (currentIndex < rawLines.length && rawLines[currentIndex].text !== '}') {
            const hLine = rawLines[currentIndex].text;
            if (hLine.startsWith('-')) {
              site.removedHeaders.push(hLine.slice(1).trim());
            } else {
              const match = hLine.match(/^([A-Za-z0-9-]+)\s+"?([^"]*)"?$/);
              if (match) {
                site.headers[match[1]] = match[2];
              } else {
                const parts = hLine.split(/\s+/);
                site.headers[parts[0]] = parts.slice(1).join(' ').replace(/^"(.*)"$/, '$1');
              }
            }
            currentIndex++;
          }
          currentIndex++; // consume '}'
          continue;
        }

        // Single header directive
        if (curLine.startsWith('header ')) {
          const rest = curLine.slice(7).trim();
          if (rest.startsWith('Strict-Transport-Security')) {
            site.hstsEnabled = true;
          }
        }

        // Encode directive
        if (curLine.startsWith('encode ')) {
          site.encode = curLine.slice(7).trim().split(/\s+/);
          currentIndex++;
          continue;
        }

        // Request body block
        if (curLine === 'request_body {' || curLine.startsWith('request_body {')) {
          currentIndex++;
          while (currentIndex < rawLines.length && rawLines[currentIndex].text !== '}') {
            const rbLine = rawLines[currentIndex].text;
            const match = rbLine.match(/^([a-z_]+)\s+(.+)$/);
            if (match) {
              site.requestBody[match[1]] = match[2];
            }
            currentIndex++;
          }
          currentIndex++; // consume '}'
          continue;
        }

        // Named matchers: @name path pattern1 pattern2 ...
        if (curLine.startsWith('@')) {
          const parts = curLine.split(/\s+/);
          const matcherName = parts[0];
          const matcherType = parts[1]; // e.g. 'path'
          const patterns = parts.slice(2);
          site.matchers[matcherName] = {
            type: matcherType,
            patterns,
          };
          currentIndex++;
          continue;
        }

        // Reverse proxy block or single line
        if (curLine.startsWith('reverse_proxy ')) {
          const rest = curLine.slice(14).trim();
          let proxyDef;

          if (rest.endsWith('{')) {
            const headerArgs = rest.slice(0, -1).trim().split(/\s+/);
            const matcher = headerArgs[0].startsWith('@') ? headerArgs[0] : null;
            const target = matcher ? headerArgs[1] : headerArgs[0];

            proxyDef = {
              matcher,
              target,
              headersUp: {},
              transport: {},
            };

            currentIndex++;
            while (currentIndex < rawLines.length && rawLines[currentIndex].text !== '}') {
              const pLine = rawLines[currentIndex].text;

              if (pLine.startsWith('header_up ')) {
                const hParts = pLine.slice(10).trim().split(/\s+/);
                proxyDef.headersUp[hParts[0]] = hParts.slice(1).join(' ');
              } else if (pLine.startsWith('transport ') && pLine.endsWith('{')) {
                const tType = pLine.slice(10, -1).trim();
                proxyDef.transport.type = tType;
                currentIndex++;
                while (currentIndex < rawLines.length && rawLines[currentIndex].text !== '}') {
                  const tLine = rawLines[currentIndex].text;
                  const tMatch = tLine.match(/^([a-z_]+)\s+(.+)$/);
                  if (tMatch) {
                    proxyDef.transport[tMatch[1]] = tMatch[2];
                  }
                  currentIndex++;
                }
              }
              currentIndex++;
            }
          } else {
            // single line proxy
            const headerArgs = rest.split(/\s+/);
            const matcher = headerArgs[0].startsWith('@') ? headerArgs[0] : null;
            const target = matcher ? headerArgs[1] : headerArgs[0];
            proxyDef = {
              matcher,
              target,
              headersUp: {},
              transport: {},
            };
          }

          site.proxies.push(proxyDef);
          currentIndex++;
          continue;
        }

        currentIndex++;
      }

      result.siteBlocks.push(site);
    } else {
      currentIndex++;
    }
  }

  return result;
}

/**
 * Evaluates which upstream and headers apply for a given request path.
 *
 * @param {Object} parsedConfig - Parsed Caddyfile structure.
 * @param {string} requestPath - Requested URL path (e.g. '/api/v1/auth/session').
 * @param {string} method - HTTP method (default: 'GET').
 * @returns {Object} Evaluation summary.
 */
function evaluateRoute(parsedConfig, requestPath, method = 'GET') {
  if (!parsedConfig || !parsedConfig.siteBlocks || parsedConfig.siteBlocks.length === 0) {
    throw new Error('No site block found in parsed Caddy configuration');
  }

  const site = parsedConfig.siteBlocks[0];

  // Helper: test if path matches a Caddy path pattern
  function matchesPathPattern(testPath, pattern) {
    if (pattern.endsWith('/*')) {
      const prefix = pattern.slice(0, -1); // keeps trailing slash
      return testPath.startsWith(prefix) || testPath === pattern.slice(0, -2);
    }
    return testPath === pattern;
  }

  // 1. Evaluate named matchers and proxies
  for (const proxy of site.proxies) {
    if (proxy.matcher) {
      const matcher = site.matchers[proxy.matcher];
      if (matcher && matcher.type === 'path') {
        const matched = matcher.patterns.some((pattern) => matchesPathPattern(requestPath, pattern));
        if (matched) {
          const matchedPattern = matcher.patterns.find((p) => matchesPathPattern(requestPath, p));
          return {
            requestPath,
            method,
            upstream: proxy.target,
            upstreamName: proxy.matcher.replace('@', ''),
            matcher: proxy.matcher,
            matchedPattern,
            headersUp: { ...proxy.headersUp },
            responseHeaders: { ...site.headers },
            removedResponseHeaders: [...site.removedHeaders],
            transport: { ...proxy.transport },
          };
        }
      }
    }
  }

  // 2. Evaluate fallback proxy (proxy without matcher)
  const fallbackProxy = site.proxies.find((p) => !p.matcher);
  if (fallbackProxy) {
    return {
      requestPath,
      method,
      upstream: fallbackProxy.target,
      upstreamName: 'next',
      matcher: null,
      matchedPattern: '*',
      headersUp: { ...fallbackProxy.headersUp },
      responseHeaders: { ...site.headers },
      removedResponseHeaders: [...site.removedHeaders],
      transport: { ...fallbackProxy.transport },
    };
  }

  throw new Error(`No matching proxy found for path "${requestPath}" and no fallback defined`);
}

/**
 * Verifies that the Caddyfile meets all security, routing, and operational invariants.
 *
 * @param {string} contentOrPath - Caddyfile content string or absolute/relative file path.
 * @param {Object} options - Configuration overrides.
 * @returns {Object} Verification results { valid, errors, warnings, parsedConfig, evaluatedRoutes }
 */
function verifyCaddyfile(contentOrPath, options = {}) {
  let content;
  let filePath = null;

  if (typeof contentOrPath === 'string') {
    if (fs.existsSync(contentOrPath)) {
      filePath = path.resolve(contentOrPath);
      content = fs.readFileSync(filePath, 'utf8');
    } else if (
      contentOrPath.trim().length > 0 &&
      !contentOrPath.includes('\n') &&
      (contentOrPath.includes('/') || contentOrPath.includes('\\') || !contentOrPath.includes('{'))
    ) {
      throw new Error(`Caddyfile not found at path: "${contentOrPath}"`);
    } else {
      content = contentOrPath;
    }
  } else {
    content = String(contentOrPath);
  }

  const errors = [];
  const warnings = [];

  const parsedConfig = parseCaddyfile(content);

  // 1. Global options block check
  if (!parsedConfig.globalBlock || Object.keys(parsedConfig.globalBlock).length === 0) {
    errors.push('Missing global options block ({ admin off, email ... })');
  } else {
    if (parsedConfig.globalBlock.admin !== 'off') {
      errors.push(`Global admin directive must be "off" (found: "${parsedConfig.globalBlock.admin || 'none'}")`);
    }
    if (!parsedConfig.globalBlock.email) {
      errors.push('Global block must configure an email directive for ACME TLS certificate issuance');
    }
  }

  // 2. Site block check
  if (parsedConfig.siteBlocks.length === 0) {
    errors.push('No site blocks defined in Caddyfile');
    return { valid: false, errors, warnings, parsedConfig, evaluatedRoutes: [] };
  }

  const site = parsedConfig.siteBlocks[0];

  // 3. Compression check
  if (!site.encode.includes('zstd') || !site.encode.includes('gzip')) {
    errors.push(`Site block must enable zstd and gzip compression ("encode zstd gzip", found: "${site.encode.join(' ')}")`);
  }

  // 4. Edge security headers check
  const reqHeaders = {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
  };

  for (const [hName, expectedVal] of Object.entries(reqHeaders)) {
    if (site.headers[hName] !== expectedVal) {
      errors.push(`Missing or incorrect security header "${hName}": expected "${expectedVal}", found "${site.headers[hName] || 'none'}"`);
    }
  }

  // Permissions-Policy check
  const permPolicy = site.headers['Permissions-Policy'];
  if (!permPolicy) {
    errors.push('Missing "Permissions-Policy" security header');
  } else {
    for (const directive of ['camera=()', 'microphone=()', 'geolocation=()']) {
      if (!permPolicy.includes(directive)) {
        errors.push(`Permissions-Policy missing required restrictive directive: ${directive}`);
      }
    }
  }

  // Header removal check: -Server
  if (!site.removedHeaders.includes('Server')) {
    errors.push('Site block header configuration must remove "Server" banner (-Server)');
  }

  // 5. HSTS Gate invariant check
  // Strict-Transport-Security must remain commented out pending operator approval
  if (site.hstsEnabled && !options.allowHsts) {
    errors.push('HSTS gate invariant violated: Strict-Transport-Security is active without operator approval');
  }
  const hasHstsComment = parsedConfig.commentedLines.some((c) => c.text.includes('Strict-Transport-Security'));
  if (!hasHstsComment && !site.hstsEnabled) {
    warnings.push('Caddyfile does not contain the standard commented HSTS approval gate reference');
  }

  // 6. Request body size limit check
  if (!site.requestBody || !site.requestBody.max_size) {
    errors.push('Site block missing request_body max_size directive');
  }

  // 7. Route matchers and proxies check
  const apiMatcher = site.matchers['@api'];
  if (!apiMatcher) {
    errors.push('Missing "@api" route matcher');
  } else {
    const requiredPatterns = ['/api/*', '/graphql', '/health', '/health/ready'];
    for (const pattern of requiredPatterns) {
      if (!apiMatcher.patterns.includes(pattern)) {
        errors.push(`@api matcher missing required path pattern "${pattern}"`);
      }
    }
  }

  const objectsMatcher = site.matchers['@objects'];
  if (!objectsMatcher) {
    errors.push('Missing "@objects" route matcher');
  } else {
    if (!objectsMatcher.patterns.includes('/acres-quarantine/*')) {
      errors.push('@objects matcher missing path pattern "/acres-quarantine/*"');
    }
  }

  // Proxies verification
  const apiProxy = site.proxies.find((p) => p.matcher === '@api');
  if (!apiProxy) {
    errors.push('Missing reverse_proxy directive for @api');
  } else {
    if (!apiProxy.target.includes('api:3001') && !apiProxy.target.includes('api')) {
      errors.push(`@api proxy target expected to be api:3001 (found: "${apiProxy.target}")`);
    }
    // Must forward client Host and Proto
    if (apiProxy.headersUp['X-Forwarded-Host'] !== '{host}') {
      errors.push('@api proxy must set "header_up X-Forwarded-Host {host}"');
    }
    if (apiProxy.headersUp['X-Forwarded-Proto'] !== '{scheme}') {
      errors.push('@api proxy must set "header_up X-Forwarded-Proto {scheme}"');
    }
    // Timeouts
    if (!apiProxy.transport.read_timeout || !apiProxy.transport.write_timeout || !apiProxy.transport.dial_timeout) {
      errors.push('@api proxy transport must declare read_timeout, write_timeout, and dial_timeout');
    }
  }

  const objectsProxy = site.proxies.find((p) => p.matcher === '@objects');
  if (!objectsProxy) {
    errors.push('Missing reverse_proxy directive for @objects');
  } else {
    if (!objectsProxy.target.includes('garage:3900') && !objectsProxy.target.includes('garage')) {
      errors.push(`@objects proxy target expected to be garage:3900 (found: "${objectsProxy.target}")`);
    }
    // S3 SigV4 invariant: Host header MUST be preserved
    if (objectsProxy.headersUp['Host'] !== '{host}') {
      errors.push(
        '@objects proxy must set "header_up Host {host}" to preserve client-signed S3 SigV4 signature integrity'
      );
    }
    // Timeouts
    if (!objectsProxy.transport.read_timeout || !objectsProxy.transport.write_timeout || !objectsProxy.transport.dial_timeout) {
      errors.push('@objects proxy transport must declare read_timeout, write_timeout, and dial_timeout');
    }
  }

  const nextProxy = site.proxies.find((p) => !p.matcher);
  if (!nextProxy) {
    errors.push('Missing fallback reverse_proxy directive for Next.js application');
  } else {
    if (!nextProxy.target.includes('next:3000') && !nextProxy.target.includes('next')) {
      errors.push(`Fallback proxy target expected to be next:3000 (found: "${nextProxy.target}")`);
    }
    // Timeouts
    if (!nextProxy.transport.read_timeout || !nextProxy.transport.write_timeout || !nextProxy.transport.dial_timeout) {
      errors.push('Next.js fallback proxy transport must declare read_timeout, write_timeout, and dial_timeout');
    }
  }

  // 8. Evaluate test route matrix
  const testRoutes = [
    { path: '/api/v1/auth/session', expectedUpstream: 'api', expectedTarget: 'api:3001' },
    { path: '/graphql', expectedUpstream: 'api', expectedTarget: 'api:3001' },
    { path: '/health', expectedUpstream: 'api', expectedTarget: 'api:3001' },
    { path: '/health/ready', expectedUpstream: 'api', expectedTarget: 'api:3001' },
    { path: '/acres-quarantine/temp-123/file.csv', expectedUpstream: 'garage', expectedTarget: 'garage:3900' },
    { path: '/', expectedUpstream: 'next', expectedTarget: 'next:3000' },
    { path: '/login', expectedUpstream: 'next', expectedTarget: 'next:3000' },
    { path: '/register', expectedUpstream: 'next', expectedTarget: 'next:3000' },
    { path: '/app', expectedUpstream: 'next', expectedTarget: 'next:3000' },
    { path: '/app/dashboards', expectedUpstream: 'next', expectedTarget: 'next:3000' },
    { path: '/_next/static/chunks/main.js', expectedUpstream: 'next', expectedTarget: 'next:3000' },
    { path: '/favicon.ico', expectedUpstream: 'next', expectedTarget: 'next:3000' },
  ];

  const evaluatedRoutes = [];
  if (errors.length === 0) {
    for (const testCase of testRoutes) {
      try {
        const evalResult = evaluateRoute(parsedConfig, testCase.path);
        const matchesTarget = evalResult.upstream === testCase.expectedTarget;
        if (!matchesTarget) {
          errors.push(
            `Route evaluation failed for path "${testCase.path}": expected upstream "${testCase.expectedTarget}", got "${evalResult.upstream}"`
          );
        }
        evaluatedRoutes.push({
          ...evalResult,
          expectedTarget: testCase.expectedTarget,
          passed: matchesTarget,
        });
      } catch (err) {
        errors.push(`Route evaluation threw error for path "${testCase.path}": ${err.message}`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    filePath,
    errors,
    warnings,
    parsedConfig,
    evaluatedRoutes,
  };
}

// CLI Execution Entry Point
if (require.main === module) {
  const targetPath = process.argv[2] || DEFAULT_CADDYFILE_PATH;

  console.log('=================================================================');
  console.log('         Acres Caddy Ingress & Same-Origin Route Verifier        ');
  console.log('=================================================================');
  console.log(`Target Caddyfile: ${targetPath}`);

  if (!fs.existsSync(targetPath)) {
    console.error(`Error: target Caddyfile does not exist at "${targetPath}"`);
    process.exit(1);
  }

  const result = verifyCaddyfile(targetPath);

  console.log('\n--- Route Evaluation Matrix ---');
  for (const route of result.evaluatedRoutes) {
    const statusMark = route.passed ? '✓' : '✗';
    console.log(
      ` ${statusMark} [${route.upstreamName.padEnd(6)}] ${route.requestPath.padEnd(35)} -> ${route.upstream} (matcher: ${route.matcher || 'fallback'})`
    );
  }

  console.log('\n--- Edge Security Headers ---');
  const site = result.parsedConfig.siteBlocks[0];
  if (site) {
    for (const [key, val] of Object.entries(site.headers)) {
      console.log(` ✓ ${key}: "${val}"`);
    }
    for (const removed of site.removedHeaders) {
      console.log(` ✓ -${removed} (banner stripped)`);
    }
  }

  console.log('\n--- Transport Timeouts & Request Limits ---');
  if (site) {
    console.log(` ✓ Max Request Body: ${site.requestBody.max_size || 'not set'}`);
    for (const proxy of site.proxies) {
      const name = proxy.matcher ? proxy.matcher.replace('@', '') : 'next (fallback)';
      console.log(` ✓ Transport [${name}]: read=${proxy.transport.read_timeout}, write=${proxy.transport.write_timeout}, dial=${proxy.transport.dial_timeout}`);
    }
  }

  console.log('\n--- Invariant Verification ---');
  if (result.errors.length > 0) {
    console.error('\nFAILURES:');
    for (const err of result.errors) {
      console.error(` ✗ ${err}`);
    }
    console.log('=================================================================');
    console.error('Status: FAILED');
    process.exit(1);
  }

  for (const w of result.warnings) {
    console.warn(` ! Warning: ${w}`);
  }

  console.log(' ✓ Global admin: off');
  console.log(' ✓ TLS contact email placeholder present');
  console.log(' ✓ Compression: zstd, gzip');
  console.log(' ✓ S3 SigV4 Host header preservation verified for Garage');
  console.log(' ✓ Proxy headers (X-Forwarded-Host, X-Forwarded-Proto) verified for API');
  console.log(' ✓ HSTS gate invariant verified (commented out pending approved domain)');
  console.log('=================================================================');
  console.log('Status: PASSED (Caddy routing and security posture clean)');
  process.exit(0);
}

module.exports = {
  parseCaddyfile,
  evaluateRoute,
  verifyCaddyfile,
  DEFAULT_CADDYFILE_PATH,
};
