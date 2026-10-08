#!/usr/bin/env node

/**
 * scripts/ops/verify-caddy-routing.js
 *
 * Deterministic, pure Node.js validator and route evaluator for Acres Caddy ingress.
 * Validates Caddyfile structure, security headers, request body limits,
 * transport timeouts, and upstream route dispatching (@api, @objects, and fallback)
 * ensuring S3 SigV4 Host header preservation for Garage and proxy headers for API.
 *
 * Classification: Static configuration simulation and route dispatching preflight
 * (execution_mode: "simulation"). Validates local Caddyfile syntax, directives,
 * security headers, reverse proxy matchers, and transport timeouts; does not perform
 * live public DNS lookups, live TLS handshake/cipher negotiation, certificate chain
 * validation, or live HTTPS header measurement.
 */

const fs = require("fs");
const path = require("path");
const crypto = require("node:crypto");

const DEFAULT_CADDYFILE_PATH = path.resolve(
  __dirname,
  "../../infra/caddy/Caddyfile.example",
);

const MAX_SOURCE_BYTES = 1024 * 1024;
const MAX_SAVED_BYTES = 1024 * 1024;
const text = (value) =>
  typeof value === "string" &&
  value.trim().length > 0 &&
  !/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u.test(value);
const isRecord = (value) =>
  value !== null &&
  typeof value === "object" &&
  [Object.prototype, null].includes(Object.getPrototypeOf(value));
const failure = (category) => new Error(`Caddy ${category} failed`);

function readSource(source) {
  let fd = null;
  try {
    let initial;
    try {
      initial = fs.statSync(source);
    } catch (e) {
      if (e.code === "ENOENT") return null;
      throw e;
    }
    if (!initial.isFile() || initial.size > MAX_SOURCE_BYTES)
      throw failure("evaluation");
    fd = fs.openSync(source, fs.constants.O_RDONLY | fs.constants.O_NONBLOCK);
    const opened = fs.fstatSync(fd);
    if (
      !opened.isFile() ||
      !sameFile(initial, opened) ||
      opened.size > MAX_SOURCE_BYTES ||
      opened.size !== initial.size ||
      opened.mtimeMs !== initial.mtimeMs ||
      opened.ctimeMs !== initial.ctimeMs
    )
      throw failure("evaluation");
    const buffer = Buffer.alloc(MAX_SOURCE_BYTES + 1);
    let used = 0;
    while (used < buffer.length) {
      const n = fs.readSync(fd, buffer, used, buffer.length - used, null);
      if (!Number.isInteger(n) || n < 0 || n > buffer.length - used)
        throw failure("evaluation");
      if (n === 0) break;
      used += n;
    }
    const after = fs.fstatSync(fd);
    if (
      used > MAX_SOURCE_BYTES ||
      after.size !== used ||
      opened.mtimeMs !== after.mtimeMs ||
      opened.ctimeMs !== after.ctimeMs
    )
      throw failure("evaluation");
    const named = fs.statSync(source);
    if (
      !sameFile(after, named) ||
      named.size !== used ||
      named.mtimeMs !== after.mtimeMs ||
      named.ctimeMs !== after.ctimeMs
    )
      throw failure("evaluation");
    return buffer.subarray(0, used).toString("utf8");
  } catch {
    throw failure("evaluation");
  } finally {
    if (fd !== null) {
      try {
        fs.closeSync(fd);
      } catch {
        try {
          fs.closeSync(fd);
        } catch {
          /* Persistent faults require process teardown. */
        }
        throw failure("evaluation");
      }
    }
  }
}

