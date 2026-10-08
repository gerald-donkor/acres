#!/usr/bin/env node
/**
 * scripts/ops/run-sast-scan.js
 *
 * Deterministic Static Application Security Testing (SAST) Scanner & Triage Policy Engine.
 * Scans JavaScript and TypeScript source files for 8 core vulnerability patterns.
 * Evaluates findings against infra/security/sast-triage.json with fail-closed expiration gating.
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const SEVERITY_LEVELS = {
  BLOCKER: 4,
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1,
};

const SAST_RULES = [
  {
    id: "SAST-01",
    name: "SQL Injection",
    severity: "BLOCKER",
    description:
      "Unsafe raw SQL execution ($queryRawUnsafe, $executeRawUnsafe) or unparameterized query concatenation.",
    check: (line, content) => {
      if (/\$(?:queryRawUnsafe|executeRawUnsafe)\s*\(/.test(line)) {
        return "Call to unsafe raw query method ($queryRawUnsafe/$executeRawUnsafe)";
      }
      if (/\bPrisma\.raw\s*\(/.test(line)) {
        return "Call to Prisma.raw which bypasses parameterized query construction";
      }
      if (
        /\$queryRaw\s*`\s*(?:SELECT|INSERT|UPDATE|DELETE)[^`]*\$\{[^}]+\}/i.test(
          line,
        )
      ) {
        return "Direct string interpolation in $queryRaw template literal without Prisma.sql";
      }
      if (
        /\bquery\s*\(\s*["'`]\s*(?:SELECT|INSERT|UPDATE|DELETE)[^"'`]*["'`]\s*\+/i.test(
          line,
        )
      ) {
        return "Raw SQL string concatenation in query call";
      }
      return null;
    },
  },
  {
    id: "SAST-02",
    name: "Command Injection",
    severity: "BLOCKER",
    description:
      "Unvalidated child_process command execution or shell: true invocation.",
    check: (line) => {
      if (
        /\b(?:child_process\.)?exec(?:Sync)?\s*\(\s*`[^`]*\$\{[^`]+\}/.test(
          line,
        )
      ) {
        return "Interpolation in child_process.exec/execSync command string";
      }
      if (/\b(?:child_process\.)?exec(?:Sync)?\s*\([^,)]*\+/.test(line)) {
        return "String concatenation in child_process.exec/execSync call";
      }
      if (/\bshell\s*:\s*true\b/.test(line)) {
        return "Child process spawned with shell: true option";
      }
      return null;
    },
  },
  {
    id: "SAST-03",
    name: "Path Traversal",
    severity: "HIGH",
    description:
      "Unvalidated relative directory traversal or unsanitized path joining in fs calls.",
    check: (line) => {
      if (
        /(?:readFile|readFileSync|writeFile|writeFileSync|createReadStream|createWriteStream)\s*\([^,)]*(?:\.\.\/|\.\.\\)/.test(
          line,
        )
      ) {
        return 'Hardcoded relative path traversal ("../") in filesystem call';
      }
      if (
        /(?:readFile|readFileSync)\s*\([^,)]*\+\s*(?:req|params|query|body)\./.test(
          line,
        )
      ) {
        return "Direct concatenation of request input into filesystem call without normalization";
      }
      return null;
    },
  },
  {
    id: "SAST-04",
    name: "Hardcoded Secrets",
    severity: "BLOCKER",
    description:
      "Hardcoded private keys, tokens, or credential strings in source files.",
    check: (line) => {
      if (/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(line)) {
        return "Hardcoded private key block detected";
      }
      if (
        /\b(?:sk-[a-zA-Z0-9]{24,}|ghp_[a-zA-Z0-9]{36}|AIza[0-9A-Za-z-_]{35})\b/.test(
          line,
        )
      ) {
        return "Hardcoded third-party API secret or token";
      }
      if (
        /(?:postgres|postgresql|valkey|redis|mysql):\/\/[^:\s'"]+:[^@\s'"]+@/.test(
          line,
        ) &&
        !line.includes("${") &&
        !line.includes("localhost")
      ) {
        return "Hardcoded database connection string with password";
      }
      if (
        /jwt\.sign\s*\([^,]+,\s*['"][a-zA-Z0-9_!@#$%^&*-]{6,}['"]/.test(line)
      ) {
        return "Hardcoded secret passed directly to jwt.sign";
      }
      return null;
    },
  },
  {
    id: "SAST-05",
    name: "Regular Expression Denial of Service (ReDoS)",
    severity: "HIGH",
    description:
      "Regular expression containing nested repetition quantifiers vulnerable to catastrophic backtracking.",
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
    id: "SAST-06",
    name: "Tenant Isolation Bypass",
    severity: "BLOCKER",
    description:
      "Direct queries on multi-tenant Prisma models without organization scoping.",
    check: (line, content, filePath, lineNum, lines) => {
      // Only enforce in server source files handling business logic
      if (
        !filePath ||
        !filePath.startsWith("server/src/") ||
        filePath.includes("/seed/") ||
        filePath.includes("/migrations/")
      ) {
        return null;
      }
      if (
        /(?:this\.prisma|tx|client|prisma)\.(?:dataset|membership|invitation|report|dashboardView|metricObservation)\.findMany\b/.test(
          line,
        )
      ) {
        let hasWhere = line.includes("where");
        if (!hasWhere) {
          const allLines = lines || (content ? content.split("\n") : [line]);
          const currentLineIdx = typeof lineNum === "number" ? lineNum - 1 : 0;
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
          return "Unfiltered findMany query on multi-tenant model without explicit where clause";
        }
      }
      return null;
    },
  },
  {
    id: "SAST-07",
    name: "Stored XSS / Dangerous HTML",
    severity: "HIGH",
    description:
      "Dangerous DOM HTML insertion or unsanitized script injection in client components.",
    check: (line) => {
      if (/dangerouslySetInnerHTML\s*=/.test(line)) {
        return "Usage of dangerouslySetInnerHTML property";
      }
      if (/\.(?:innerHTML|outerHTML)\s*=\s*/.test(line)) {
        return "Direct assignment to innerHTML/outerHTML";
      }
      if (/document\.write\s*\(/.test(line)) {
        return "Call to document.write";
      }
      return null;
    },
  },
  {
    id: "SAST-08",
    name: "Insecure Cryptography",
    severity: "HIGH",
    description:
      "Usage of weak cryptographic hash algorithms (MD5, SHA1) or deprecated cipher APIs.",
    check: (line) => {
      if (/createHash\s*\(\s*['"](?:md5|sha1)['"]\s*\)/i.test(line)) {
        return "Usage of insecure hash algorithm (MD5/SHA1)";
      }
      if (/crypto\.createCipher\s*\(/.test(line)) {
        return "Usage of deprecated crypto.createCipher (use createCipheriv)";
      }
      return null;
    },
  },
];

/**
 * Checks if a file path should be ignored by the SAST scanner.
 */
function shouldIgnorePath(relPath) {
  const normalized = relPath.replace(/\\/g, "/");

  // Directory exclusions
  if (
    normalized.includes("node_modules/") ||
    normalized.includes("/dist/") ||
    normalized.startsWith("dist/") ||
    normalized.includes("/.next/") ||
    normalized.startsWith(".next/") ||
    normalized.includes("/coverage/") ||
    normalized.startsWith("coverage/") ||
    normalized.includes("/generated/") ||
    normalized.includes("/.git/") ||
    normalized.startsWith(".git/")
  ) {
    return true;
  }

  // File extension checks
  const ext = path.extname(normalized);
  if (![".ts", ".tsx", ".js", ".mjs", ".cjs"].includes(ext)) {
    return true;
  }

  // Exclude test files
  if (
    normalized.endsWith(".spec.ts") ||
    normalized.endsWith(".spec.js") ||
    normalized.endsWith(".test.ts") ||
    normalized.endsWith(".test.js") ||
    normalized.endsWith(".e2e-spec.ts") ||
    normalized.includes("/test/") ||
    normalized.includes("/tests/")
  ) {
    return true;
  }

  // Exclude examples and template mocks
  if (normalized.includes(".example.") || normalized.includes(".mock.")) {
    return true;
  }

  // Exclude scanner self-references
  if (
    normalized === "scripts/ops/run-sast-scan.js" ||
    normalized === "scripts/ops/run-sast-scan.spec.js"
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
    const relPath = path.relative(rootDir, fullPath).replace(/\\/g, "/");

    if (entry.isDirectory()) {
      if (
        entry.name === "node_modules" ||
        entry.name === "dist" ||
        entry.name === ".next" ||
        entry.name === "coverage" ||
        entry.name === ".git"
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
  const content = fs.readFileSync(fullPath, "utf8");
  const lines = content.split("\n");
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
    return { version: "1.0.0", suppressions: [] };
  }
  return JSON.parse(fs.readFileSync(triagePath, "utf8"));
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
      const normalizedSuppPath = s.path.replace(/\\/g, "/");
      const normalizedFindingPath = finding.file.replace(/\\/g, "/");
      if (normalizedFindingPath !== normalizedSuppPath) return false;

      if (typeof s.line === "number" && finding.line !== s.line) {
        return false;
      }
      if (Array.isArray(s.lines) && !s.lines.includes(finding.line)) {
        return false;
      }
      if (typeof s.snippet === "string" && finding.snippet !== s.snippet) {
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
  validateOptions(options);
  const rootDir = options.rootDir ?? path.resolve(__dirname, "../..");
  const roots = options.roots ?? [
    "client",
    "server",
    "packages/shared",
    "scripts",
  ];
  const triagePath =
    options.triagePath ?? path.join(rootDir, "infra/security/sast-triage.json");
  const failOnSeverity = normalizeSeverity(options.failOnSeverity ?? "BLOCKER");
  const thresholdLevel = SEVERITY_LEVELS[failOnSeverity];
  const now = options.now ?? new Date();

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
    (f) => (SEVERITY_LEVELS[f.severity] || 0) >= thresholdLevel,
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

// CLI/evidence machinery has no import or direct-call save side effect.
const MAX_SAVED_BYTES = 1024 * 1024;
const REDACTED = "[redacted detected secret]";
const text = (value) =>
  typeof value === "string" &&
  value.trim().length > 0 &&
  !/[\x00-\x1f\x7f-\x9f]/.test(value);
const failure = (category) => new Error(`SAST ${category} failed`);

function normalizeSeverity(value) {
  if (!text(value) || !Object.hasOwn(SEVERITY_LEVELS, value.toUpperCase()))
    throw failure("invocation");
  return value.toUpperCase();
}
function validateOptions(options) {
  if (!options || typeof options !== "object" || Array.isArray(options))
    throw failure("invocation");
  for (const key of ["rootDir", "triagePath"])
    if (Object.hasOwn(options, key) && !text(options[key]))
      throw failure("invocation");
  if (
    Object.hasOwn(options, "roots") &&
    (!Array.isArray(options.roots) || !Array.from(options.roots).every(text))
  )
    throw failure("invocation");
  if (Object.hasOwn(options, "failOnSeverity"))
    normalizeSeverity(options.failOnSeverity);
  if (
    Object.hasOwn(options, "now") &&
    (!(options.now instanceof Date) || !Number.isFinite(options.now.getTime()))
  )
    throw failure("invocation");
}
function parseArgs(args) {
  if (args.length === 1 && ["--help", "-h"].includes(args[0]))
    return { help: true };
  const options = {};
  const keys = {
    "--format": "json",
    "--fail-on": "failOnSeverity",
    "--triage": "triagePath",
    "--output": "output",
    "-o": "output",
  };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--json") {
      if (Object.hasOwn(options, "json")) throw failure("invocation");
      options.json = true;
      continue;
    }
    const index = arg.indexOf("=");
    const flag = index < 0 ? arg : arg.slice(0, index);
    if (!Object.hasOwn(keys, flag)) throw failure("invocation");
    const key = keys[flag];
    if (Object.hasOwn(options, key)) throw failure("invocation");
    const attached = index >= 0;
    const value = attached ? arg.slice(index + 1) : args[++i];
    if (!text(value) || (!attached && value.startsWith("-")))
      throw failure("invocation");
    if (key === "json") {
      if (value !== "json") throw failure("invocation");
      options.json = true;
    } else if (key === "failOnSeverity")
      options[key] = normalizeSeverity(value);
    else {
      if (key === "output" && value.endsWith(path.sep))
        throw failure("invocation");
      options[key] = path.resolve(value);
      if (key === "output" && options[key] === path.parse(options[key]).root)
        throw failure("invocation");
    }
  }
  return options;
}

function projectReport(result) {
  const finding = (f) => ({
    ...f,
    ...(f.ruleId === "SAST-04" ? { snippet: REDACTED } : {}),
  });
  const triage = (t) => ({
    ...t,
    finding: finding(t.finding),
    suppression: {
      ...t.suppression,
      ...(t.finding.ruleId === "SAST-04" &&
      typeof t.suppression.snippet === "string"
        ? { snippet: REDACTED }
        : {}),
    },
  });
  return {
    drill_type: "sast_security_scan",
    timestamp: new Date().toISOString(),
    status: result.passed ? "success" : "failed",
    ...result,
    activeFindings: result.activeFindings.map(finding),
    blockingActiveFindings: result.blockingActiveFindings.map(finding),
    triagedFindings: result.triagedFindings.map(triage),
    expiredFindings: result.expiredFindings.map(triage),
  };
}

// Validate local report consistency, not the complete triage-policy schema.
function validateReport(report) {
  const invalid = () => {
    throw failure("serialization");
  };
  if (
    !report ||
    typeof report !== "object" ||
    Array.isArray(report) ||
    report.drill_type !== "sast_security_scan" ||
    typeof report.timestamp !== "string" ||
    !Number.isFinite(Date.parse(report.timestamp)) ||
    new Date(report.timestamp).toISOString() !== report.timestamp ||
    !Number.isSafeInteger(report.scannedFilesCount) ||
    report.scannedFilesCount < 0 ||
    !Number.isSafeInteger(report.totalFindingsCount) ||
    report.totalFindingsCount < 0 ||
    !Object.hasOwn(SEVERITY_LEVELS, report.failOnSeverity)
  )
    invalid();
  for (const key of [
    "activeFindings",
    "blockingActiveFindings",
    "triagedFindings",
    "expiredFindings",
  ])
    if (!Array.isArray(report[key])) invalid();
  const validateFinding = (f) => {
    if (
      !f ||
      !SAST_RULES.some(
        (r) =>
          r.id === f.ruleId &&
          r.name === f.ruleName &&
          r.severity === f.severity &&
          r.description === f.description,
      ) ||
      !text(f.file) ||
      !Number.isSafeInteger(f.line) ||
      f.line < 1 ||
      typeof f.snippet !== "string" ||
      !text(f.reason) ||
      (f.ruleId === "SAST-04" && f.snippet !== REDACTED)
    )
      invalid();
  };
  report.activeFindings.forEach(validateFinding);
  report.blockingActiveFindings.forEach(validateFinding);
  for (const key of ["triagedFindings", "expiredFindings"])
    for (const t of report[key]) {
      if (
        !t ||
        !t.suppression ||
        typeof t.suppression !== "object" ||
        Array.isArray(t.suppression)
      )
        invalid();
      validateFinding(t.finding);
      if (
        t.finding.ruleId === "SAST-04" &&
        Object.hasOwn(t.suppression, "snippet") &&
        t.suppression.snippet !== REDACTED
      )
        invalid();
      if (key === "expiredFindings" && t.expiredAt !== t.suppression.expires_at)
        invalid();
    }
  const expected = report.activeFindings.filter(
    (f) =>
      SEVERITY_LEVELS[f.severity] >= SEVERITY_LEVELS[report.failOnSeverity],
  );
  if (
    JSON.stringify(expected) !==
      JSON.stringify(report.blockingActiveFindings) ||
    report.totalFindingsCount !==
      report.activeFindings.length +
        report.triagedFindings.length +
        report.expiredFindings.length ||
    (report.totalFindingsCount > 0 && report.scannedFilesCount === 0)
  )
    invalid();
  const passed = expected.length === 0 && report.expiredFindings.length === 0;
  if (
    report.passed !== passed ||
    report.status !== (passed ? "success" : "failed")
  )
    invalid();
}
function serializeReport(report, saving) {
  validateReport(report);
  const bytes = Buffer.from(JSON.stringify(report, null, 2) + "\n");
  if (saving && bytes.length > MAX_SAVED_BYTES) throw failure("serialization");
  validateReport(JSON.parse(bytes.toString("utf8")));
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
    `.sast-${crypto.randomUUID()}.tmp`,
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
      if (!n) break;
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

const HELP = `Usage: scripts/ops/run-sast-scan.js [options]
  --json, --format json  Print one complete report (alternative declarations)
  --fail-on LEVEL       BLOCKER (default), HIGH, MEDIUM or LOW; case-insensitive
  --triage FILE         Use a literal policy path (missing policy is empty)
  --output, -o FILE     Save to a fresh absent destination, at most 1 MiB
  --help, -h            Standalone help, no scanning or saving
Value switches also accept =VALUE, including literal dash-leading paths.
Defaults scan the installed repository; relative paths use caller cwd.
Paths are literal: spaces are supported; no shell, variable or tilde expansion.
Expired matching suppressions always fail; active findings fail at the threshold.
Saving rejects retained destinations and symlink ancestors; new parents are private.
Failed evaluations print/save complete evidence and exit nonzero.
Local regex evidence redacts detected-secret snippets; it is not launch approval.
`;
function humanOutput(report, saved) {
  const lines = [
    "Deterministic SAST Scan Results:",
    `  Files scanned:         ${report.scannedFilesCount}`,
    `  Total rule matches:    ${report.totalFindingsCount}`,
    `  Triaged suppressions:  ${report.triagedFindings.length}`,
    `  Expired suppressions:  ${report.expiredFindings.length}`,
    `  Active untriaged:      ${report.activeFindings.length}`,
    `  Failing threshold:     >= ${report.failOnSeverity}`,
  ];
  for (const t of report.triagedFindings)
    lines.push(
      `  Approved [${t.suppression.id}] ${t.finding.ruleId} ${t.finding.file}:${t.finding.line}`,
      `    Rationale: ${t.suppression.rationale}`,
    );
  for (const t of report.expiredFindings)
    lines.push(
      `  EXPIRED [${t.suppression.id}] ${t.finding.ruleId} ${t.finding.file}:${t.finding.line}`,
      `    Expired on: ${t.expiredAt}`,
    );
  for (const f of report.blockingActiveFindings)
    lines.push(
      `  Active [${f.ruleId}] (${f.severity}) ${f.file}:${f.line}`,
      `    ${f.reason}`,
      `    Code: ${f.snippet}`,
    );
  if (saved) lines.push("  SAST scan evidence published");
  lines.push(
    report.passed
      ? "SAST Gate: PASSED (Zero unreviewed blockers and zero expired suppressions)"
      : "SAST Gate: FAILED",
  );
  return lines.join("\n") + "\n";
}
function main(args) {
  let category = "invocation";
  let outputFault = false;
  const diagnostic = (value) => {
    process.exitCode = 1;
    try {
      process.stderr.write(`SAST ${value} failed\n`, () => {});
    } catch {
      /* stderr may also be unavailable */
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
    category = "scanning";
    const scanOptions = {};
    for (const key of ["triagePath", "failOnSeverity"])
      if (Object.hasOwn(options, key)) scanOptions[key] = options[key];
    const result = runSastScan(scanOptions);
    category = "serialization";
    const report = projectReport(result);
    const bytes = serializeReport(report, Boolean(options.output));
    if (options.output) {
      category = "publication";
      try {
        publishReport(options.output, parents, bytes);
      } catch (e) {
        if (e.message === "SAST cleanup failed") category = "cleanup";
        throw e;
      }
    }
    category = "output";
    if (!report.passed) process.exitCode = 1;
    print(options.json ? bytes : humanOutput(report, Boolean(options.output)));
  } catch {
    diagnostic(category);
  }
}
if (require.main === module) main(process.argv.slice(2));

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
