#!/usr/bin/env node
/**
 * scripts/ops/run-sast-scan.js
 *
 * Deterministic Static Application Security Testing (SAST) Scanner & Triage Policy Engine.
 * Scans JavaScript and TypeScript source files for 8 core vulnerability patterns.
 * Evaluates findings against infra/security/sast-triage.json with fail-closed expiration gating.
 */

const fs = require('fs');
const path = require('path');

const SEVERITY_LEVELS = {
  BLOCKER: 4,
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1,
};

const SAST_RULES = [
  {
    id: 'SAST-01',
    name: 'SQL Injection',
    severity: 'BLOCKER',
    description: 'Unsafe raw SQL execution ($queryRawUnsafe, $executeRawUnsafe) or unparameterized query concatenation.',
    check: (line, content) => {
      if (/\$(?:queryRawUnsafe|executeRawUnsafe)\s*\(/.test(line)) {
        return 'Call to unsafe raw query method ($queryRawUnsafe/$executeRawUnsafe)';
      }
      if (/\bPrisma\.raw\s*\(/.test(line)) {
        return 'Call to Prisma.raw which bypasses parameterized query construction';
      }
      if (/\$queryRaw\s*`\s*(?:SELECT|INSERT|UPDATE|DELETE)[^`]*\$\{[^}]+\}/i.test(line)) {
        return 'Direct string interpolation in $queryRaw template literal without Prisma.sql';
      }
      if (/\bquery\s*\(\s*["'`]\s*(?:SELECT|INSERT|UPDATE|DELETE)[^"'`]*["'`]\s*\+/i.test(line)) {
        return 'Raw SQL string concatenation in query call';
      }
      return null;
    },
  },
  {
    id: 'SAST-02',
    name: 'Command Injection',
    severity: 'BLOCKER',
    description: 'Unvalidated child_process command execution or shell: true invocation.',
    check: (line) => {
      if (/\b(?:child_process\.)?exec(?:Sync)?\s*\(\s*`[^`]*\$\{[^`]+\}/.test(line)) {
        return 'Interpolation in child_process.exec/execSync command string';
      }
      if (/\b(?:child_process\.)?exec(?:Sync)?\s*\([^,)]*\+/.test(line)) {
        return 'String concatenation in child_process.exec/execSync call';
      }
      if (/\bshell\s*:\s*true\b/.test(line)) {
        return 'Child process spawned with shell: true option';
      }
      return null;
    },
  },
  {
    id: 'SAST-03',
    name: 'Path Traversal',
    severity: 'HIGH',
    description: 'Unvalidated relative directory traversal or unsanitized path joining in fs calls.',
    check: (line) => {
      if (/(?:readFile|readFileSync|writeFile|writeFileSync|createReadStream|createWriteStream)\s*\([^,)]*(?:\.\.\/|\.\.\\)/.test(line)) {
        return 'Hardcoded relative path traversal ("../") in filesystem call';
      }
      if (/(?:readFile|readFileSync)\s*\([^,)]*\+\s*(?:req|params|query|body)\./.test(line)) {
        return 'Direct concatenation of request input into filesystem call without normalization';
      }
      return null;
    },
  },
  {
    id: 'SAST-04',
    name: 'Hardcoded Secrets',
    severity: 'BLOCKER',
    description: 'Hardcoded private keys, tokens, or credential strings in source files.',
    check: (line) => {
      if (/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(line)) {
        return 'Hardcoded private key block detected';
      }
      if (/\b(?:sk-[a-zA-Z0-9]{24,}|ghp_[a-zA-Z0-9]{36}|AIza[0-9A-Za-z-_]{35})\b/.test(line)) {
        return 'Hardcoded third-party API secret or token';
      }
      if (/(?:postgres|postgresql|valkey|redis|mysql):\/\/[^:\s'"]+:[^@\s'"]+@/.test(line) && !line.includes('${') && !line.includes('localhost')) {
        return 'Hardcoded database connection string with password';
      }
      if (/jwt\.sign\s*\([^,]+,\s*['"][a-zA-Z0-9_!@#$%^&*-]{6,}['"]/.test(line)) {
        return 'Hardcoded secret passed directly to jwt.sign';
      }
      return null;
    },
  },
  {
    id: 'SAST-05',
    name: 'Regular Expression Denial of Service (ReDoS)',
    severity: 'HIGH',
    description: 'Regular expression containing nested repetition quantifiers vulnerable to catastrophic backtracking.',
    check: (line) => {
      // Look for regex literals with nested quantifiers: (pattern+)+, ([a-z]+)*, etc.
      // Match /.../ with (something[+*]) followed by [+*]
      const regexMatch = line.match(/\/(?:[^\/\\]|\\.)+\/[a-z]*/);
      if (regexMatch) {
        const pattern = regexMatch[0];
        if (/\([^()]*[+*][^()]*\)[+*]/.test(pattern)) {
          return `Potentially catastrophic ReDoS pattern with nested quantifiers: ${pattern}`;
        }
      }
      return null;
    },
  },
  {
    id: 'SAST-06',
    name: 'Tenant Isolation Bypass',
    severity: 'BLOCKER',
    description: 'Direct queries on multi-tenant Prisma models without organization scoping.',
    check: (line, content, filePath, lineNum, lines) => {
      // Only enforce in server source files handling business logic
      if (!filePath || !filePath.startsWith('server/src/') || filePath.includes('/seed/') || filePath.includes('/migrations/')) {
        return null;
      }
      if (/(?:this\.prisma|tx|client|prisma)\.(?:dataset|membership|invitation|report|dashboardView|metricObservation)\.findMany\b/.test(line)) {
        let hasWhere = line.includes('where');
        if (!hasWhere) {
          const allLines = lines || (content ? content.split('\n') : [line]);
          const currentLineIdx = typeof lineNum === 'number' ? lineNum - 1 : 0;
          const searchEnd = Math.min(allLines.length, currentLineIdx + 15);
          for (let i = currentLineIdx; i < searchEnd; i++) {
            const nextLine = allLines[i];
            if (/\bwhere\s*:/.test(nextLine)) {
              hasWhere = true;
              break;
            }
            if (i > currentLineIdx && /\)\s*;?\s*$/.test(nextLine.trim())) {
              break;
            }
          }
        }
        if (!hasWhere) {
          return 'Unfiltered findMany query on multi-tenant model without explicit where clause';
        }
      }
      return null;
    },
  },
  {
    id: 'SAST-07',
    name: 'Stored XSS / Dangerous HTML',
    severity: 'HIGH',
    description: 'Dangerous DOM HTML insertion or unsanitized script injection in client components.',
    check: (line) => {
      if (/dangerouslySetInnerHTML\s*=/.test(line)) {
        return 'Usage of dangerouslySetInnerHTML property';
      }
      if (/\.(?:innerHTML|outerHTML)\s*=\s*/.test(line)) {
        return 'Direct assignment to innerHTML/outerHTML';
      }
      if (/document\.write\s*\(/.test(line)) {
        return 'Call to document.write';
      }
      return null;
    },
  },
  {
    id: 'SAST-08',
    name: 'Insecure Cryptography',
    severity: 'HIGH',
    description: 'Usage of weak cryptographic hash algorithms (MD5, SHA1) or deprecated cipher APIs.',
    check: (line) => {
      if (/createHash\s*\(\s*['"](?:md5|sha1)['"]\s*\)/i.test(line)) {
        return 'Usage of insecure hash algorithm (MD5/SHA1)';
      }
      if (/crypto\.createCipher\s*\(/.test(line)) {
        return 'Usage of deprecated crypto.createCipher (use createCipheriv)';
      }
      return null;
    },
  },
];

/**
 * Checks if a file path should be ignored by the SAST scanner.
 */
function shouldIgnorePath(relPath) {
  const normalized = relPath.replace(/\\/g, '/');

  // Directory exclusions
  if (
    normalized.includes('node_modules/') ||
    normalized.includes('/dist/') ||
    normalized.startsWith('dist/') ||
    normalized.includes('/.next/') ||
    normalized.startsWith('.next/') ||
    normalized.includes('/coverage/') ||
    normalized.startsWith('coverage/') ||
    normalized.includes('/generated/') ||
    normalized.includes('/.git/') ||
    normalized.startsWith('.git/')
  ) {
    return true;
  }

  // File extension checks
  const ext = path.extname(normalized);
  if (!['.ts', '.tsx', '.js', '.mjs', '.cjs'].includes(ext)) {
    return true;
  }

  // Exclude test files
  if (
    normalized.endsWith('.spec.ts') ||
    normalized.endsWith('.spec.js') ||
    normalized.endsWith('.test.ts') ||
    normalized.endsWith('.test.js') ||
    normalized.endsWith('.e2e-spec.ts') ||
    normalized.includes('/test/') ||
    normalized.includes('/tests/')
  ) {
    return true;
  }

  // Exclude examples and template mocks
  if (normalized.includes('.example.') || normalized.includes('.mock.')) {
    return true;
  }

  // Exclude scanner self-references
  if (
    normalized === 'scripts/ops/run-sast-scan.js' ||
    normalized === 'scripts/ops/run-sast-scan.spec.js'
  ) {
    return true;
  }

  return false;
}

/**
 * Recursively discovers in-scope source files.
 */
function findSourceFiles(dirPath, rootDir) {
  const fullDirPath = path.resolve(rootDir, dirPath);
  if (!fs.existsSync(fullDirPath)) return [];

  const results = [];
  const entries = fs.readdirSync(fullDirPath, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(fullDirPath, entry.name);
    const relPath = path.relative(rootDir, fullPath).replace(/\\/g, '/');

    if (entry.isDirectory()) {
      if (
        entry.name === 'node_modules' ||
        entry.name === 'dist' ||
        entry.name === '.next' ||
        entry.name === 'coverage' ||
        entry.name === '.git'
      ) {
        continue;
      }
      results.push(...findSourceFiles(relPath, rootDir));
    } else if (entry.isFile()) {
      if (!shouldIgnorePath(relPath)) {
        results.push(relPath);
      }
    }
  }

  return results;
}

/**
 * Scans a single file for security rule matches.
 */
function scanFile(relPath, rootDir, rules = SAST_RULES) {
  const fullPath = path.resolve(rootDir, relPath);
  const content = fs.readFileSync(fullPath, 'utf8');
  const lines = content.split('\n');
  const findings = [];

  for (let lineNum = 1; lineNum <= lines.length; lineNum++) {
    const line = lines[lineNum - 1];

    for (const rule of rules) {
      const matchReason = rule.check(line, content, relPath, lineNum, lines);
      if (matchReason) {
        findings.push({
          ruleId: rule.id,
          ruleName: rule.name,
          severity: rule.severity,
          file: relPath,
          line: lineNum,
          snippet: line.trim(),
          reason: matchReason,
          description: rule.description,
        });
      }
    }
  }

  return findings;
}

/**
 * Loads and parses triage policy file.
 */
function loadTriagePolicy(triagePath) {
  if (!fs.existsSync(triagePath)) {
    return { version: '1.0.0', suppressions: [] };
  }
  return JSON.parse(fs.readFileSync(triagePath, 'utf8'));
}

/**
 * Evaluates findings against triage policy.
 */
function evaluateTriage(findings, triagePolicy, now = new Date()) {
  const suppressions = triagePolicy.suppressions || [];
  const triaged = [];
  const expired = [];
  const active = [];

  for (const finding of findings) {
    const matchingSuppression = suppressions.find((s) => {
      if (s.rule_id !== finding.ruleId) return false;
      const normalizedSuppPath = s.path.replace(/\\/g, '/');
      const normalizedFindingPath = finding.file.replace(/\\/g, '/');
      if (normalizedFindingPath !== normalizedSuppPath) return false;

      if (typeof s.line === 'number' && finding.line !== s.line) {
        return false;
      }
      if (Array.isArray(s.lines) && !s.lines.includes(finding.line)) {
        return false;
      }
      if (typeof s.snippet === 'string' && !finding.snippet.includes(s.snippet)) {
        return false;
      }

      return true;
    });

    if (matchingSuppression) {
      const expiresAt = new Date(matchingSuppression.expires_at);
      if (expiresAt < now) {
        expired.push({
          finding,
          suppression: matchingSuppression,
          expiredAt: matchingSuppression.expires_at,
        });
      } else {
        triaged.push({
          finding,
          suppression: matchingSuppression,
        });
      }
    } else {
      active.push(finding);
    }
  }

  return {
    triaged,
    expired,
    active,
  };
}

/**
 * Runs full SAST scan across the repository.
 */
function runSastScan(options = {}) {
  const rootDir = options.rootDir || path.resolve(__dirname, '../..');
  const roots = options.roots || ['client', 'server', 'packages/shared', 'scripts'];
  const triagePath = options.triagePath || path.join(rootDir, 'infra/security/sast-triage.json');
  const failOnSeverity = options.failOnSeverity || 'BLOCKER';
  const thresholdLevel = SEVERITY_LEVELS[failOnSeverity] ?? SEVERITY_LEVELS.BLOCKER;
  const now = options.now || new Date();

  const allFiles = [];
  for (const r of roots) {
    allFiles.push(...findSourceFiles(r, rootDir));
  }

  // Deduplicate and sort
  const files = Array.from(new Set(allFiles)).sort();

  const allFindings = [];
  for (const f of files) {
    const fileFindings = scanFile(f, rootDir);
    allFindings.push(...fileFindings);
  }

  const triagePolicy = loadTriagePolicy(triagePath);
  const triageResult = evaluateTriage(allFindings, triagePolicy, now);

  // Unreviewed findings that meet or exceed failOn threshold
  const blockingActive = triageResult.active.filter(
    (f) => (SEVERITY_LEVELS[f.severity] || 0) >= thresholdLevel
  );

  // Expired suppressions always fail closed as blockers
  const blockingExpired = triageResult.expired;

  const passed = blockingActive.length === 0 && blockingExpired.length === 0;

  return {
    scannedFilesCount: files.length,
    totalFindingsCount: allFindings.length,
    activeFindings: triageResult.active,
    blockingActiveFindings: blockingActive,
    triagedFindings: triageResult.triaged,
    expiredFindings: triageResult.expired,
    passed,
    failOnSeverity,
  };
}

// CLI runner
if (require.main === module) {
  const args = process.argv.slice(2);
  const formatJson = args.includes('--json') || args.includes('--format') && args[args.indexOf('--format') + 1] === 'json';
  const failOnIdx = args.indexOf('--fail-on');
  const failOnSeverity = failOnIdx !== -1 && args[failOnIdx + 1] ? args[failOnIdx + 1].toUpperCase() : 'BLOCKER';
  const triageIdx = args.indexOf('--triage');
  const triagePath = triageIdx !== -1 && args[triageIdx + 1] ? path.resolve(args[triageIdx + 1]) : undefined;

  try {
    const result = runSastScan({ failOnSeverity, triagePath });

    if (formatJson) {
      console.log(JSON.stringify(result, null, 2));
      process.exit(result.passed ? 0 : 1);
    }

    console.log('Deterministic SAST Scan Results:');
    console.log(`  Files scanned:         ${result.scannedFilesCount}`);
    console.log(`  Total rule matches:    ${result.totalFindingsCount}`);
    console.log(`  Triaged suppressions:  ${result.triagedFindings.length}`);
    console.log(`  Expired suppressions:  ${result.expiredFindings.length}`);
    console.log(`  Active untriaged:      ${result.activeFindings.length}`);
    console.log(`  Failing threshold:     >= ${result.failOnSeverity}`);

    if (result.triagedFindings.length > 0) {
      console.log('\nApproved Suppressions:');
      for (const t of result.triagedFindings) {
        console.log(`  ✔ [${t.suppression.id}] ${t.finding.ruleId} ${t.finding.file}:${t.finding.line}`);
        console.log(`    Rationale: ${t.suppression.rationale}`);
      }
    }

    if (result.expiredFindings.length > 0) {
      console.error('\nEXPIRED Suppressions (fail-closed):');
      for (const exp of result.expiredFindings) {
        console.error(`  ✖ [${exp.suppression.id}] ${exp.finding.ruleId} ${exp.finding.file}:${exp.finding.line}`);
        console.error(`    Expired on: ${exp.expiredAt}`);
      }
    }

    if (result.blockingActiveFindings.length > 0) {
      console.error(`\nActive Security Findings (>= ${result.failOnSeverity}):`);
      for (const f of result.blockingActiveFindings) {
        console.error(`  ✖ [${f.ruleId}] (${f.severity}) ${f.file}:${f.line}`);
        console.error(`    ${f.reason}`);
        console.error(`    Code: ${f.snippet}`);
      }
    }

    if (result.passed) {
      console.log('\nSAST Gate: PASSED (Zero unreviewed blockers and zero expired suppressions)');
      process.exit(0);
    } else {
      console.error('\nSAST Gate: FAILED');
      process.exit(1);
    }
  } catch (err) {
    console.error(`Failed to execute SAST scan: ${err.message}`);
    process.exit(1);
  }
}

module.exports = {
  SEVERITY_LEVELS,
  SAST_RULES,
  shouldIgnorePath,
  findSourceFiles,
  scanFile,
  loadTriagePolicy,
  evaluateTriage,
  runSastScan,
};