const publicFindings = new WeakMap();
const SAFE_ERRORS = [
  "Global options policy failed",
  "Global admin policy failed",
  "TLS contact declaration failed",
  "Site declaration failed",
  "Compression policy failed",
  "Security header policy failed",
  "Permissions policy declaration failed",
  "Permissions policy restriction failed",
  "Server banner removal failed",
  "HSTS approval gate failed",
  "HSTS max-age policy failed",
  "Request body limit declaration failed",
  "API matcher declaration failed",
  "API matcher path failed",
  "Objects matcher declaration failed",
  "Objects matcher path failed",
  "API proxy declaration failed",
  "API upstream policy failed",
  "API host forwarding failed",
  "API protocol forwarding failed",
  "API timeout declaration failed",
  "Objects proxy declaration failed",
  "Objects upstream policy failed",
  "S3 SigV4 Host preservation failed",
  "Objects timeout declaration failed",
  "Fallback proxy declaration failed",
  "Fallback upstream policy failed",
  "Fallback timeout declaration failed",
  "Route target policy failed",
  "Route evaluation failed",
  "Caddy source evaluation failed",
];
const SAFE_WARNING = "Commented HSTS approval gate reference missing";
function contentGuard(content) {
  if (
    typeof content !== "string" ||
    Buffer.byteLength(content, "utf8") > MAX_SOURCE_BYTES
  )
    throw failure("evaluation");
  let depth = 0,
    entries = 0;
  for (const raw of content.split("\n")) {
    const line = stripInlineComment(raw.trim());
    if (!line || line.startsWith("#")) continue;
    if (++entries > 10000) throw failure("evaluation");
    // Only whitespace-delimited, unquoted braces open/close blocks. Placeholder
    // braces, quoted text and inline comments are ordinary directive values.
    let quote = null;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === "\\") {
        i++;
        continue;
      }
      if (quote) {
        if (c === quote) quote = null;
        continue;
      }
      if (c === '"' || c === "'") {
        quote = c;
        continue;
      }
      if (
        (c === "{" || c === "}") &&
        (i === 0 || /\s/.test(line[i - 1])) &&
        (i === line.length - 1 || /\s/.test(line[i + 1]))
      ) {
        depth += c === "{" ? 1 : -1;
        if (depth < 0 || depth > 100) throw failure("evaluation");
      }
    }
    if (quote) throw failure("evaluation");
  }
  if (depth) throw failure("evaluation");
}
function routeInputGuard(config, requestPath, method) {
  if (
    !isRecord(config) ||
    !Array.isArray(config.siteBlocks) ||
    !config.siteBlocks.length ||
    typeof requestPath !== "string" ||
    typeof method !== "string" ||
    requestPath.length > MAX_SOURCE_BYTES ||
    method.length > 100
  )
    throw failure("evaluation");
  const site = config.siteBlocks[0];
  if (
    !isRecord(site) ||
    !Array.isArray(site.proxies) ||
    site.proxies.length > 10000 ||
    !isRecord(site.matchers) ||
    !isRecord(site.headers) ||
    !Array.isArray(site.removedHeaders) ||
    !site.removedHeaders.every((v) => typeof v === "string")
  )
    throw failure("evaluation");
  for (const proxy of site.proxies) {
    if (
      !isRecord(proxy) ||
      typeof proxy.target !== "string" ||
      !(proxy.matcher === null || typeof proxy.matcher === "string") ||
      !isRecord(proxy.headersUp) ||
      !isRecord(proxy.transport)
    )
      throw failure("evaluation");
  }
  for (const matcher of Object.values(site.matchers)) {
    if (
      !isRecord(matcher) ||
      typeof matcher.type !== "string" ||
      !Array.isArray(matcher.patterns) ||
      matcher.patterns.length > 10000 ||
      !matcher.patterns.every((v) => typeof v === "string")
    )
      throw failure("evaluation");
  }
}

/**
 * Strip comments from a line in a quote-aware manner.
 */
function stripInlineComment(line) {
  let inDouble = false;
  let inSingle = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"' && !inSingle && (i === 0 || line[i - 1] !== "\\")) {
      inDouble = !inDouble;
    } else if (char === "'" && !inDouble && (i === 0 || line[i - 1] !== "\\")) {
      inSingle = !inSingle;
    } else if (char === "#" && !inDouble && !inSingle) {
      if (i === 0) return "";
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
  contentGuard(content);
  const lines = content.split("\n");

  // Tokenize lines, preserving active content while tracking comments
  const rawLines = [];
  const commentedLines = [];

  for (let i = 0; i < lines.length; i++) {
    const originalLine = lines[i];
    const trimmed = originalLine.trim();

    if (trimmed.startsWith("#")) {
      commentedLines.push({ lineNumber: i + 1, text: trimmed });
      continue;
    }

    if (trimmed === "") continue;

    // Remove inline comment if present (quote-aware)
    const lineContent = stripInlineComment(trimmed);
    if (lineContent === "") continue;

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
  if (rawLines.length > 0 && rawLines[0].text === "{") {
    let i = 1;
    while (i < rawLines.length && rawLines[i].text !== "}") {
      const parts = rawLines[i].text.split(/\s+/);
      result.globalBlock[parts[0]] = parts.slice(1).join(" ");
      i++;
    }
    currentIndex = i + 1; // skip closing '}'
  }

  // Parse site block(s)
  while (currentIndex < rawLines.length) {
    const line = rawLines[currentIndex].text;
    if (line.endsWith("{")) {
      const siteHeader = line.slice(0, -1).trim();
      const site = {
        domain: siteHeader,
        encode: [],
        headers: {},
        removedHeaders: [],
        hstsEnabled: false,
        hstsValue: null,
        requestBody: {},
        matchers: {},
        proxies: [],
      };

      currentIndex++;
      let depth = 1;

      while (currentIndex < rawLines.length && depth > 0) {
        const curLine = rawLines[currentIndex].text;

        if (curLine === "}") {
          depth--;
          if (depth === 0) {
            currentIndex++;
            break;
          }
        }

        // Header block
        if (curLine === "header {" || curLine.startsWith("header {")) {
          currentIndex++;
          while (
            currentIndex < rawLines.length &&
            rawLines[currentIndex].text !== "}"
          ) {
            const hLine = rawLines[currentIndex].text;
            if (hLine.startsWith("-")) {
              site.removedHeaders.push(hLine.slice(1).trim());
            } else {
              const match = hLine.match(/^([A-Za-z0-9-]+)\s+"?([^"]*)"?$/);
              if (match) {
                site.headers[match[1]] = match[2];
              } else {
                const parts = hLine.split(/\s+/);
                site.headers[parts[0]] = parts
                  .slice(1)
                  .join(" ")
                  .replace(/^"(.*)"$/, "$1");
              }
              if (site.headers["Strict-Transport-Security"] !== undefined) {
                site.hstsEnabled = true;
                site.hstsValue = site.headers["Strict-Transport-Security"];
              }
            }
            currentIndex++;
          }
          currentIndex++; // consume '}'
          continue;
        }

        // Single header directive
        if (curLine.startsWith("header ")) {
          const rest = curLine.slice(7).trim();
          if (rest.startsWith("Strict-Transport-Security")) {
            site.hstsEnabled = true;
            site.hstsValue = rest
              .slice("Strict-Transport-Security".length)
              .trim()
              .replace(/^"(.*)"$/, "$1");
          }
        }

        // Encode directive
        if (curLine.startsWith("encode ")) {
          site.encode = curLine.slice(7).trim().split(/\s+/);
          currentIndex++;
          continue;
        }

        // Request body block
        if (
          curLine === "request_body {" ||
          curLine.startsWith("request_body {")
        ) {
          currentIndex++;
          while (
            currentIndex < rawLines.length &&
            rawLines[currentIndex].text !== "}"
          ) {
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
        if (curLine.startsWith("@")) {
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
        if (curLine.startsWith("reverse_proxy ")) {
          const rest = curLine.slice(14).trim();
          let proxyDef;

          if (rest.endsWith("{")) {
            const headerArgs = rest.slice(0, -1).trim().split(/\s+/);
            const matcher = headerArgs[0].startsWith("@")
              ? headerArgs[0]
              : null;
            const target = matcher ? headerArgs[1] : headerArgs[0];

            proxyDef = {
              matcher,
              target,
              headersUp: {},
              transport: {},
            };

            currentIndex++;
            while (
              currentIndex < rawLines.length &&
              rawLines[currentIndex].text !== "}"
            ) {
              const pLine = rawLines[currentIndex].text;

              if (pLine.startsWith("header_up ")) {
                const hParts = pLine.slice(10).trim().split(/\s+/);
                proxyDef.headersUp[hParts[0]] = hParts.slice(1).join(" ");
              } else if (
                pLine.startsWith("transport ") &&
                pLine.endsWith("{")
              ) {
                const tType = pLine.slice(10, -1).trim();
                proxyDef.transport.type = tType;
                currentIndex++;
                while (
                  currentIndex < rawLines.length &&
                  rawLines[currentIndex].text !== "}"
                ) {
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
            const matcher = headerArgs[0].startsWith("@")
              ? headerArgs[0]
              : null;
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
function evaluateRoute(parsedConfig, requestPath, method = "GET") {
  if (
    !parsedConfig ||
    !parsedConfig.siteBlocks ||
    parsedConfig.siteBlocks.length === 0
  ) {
    throw new Error("No site block found in parsed Caddy configuration");
  }

  routeInputGuard(parsedConfig, requestPath, method);
  const site = parsedConfig.siteBlocks[0];

  // Helper: test if path matches a Caddy path pattern
  function matchesPathPattern(testPath, pattern) {
    if (pattern.endsWith("/*")) {
      const prefix = pattern.slice(0, -1); // keeps trailing slash
      return testPath.startsWith(prefix) || testPath === pattern.slice(0, -2);
    }
    return testPath === pattern;
  }

  // 1. Evaluate named matchers and proxies
  for (const proxy of site.proxies) {
    if (proxy.matcher) {
      const matcher = site.matchers[proxy.matcher];
      if (matcher && matcher.type === "path") {
        const matched = matcher.patterns.some((pattern) =>
          matchesPathPattern(requestPath, pattern),
        );
        if (matched) {
          const matchedPattern = matcher.patterns.find((p) =>
            matchesPathPattern(requestPath, p),
          );
          return {
            requestPath,
            method,
            upstream: proxy.target,
            upstreamName: proxy.matcher.replace("@", ""),
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
      upstreamName: "next",
      matcher: null,
      matchedPattern: "*",
      headersUp: { ...fallbackProxy.headersUp },
      responseHeaders: { ...site.headers },
      removedResponseHeaders: [...site.removedHeaders],
      transport: { ...fallbackProxy.transport },
    };
  }

  throw new Error(
    `No matching proxy found for path "${requestPath}" and no fallback defined`,
  );
}

/**
 * Verifies that the Caddyfile meets all security, routing, and operational invariants.
 *
 * @param {string} contentOrPath - Caddyfile content string or absolute/relative file path.
 * @param {Object} options - Configuration overrides.
 * @returns {Object} Verification results { valid, errors, warnings, parsedConfig, evaluatedRoutes }
 */
function verifyCaddyfile(contentOrPath, options = {}) {
  if (
    typeof contentOrPath !== "string" ||
    !isRecord(options) ||
    Object.keys(options).some((key) => key !== "allowHsts") ||
    (Object.hasOwn(options, "allowHsts") &&
      typeof options.allowHsts !== "boolean")
  )
    throw failure("evaluation");
  let content;
  let filePath = null;
  // Preserve the exported content-or-path heuristic; CLI always reads an explicit path.
  if (Buffer.byteLength(contentOrPath, "utf8") > MAX_SOURCE_BYTES)
    throw failure("evaluation");
  if (!contentOrPath.includes("\n") && fs.existsSync(contentOrPath)) {
    filePath = path.resolve(contentOrPath);
    content = readSource(filePath);
  } else if (
    contentOrPath.trim().length > 0 &&
    !contentOrPath.includes("\n") &&
    (contentOrPath.includes("/") ||
      contentOrPath.includes("\\") ||
      !contentOrPath.includes("{"))
  ) {
    throw new Error(`Caddyfile not found at path: "${contentOrPath}"`);
  } else content = contentOrPath;

  return verifyContent(content, options, filePath);
}

function verifyContent(content, options, filePath = null) {
  const errors = [];
  const findings = [];
  const addError = (code, detail) => {
    errors.push(detail);
    findings.push(SAFE_ERRORS[code]);
  };
  const finish = (result) => {
    publicFindings.set(result, findings);
    return result;
  };
  const warnings = [];

  const parsedConfig = parseCaddyfile(content);

  // 1. Global options block check
  if (
    !parsedConfig.globalBlock ||
    Object.keys(parsedConfig.globalBlock).length === 0
  ) {
    addError(0, "Missing global options block ({ admin off, email ... })");
  } else {
    if (parsedConfig.globalBlock.admin !== "off") {
      addError(
        1,
        `Global admin directive must be "off" (found: "${parsedConfig.globalBlock.admin || "none"}")`,
      );
    }
    if (!parsedConfig.globalBlock.email) {
      addError(
        2,
        "Global block must configure an email directive for ACME TLS certificate issuance",
      );
    }
  }

  // 2. Site block check
  if (parsedConfig.siteBlocks.length === 0) {
    addError(3, "No site blocks defined in Caddyfile");
    return finish({
      valid: false,
      errors,
      warnings,
      parsedConfig,
      evaluatedRoutes: [],
    });
  }

  const site = parsedConfig.siteBlocks[0];

  // 3. Compression check
  if (!site.encode.includes("zstd") || !site.encode.includes("gzip")) {
    addError(
      4,
      `Site block must enable zstd and gzip compression ("encode zstd gzip", found: "${site.encode.join(" ")}")`,
    );
  }

  // 4. Edge security headers check
  const reqHeaders = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
  };

  for (const [hName, expectedVal] of Object.entries(reqHeaders)) {
    if (site.headers[hName] !== expectedVal) {
      addError(
        5,
        `Missing or incorrect security header "${hName}": expected "${expectedVal}", found "${site.headers[hName] || "none"}"`,
      );
    }
  }

  // Permissions-Policy check
  const permPolicy = site.headers["Permissions-Policy"];
  if (!permPolicy) {
    addError(6, 'Missing "Permissions-Policy" security header');
  } else {
    for (const directive of ["camera=()", "microphone=()", "geolocation=()"]) {
      if (!permPolicy.includes(directive)) {
        addError(
          7,
          `Permissions-Policy missing required restrictive directive: ${directive}`,
        );
      }
    }
  }

  // Header removal check: -Server
  if (!site.removedHeaders.includes("Server")) {
    addError(
      8,
      'Site block header configuration must remove "Server" banner (-Server)',
    );
  }

  // 5. HSTS Gate invariant check
  // Strict-Transport-Security must remain commented out pending operator approval
  if (site.hstsEnabled && !options.allowHsts) {
    addError(
      9,
      "HSTS gate invariant violated: Strict-Transport-Security is active without operator approval",
    );
  }
  if (site.hstsEnabled && options.allowHsts) {
    const value = site.hstsValue;
    const maxAge =
      typeof value === "string"
        ? value
            .split(";")
            .map((part) => part.trim())
            .filter((part) => /^max-age=/i.test(part))
        : [];
    if (
      typeof value !== "string" ||
      value.includes("{$") ||
      maxAge.length !== 1 ||
      !/^max-age=[1-9]\d*$/i.test(maxAge[0]) ||
      !Number.isSafeInteger(Number(maxAge[0].slice("max-age=".length)))
    ) {
      addError(
        10,
        "Active HSTS requires a concrete, positive max-age after operator approval",
      );
    }
  }
  const hasHstsComment = parsedConfig.commentedLines.some((c) =>
    c.text.includes("Strict-Transport-Security"),
  );
  if (!hasHstsComment && !site.hstsEnabled) {
    warnings.push(
      "Caddyfile does not contain the standard commented HSTS approval gate reference",
    );
  }

  // 6. Request body size limit check
  if (!site.requestBody || !site.requestBody.max_size) {
    addError(11, "Site block missing request_body max_size directive");
  }

  // 7. Route matchers and proxies check
  const apiMatcher = site.matchers["@api"];
  if (!apiMatcher) {
    addError(12, 'Missing "@api" route matcher');
  } else {
    const requiredPatterns = ["/api/*", "/graphql", "/health", "/health/ready"];
    for (const pattern of requiredPatterns) {
      if (!apiMatcher.patterns.includes(pattern)) {
        addError(13, `@api matcher missing required path pattern "${pattern}"`);
      }
    }
  }

  const objectsMatcher = site.matchers["@objects"];
  if (!objectsMatcher) {
    addError(14, 'Missing "@objects" route matcher');
  } else {
    if (!objectsMatcher.patterns.includes("/acres-quarantine/*")) {
      addError(
        15,
        '@objects matcher missing path pattern "/acres-quarantine/*"',
      );
    }
  }

  // Proxies verification
  const apiProxy = site.proxies.find((p) => p.matcher === "@api");
  if (!apiProxy) {
    addError(16, "Missing reverse_proxy directive for @api");
  } else {
    if (
      !apiProxy.target.includes("api:3001") &&
      !apiProxy.target.includes("api")
    ) {
      addError(
        17,
        `@api proxy target expected to be api:3001 (found: "${apiProxy.target}")`,
      );
    }
    // Must forward client Host and Proto
    if (apiProxy.headersUp["X-Forwarded-Host"] !== "{host}") {
      addError(18, '@api proxy must set "header_up X-Forwarded-Host {host}"');
    }
    if (apiProxy.headersUp["X-Forwarded-Proto"] !== "{scheme}") {
      addError(
        19,
        '@api proxy must set "header_up X-Forwarded-Proto {scheme}"',
      );
    }
    // Timeouts
    if (
      !apiProxy.transport.read_timeout ||
      !apiProxy.transport.write_timeout ||
      !apiProxy.transport.dial_timeout
    ) {
      addError(
        20,
        "@api proxy transport must declare read_timeout, write_timeout, and dial_timeout",
      );
    }
  }

  const objectsProxy = site.proxies.find((p) => p.matcher === "@objects");
  if (!objectsProxy) {
    addError(21, "Missing reverse_proxy directive for @objects");
  } else {
    if (
      !objectsProxy.target.includes("garage:3900") &&
      !objectsProxy.target.includes("garage")
    ) {
      addError(
        22,
        `@objects proxy target expected to be garage:3900 (found: "${objectsProxy.target}")`,
      );
    }
    // S3 SigV4 invariant: Host header MUST be preserved
    if (objectsProxy.headersUp["Host"] !== "{host}") {
      addError(
        23,
        '@objects proxy must set "header_up Host {host}" to preserve client-signed S3 SigV4 signature integrity',
      );
    }
    // Timeouts
    if (
      !objectsProxy.transport.read_timeout ||
      !objectsProxy.transport.write_timeout ||
      !objectsProxy.transport.dial_timeout
    ) {
      addError(
        24,
        "@objects proxy transport must declare read_timeout, write_timeout, and dial_timeout",
      );
    }
  }

  const nextProxy = site.proxies.find((p) => !p.matcher);
  if (!nextProxy) {
    addError(
      25,
      "Missing fallback reverse_proxy directive for Next.js application",
    );
  } else {
    if (
      !nextProxy.target.includes("next:3000") &&
      !nextProxy.target.includes("next")
    ) {
      addError(
        26,
        `Fallback proxy target expected to be next:3000 (found: "${nextProxy.target}")`,
      );
    }
    // Timeouts
    if (
      !nextProxy.transport.read_timeout ||
      !nextProxy.transport.write_timeout ||
      !nextProxy.transport.dial_timeout
    ) {
      addError(
        27,
        "Next.js fallback proxy transport must declare read_timeout, write_timeout, and dial_timeout",
      );
    }
  }

  // 8. Evaluate test route matrix
  const evaluatedRoutes = [];
  if (errors.length === 0) {
    for (const testCase of testRoutes) {
      try {
        const evalResult = evaluateRoute(parsedConfig, testCase.path);
        const matchesTarget = evalResult.upstream === testCase.expectedTarget;
        if (!matchesTarget) {
          addError(
            28,
            `Route evaluation failed for path "${testCase.path}": expected upstream "${testCase.expectedTarget}", got "${evalResult.upstream}"`,
          );
        }
        evaluatedRoutes.push({
          ...evalResult,
          expectedTarget: testCase.expectedTarget,
          passed: matchesTarget,
        });
      } catch (err) {
        addError(
          29,
          `Route evaluation threw error for path "${testCase.path}": ${err.message}`,
        );
      }
    }
  }

  return finish({
    valid: errors.length === 0,
    filePath,
    errors,
    warnings,
    parsedConfig,
    evaluatedRoutes,
  });
}

const testRoutes = [
  {
    path: "/api/v1/auth/session",
    expectedUpstream: "api",
    expectedTarget: "api:3001",
  },
  { path: "/graphql", expectedUpstream: "api", expectedTarget: "api:3001" },
  { path: "/health", expectedUpstream: "api", expectedTarget: "api:3001" },
  {
    path: "/health/ready",
    expectedUpstream: "api",
    expectedTarget: "api:3001",
  },
  {
    path: "/acres-quarantine/temp-123/file.csv",
    expectedUpstream: "garage",
    expectedTarget: "garage:3900",
  },
  { path: "/", expectedUpstream: "next", expectedTarget: "next:3000" },
  { path: "/login", expectedUpstream: "next", expectedTarget: "next:3000" },
  { path: "/register", expectedUpstream: "next", expectedTarget: "next:3000" },
  { path: "/app", expectedUpstream: "next", expectedTarget: "next:3000" },
  {
    path: "/app/dashboards",
    expectedUpstream: "next",
    expectedTarget: "next:3000",
  },
  {
    path: "/_next/static/chunks/main.js",
    expectedUpstream: "next",
    expectedTarget: "next:3000",
  },
  {
    path: "/favicon.ico",
    expectedUpstream: "next",
    expectedTarget: "next:3000",
  },
];

function parseArgs(args) {
  if (args.length === 1 && ["--help", "-h"].includes(args[0]))
    return { help: true };
  const o = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (["--json", "--allow-hsts"].includes(arg)) {
      const key = arg === "--json" ? "json" : "allowHsts";
      if (Object.hasOwn(o, key)) throw failure("invocation");
      o[key] = true;
    } else if (
      arg === "--output" ||
      arg === "-o" ||
      arg.startsWith("--output=")
    ) {
      if (Object.hasOwn(o, "output")) throw failure("invocation");
      const attached = arg.startsWith("--output=");
      const value = attached ? arg.slice(9) : args[++i];
      if (
        !text(value) ||
        (!attached && value.startsWith("-")) ||
        value.endsWith(path.sep)
      )
        throw failure("invocation");
      o.output = path.resolve(value);
      if (o.output === path.parse(o.output).root) throw failure("invocation");
    } else {
      if (!text(arg) || arg.startsWith("-") || Object.hasOwn(o, "source"))
        throw failure("invocation");
      o.source = path.resolve(arg);
    }
  }
  return o;
}
function safeDomain(domain) {
  if (domain === "{$ACRES_PRODUCTION_DOMAIN}") return domain;
  if (typeof domain !== "string" || domain.length > 253) return null;
  // Intentional restricted evidence identity, not an arbitrary site-header echo.
  return /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/.test(
    domain,
  )
    ? domain
    : null;
}
function projectReport(result, targetPath, allowHsts) {
  const site = result.parsedConfig?.siteBlocks?.[0];
  const knownTargets = ["api:3001", "garage:3900", "next:3000"];
  return {
    drill_type: "caddy_routing_and_tls_verification",
    timestamp: new Date().toISOString(),
    status: result.valid ? "success" : "failed",
    valid: result.valid,
    execution_mode: "simulation",
    targetPath,
    domain: safeDomain(site?.domain),
    hstsApproved: Boolean(allowHsts && site?.hstsEnabled && result.valid),
    securityHeadersVerified: result.valid,
    s3SigV4HostPreserved: Boolean(
      result.valid &&
      site?.proxies.some(
        (p) => p.matcher === "@objects" && p.headersUp.Host === "{host}",
      ),
    ),
    proxyHeadersVerified: Boolean(
      result.valid &&
      site?.proxies.some(
        (p) =>
          p.matcher === "@api" &&
          p.headersUp["X-Forwarded-Host"] === "{host}" &&
          p.headersUp["X-Forwarded-Proto"] === "{scheme}",
      ),
    ),
    routesEvaluated: result.evaluatedRoutes.length,
    routesPassed: result.evaluatedRoutes.filter((r) => r.passed).length,
    evaluatedRoutes: result.evaluatedRoutes.map((r) => ({
      requestPath: r.requestPath,
      method: r.method,
      expectedTarget: r.expectedTarget,
      upstream: knownTargets.includes(r.upstream) ? r.upstream : "unrecognized",
      upstreamName: ["api", "objects", "next"].includes(r.upstreamName)
        ? r.upstreamName
        : "unrecognized",
      matcher: ["@api", "@objects", null].includes(r.matcher)
        ? r.matcher
        : "unrecognized",
      passed: r.passed,
    })),
    errors: publicFindings.get(result),
    warnings: result.warnings.map(() => SAFE_WARNING),
  };
}
function exactKeys(value, keys) {
  return (
    isRecord(value) &&
    Object.keys(value).length === keys.length &&
    keys.every((k) => Object.hasOwn(value, k))
  );
}
function validateReport(r) {
  const flags = [
    "hstsApproved",
    "securityHeadersVerified",
    "s3SigV4HostPreserved",
    "proxyHeadersVerified",
  ];
  if (
    !exactKeys(r, [
      "drill_type",
      "timestamp",
      "status",
      "valid",
      "execution_mode",
      "targetPath",
      "domain",
      ...flags,
      "routesEvaluated",
      "routesPassed",
      "evaluatedRoutes",
      "errors",
      "warnings",
    ]) ||
    r.drill_type !== "caddy_routing_and_tls_verification" ||
    r.execution_mode !== "simulation" ||
    typeof r.valid !== "boolean" ||
    r.status !== (r.valid ? "success" : "failed") ||
    !text(r.targetPath) ||
    r.targetPath.length > MAX_SOURCE_BYTES ||
    path.resolve(r.targetPath) !== r.targetPath ||
    !(
      r.domain === null ||
      (r.domain !== null && safeDomain(r.domain) === r.domain)
    ) ||
    typeof r.timestamp !== "string" ||
    !Number.isFinite(Date.parse(r.timestamp)) ||
    new Date(r.timestamp).toISOString() !== r.timestamp ||
    !flags.every((k) => typeof r[k] === "boolean") ||
    !Array.isArray(r.errors) ||
    r.errors.length > 10000 ||
    !r.errors.every((e) => SAFE_ERRORS.includes(e)) ||
    !Array.isArray(r.warnings) ||
    r.warnings.length > 1 ||
    !r.warnings.every((w) => w === SAFE_WARNING) ||
    !Array.isArray(r.evaluatedRoutes) ||
    r.evaluatedRoutes.length > 12 ||
    r.routesEvaluated !== r.evaluatedRoutes.length ||
    r.routesPassed !==
      r.evaluatedRoutes.filter((v) => v?.passed === true).length ||
    !r.evaluatedRoutes.every(
      (v, i) =>
        exactKeys(v, [
          "requestPath",
          "method",
          "expectedTarget",
          "upstream",
          "upstreamName",
          "matcher",
          "passed",
        ]) &&
        v.requestPath === testRoutes[i].path &&
        v.expectedTarget === testRoutes[i].expectedTarget &&
        v.method === "GET" &&
        ["api:3001", "garage:3900", "next:3000", "unrecognized"].includes(
          v.upstream,
        ) &&
        ["api", "objects", "next", "unrecognized"].includes(v.upstreamName) &&
        ["@api", "@objects", null, "unrecognized"].includes(v.matcher) &&
        typeof v.passed === "boolean" &&
        v.passed === (v.upstream === v.expectedTarget),
    ) ||
    r.valid !==
      (r.errors.length === 0 &&
        r.routesEvaluated === 12 &&
        r.routesPassed === 12) ||
    (r.valid && !flags.slice(1).every((k) => r[k])) ||
    (!r.valid && flags.some((k) => r[k]))
  )
    throw failure("serialization");
}
function serializeReport(report, saving) {
  validateReport(report);
  const bytes = Buffer.from(JSON.stringify(report, null, 2) + "\n");
  if (saving && bytes.length > MAX_SAVED_BYTES) throw failure("serialization");
  return bytes;
}
function sameFile(a, b) {
  return a.dev === b.dev && a.ino === b.ino;
}
function statOrMissing(file) {
  try {
    return fs.lstatSync(file);
  } catch (e) {
    if (e.code === "ENOENT") return null;
    throw e;
  }
}

// Record existing ancestors, then recheck identities at each publication boundary.
// This narrows ordinary substitution races, not attacks by a hostile same-UID admin.
function outputPreflight(output) {
  const parents = new Map();
  let current = path.parse(output).root;
  const root = fs.lstatSync(current);
  if (!root.isDirectory() || root.isSymbolicLink())
    throw failure("publication");
  parents.set(current, root);
  for (const part of path
    .dirname(output)
    .slice(current.length)
    .split(path.sep)
    .filter(Boolean)) {
    current = path.join(current, part);
    const stat = statOrMissing(current);
    if (stat) {
      if (!stat.isDirectory() || stat.isSymbolicLink())
        throw failure("publication");
      parents.set(current, stat);
    }
  }
  if (statOrMissing(output)) throw failure("publication");
  return parents;
}

function checkParents(output, parents, create = false) {
  let current = path.parse(output).root;
  const check = () => {
    let stat = statOrMissing(current);
    if (!stat && parents.has(current)) throw failure("publication");
    if (!stat && create) {
      fs.mkdirSync(current, { mode: 0o700 });
      stat = fs.lstatSync(current);
      parents.set(current, stat);
    }
    if (
      !stat ||
      !stat.isDirectory() ||
      stat.isSymbolicLink() ||
      (parents.has(current) && !sameFile(stat, parents.get(current)))
    )
      throw failure("publication");
    parents.set(current, stat);
  };
  check();
  for (const part of path
    .dirname(output)
    .slice(current.length)
    .split(path.sep)
    .filter(Boolean)) {
    current = path.join(current, part);
    check();
  }
}

function publishReport(output, parents, bytes) {
  const temporary = path.join(
    path.dirname(output),
    `.caddy-${crypto.randomUUID()}.tmp`,
  );
  let fd = null,
    owned = null,
    readFd = null,
    cleanupFailed = false;
  const close = (reading = false) => {
    const value = reading ? readFd : fd;
    if (value !== null) {
      fs.closeSync(value);
      if (reading) readFd = null;
      else fd = null;
    }
  };
  const clean = () => {
    if (!owned && fd !== null) {
      try {
        owned = fs.fstatSync(fd);
      } catch {
        cleanupFailed = true;
      }
    }
    for (const reading of [true, false]) {
      try {
        close(reading);
      } catch {
        cleanupFailed = true;
      }
    }
    if (owned) {
      try {
        checkParents(output, parents);
        const named = statOrMissing(temporary);
        if (named && (!named.isFile() || !sameFile(named, owned)))
          throw failure("cleanup");
        if (named) fs.unlinkSync(temporary);
        owned = null; // Only release ownership after successful unlink/confirmed absence.
      } catch {
        cleanupFailed = true;
      }
    }
  };
  let operationFailed = false;
  try {
    checkParents(output, parents, true);
    if (statOrMissing(output)) throw failure("publication");
    fd = fs.openSync(
      temporary,
      fs.constants.O_WRONLY |
        fs.constants.O_CREAT |
        fs.constants.O_EXCL |
        fs.constants.O_NOFOLLOW,
      0o600,
    );
    owned = fs.fstatSync(fd);
    if (!owned.isFile()) throw failure("publication");
    let offset = 0;
    while (offset < bytes.length) {
      const n = fs.writeSync(fd, bytes, offset, bytes.length - offset, null);
      if (!Number.isInteger(n) || n <= 0 || n > bytes.length - offset)
        throw failure("publication");
      offset += n;
    }
    close();
    checkParents(output, parents);
    const named = fs.lstatSync(temporary);
    if (
      !named.isFile() ||
      !sameFile(named, owned) ||
      named.size !== bytes.length ||
      named.size > MAX_SAVED_BYTES
    )
      throw failure("publication");
    readFd = fs.openSync(
      temporary,
      fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK,
    );
    const opened = fs.fstatSync(readFd);
    if (
      !opened.isFile() ||
      !sameFile(opened, owned) ||
      opened.size !== bytes.length
    )
      throw failure("publication");
    const actual = Buffer.alloc(bytes.length + 1);
    let used = 0;
    while (used < actual.length) {
      const n = fs.readSync(readFd, actual, used, actual.length - used, null);
      if (!Number.isInteger(n) || n < 0 || n > actual.length - used)
        throw failure("publication");
      if (n === 0) break;
      used += n;
    }
    const after = fs.fstatSync(readFd);
    if (
      used !== bytes.length ||
      after.size !== bytes.length ||
      after.mtimeMs !== opened.mtimeMs ||
      after.ctimeMs !== opened.ctimeMs ||
      !actual.subarray(0, used).equals(bytes)
    )
      throw failure("publication");
    validateReport(JSON.parse(actual.subarray(0, used).toString("utf8")));
    close(true);
    checkParents(output, parents);
    const final = fs.lstatSync(temporary);
    if (
      !final.isFile() ||
      !sameFile(final, owned) ||
      final.size !== bytes.length ||
      final.mtimeMs !== after.mtimeMs ||
      final.ctimeMs !== after.ctimeMs
    )
      throw failure("publication");
    fs.linkSync(temporary, output); // Atomic exclusive publication; no overwrite fallback.
  } catch {
    operationFailed = true;
  } finally {
    clean();
    // Retain ownership when a cleanup operation fails; retry only our resources once.
    if (fd !== null || readFd !== null || owned !== null) clean();
  }
  if (cleanupFailed) throw failure("cleanup");
  if (operationFailed) throw failure("publication");
}

const HELP = `Usage: node scripts/ops/verify-caddy-routing.js [Caddyfile] [options]
  --json                Print one complete simulation report
  --allow-hsts          Verify active HSTS after explicit approval
  --output, -o FILE     Save to a fresh absent destination (at most 1 MiB)
  --output=FILE         Attached literal output path, including dash-leading names
  --help, -h            Standalone help; no evaluation or saving
Explicit relative paths use caller cwd; the default is installation-anchored.
Sources must be regular files (ordinary symlinks supported), at most 1 MiB.
New output parents are private; retained evidence and symlink ancestors are rejected.
Static configuration simulation only; no live DNS, TLS or HTTPS measurement.
`;
function humanOutput(r, saved) {
  return (
    [
      "Acres Caddy Ingress & Route Verifier (Simulation Preflight)",
      `Target Caddyfile: ${r.targetPath}`,
      ...r.evaluatedRoutes.map(
        (v) => ` ${v.passed ? "✓" : "✗"} ${v.requestPath} -> ${v.upstream}`,
      ),
      ...r.errors,
      ...r.warnings,
      ...(saved ? ["Caddy simulation evidence published"] : []),
      `Status: ${r.valid ? "PASSED" : "FAILED"} (simulation; live DNS, TLS and HTTPS inspection required)`,
    ].join("\n") + "\n"
  );
}
function main(args) {
  let category = "invocation",
    outputFault = false;
  const diagnostic = (value) => {
    process.exitCode = 1;
    try {
      process.stderr.write(`Caddy ${value} failed\n`, () => {});
    } catch {
      /* stderr unavailable */
    }
  };
  process.stderr.on("error", () => {
    process.exitCode = 1;
  });
  process.stdout.on("error", () => {
    if (!outputFault) {
      outputFault = true;
      diagnostic("output");
    }
  });
  const print = (value) =>
    process.stdout.write(value, (e) => {
      if (e && !outputFault) {
        outputFault = true;
        diagnostic("output");
      }
    });
  try {
    const options = parseArgs(args);
    if (options.help) {
      category = "output";
      print(HELP);
      return;
    }
    category = "publication";
    const parents = options.output ? outputPreflight(options.output) : null;
    const targetPath = options.source ?? DEFAULT_CADDYFILE_PATH;
    let result;
    try {
      const content = readSource(targetPath);
      if (content === null) throw failure("evaluation");
      // CLI source bytes are never interpreted as a path by the direct-call heuristic.
      result = verifyContent(content, {
        allowHsts: options.allowHsts ?? false,
      });
    } catch {
      result = {
        valid: false,
        parsedConfig: null,
        evaluatedRoutes: [],
        warnings: [],
      };
      publicFindings.set(result, [SAFE_ERRORS[30]]);
    }
    category = "serialization";
    const report = projectReport(result, targetPath, options.allowHsts);
    const bytes = serializeReport(report, Boolean(options.output));
    if (options.output) {
      category = "publication";
      try {
        publishReport(options.output, parents, bytes);
      } catch (e) {
        if (e.message === "Caddy cleanup failed") category = "cleanup";
        throw e;
      }
    }
    category = "output";
    if (!report.valid) process.exitCode = 1;
    print(options.json ? bytes : humanOutput(report, Boolean(options.output)));
  } catch {
    diagnostic(category);
  }
}
if (require.main === module) main(process.argv.slice(2));

module.exports = {
  parseCaddyfile,
  evaluateRoute,
  verifyCaddyfile,
  DEFAULT_CADDYFILE_PATH,
};
