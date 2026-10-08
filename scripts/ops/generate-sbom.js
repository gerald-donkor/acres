#!/usr/bin/env node
/**
 * scripts/ops/generate-sbom.js
 *
 * Software Bill of Materials (SBOM) Generator & License Compliance Validator.
 * Components are sorted; timestamps and UUIDs intentionally vary.
 * Generates CycloneDX v1.5 JSON SBOM covering production dependencies across root and workspaces.
 * Validates license expressions against permitted permissive licenses and rejects viral copyleft licenses.
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const DEFAULT_ALLOWED_LICENSES = [
  "MIT",
  "MIT-0",
  "Apache-2.0",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "ISC",
  "0BSD",
  "CC0-1.0",
  "Unlicense",
  "BlueOak-1.0.0",
  "Python-2.0",
  "CC-BY-4.0",
  "LGPL-3.0-or-later",
  "SEE LICENSE AT https://gsap.com/standard-license",
  "Standard 'no charge' license: https://gsap.com/standard-license.",
];

const DEFAULT_BANNED_LICENSE_PATTERNS = [
  /AGPL/i,
  /\bSSPL\b/i,
  /\bCommonsClause\b/i,
  /(?<!L)GPL-(?:1|2|3)/i, // Matches GPL-1, GPL-2, GPL-3 but NOT LGPL
  /(?<!L)GPL\b/i,
];

/**
 * Resolves disk package.json license if lockfile is missing it.
 */
function resolveDiskLicense(rootDir, key) {
  try {
    const pkgPath = path.join(rootDir, key, "package.json");
    if (!fs.existsSync(pkgPath)) return null;
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
    if (typeof pkg.license === "string") return pkg.license;
    if (Array.isArray(pkg.licenses) && pkg.licenses[0]?.type)
      return pkg.licenses[0].type;
    if (pkg.license && typeof pkg.license === "object" && pkg.license.type)
      return pkg.license.type;
  } catch {
    // ignore
  }
  return null;
}

/**
 * Normalizes package URL (purl) per package-url specification for npm.
 */
function formatPurl(name, version) {
  if (name.startsWith("@")) {
    const [scope, pkg] = name.split("/");
    return `pkg:npm/%40${scope.slice(1)}/${pkg}@${version}`;
  }
  return `pkg:npm/${name}@${version}`;
}

/**
 * Generates CycloneDX v1.5 SBOM from package-lock.json.
 */
function generateSbom(options = {}) {
  validateOptions(options);
  const rootDir = options.rootDir ?? path.resolve(__dirname, "../..");
  const lockfilePath =
    options.lockfilePath || path.join(rootDir, "package-lock.json");

  if (!fs.existsSync(lockfilePath)) {
    throw new Error(`package-lock.json not found at ${lockfilePath}`);
  }

  const lock = JSON.parse(fs.readFileSync(lockfilePath, "utf8"));
  const packages = lock.packages || {};

  const componentMap = new Map();
  const devExcluded = [];
  const licenseCounts = {};

  for (const [key, pkg] of Object.entries(packages)) {
    // Skip root workspace entry and internal workspaces
    if (
      !key ||
      key === "" ||
      key === "client" ||
      key === "server" ||
      key === "packages/shared"
    ) {
      continue;
    }
    // Skip workspace self-references in node_modules
    if (key.startsWith("node_modules/@acres/")) {
      continue;
    }

    let pkgName = pkg.name;
    if (!pkgName) {
      const parts = key.split("node_modules/");
      pkgName = parts[parts.length - 1];
    }

    // Exclude build/dev dependencies and type declarations
    if (pkg.dev || pkg.devOptional || pkgName.startsWith("@types/")) {
      devExcluded.push(key);
      continue;
    }

    let license = pkg.license;
    if (!license) {
      license = resolveDiskLicense(rootDir, key);
    }
    license = license || "UNKNOWN";

    licenseCounts[license] = (licenseCounts[license] || 0) + 1;

    let hexHash = null;
    if (pkg.integrity && pkg.integrity.startsWith("sha512-")) {
      const b64 = pkg.integrity.replace("sha512-", "");
      try {
        hexHash = Buffer.from(b64, "base64").toString("hex");
      } catch {
        hexHash = null;
      }
    }

    const purl = formatPurl(pkgName, pkg.version);

    // Format license for CycloneDX
    const licenseObj = {};
    if (
      license.includes(" AND ") ||
      license.includes(" OR ") ||
      (license.startsWith("(") && license.endsWith(")"))
    ) {
      licenseObj.expression = license;
    } else if (
      license.startsWith("http") ||
      license.includes("license") ||
      license.includes("Standard")
    ) {
      licenseObj.license = { name: license };
    } else {
      licenseObj.license = { id: license };
    }

    const component = {
      type: "library",
      name: pkgName,
      version: pkg.version,
      purl,
      licenses: [licenseObj],
    };

    if (hexHash) {
      component.hashes = [
        {
          alg: "SHA-512",
          content: hexHash,
        },
      ];
    }

    if (!componentMap.has(purl)) {
      componentMap.set(purl, component);
    }
  }

  const components = Array.from(componentMap.values());

  // Sort components deterministically by purl
  components.sort((a, b) => a.purl.localeCompare(b.purl));

  const bom = {
    bomFormat: "CycloneDX",
    specVersion: "1.5",
    serialNumber: `urn:uuid:${crypto.randomUUID()}`,
    version: 1,
    metadata: {
      timestamp: options.timestamp || new Date().toISOString(),
      tools: {
        components: [
          {
            type: "application",
            name: "acres-sbom-generator",
            version: "1.0.0",
            vendor: "Acres",
          },
        ],
      },
      component: {
        type: "application",
        name: "acres",
        version: options.appVersion || "0.1.0",
      },
    },
    components,
  };

  return {
    bom,
    components,
    devExcludedCount: devExcluded.length,
    licenseCounts,
  };
}

/**
 * Validates license compliance for all extracted components.
 */
function validateLicenseCompliance(components, options = {}) {
  const allowed = options.allowedLicenses || DEFAULT_ALLOWED_LICENSES;
  const bannedPatterns =
    options.bannedPatterns || DEFAULT_BANNED_LICENSE_PATTERNS;

  const violations = [];

  for (const comp of components) {
    const licEntries =
      comp.licenses && comp.licenses.length > 0
        ? comp.licenses
        : [{ license: { name: "UNKNOWN" } }];
    for (const licEntry of licEntries) {
      const licStr =
        licEntry?.license?.id ||
        licEntry?.license?.name ||
        licEntry?.expression ||
        "UNKNOWN";

      // 1. Check banned copyleft/viral patterns
      let isBanned = false;
      for (const pattern of bannedPatterns) {
        if (pattern.test(licStr)) {
          violations.push({
            component: `${comp.name}@${comp.version}`,
            license: licStr,
            reason: `Violates license policy: contains banned license pattern ${pattern}`,
          });
          isBanned = true;
          break;
        }
      }
      if (isBanned) continue;

      // 2. Check if allowed directly
      if (allowed.includes(licStr)) {
        continue;
      }

      // 3. For expressions (e.g. "MIT AND ISC" or "Apache-2.0 AND LGPL-3.0-or-later"), check individual clauses
      if (
        licStr.includes(" AND ") ||
        licStr.includes(" OR ") ||
        licStr.includes(" and ")
      ) {
        const parts = licStr
          .replace(/[()]/g, "")
          .split(/\s+(?:AND|OR|and|or)\s+/)
          .map((p) => p.trim());
        const unapproved = parts.filter((p) => !allowed.includes(p));
        if (unapproved.length > 0) {
          violations.push({
            component: `${comp.name}@${comp.version}`,
            license: licStr,
            reason: `Contains unapproved license clause(s): ${unapproved.join(", ")}`,
          });
        }
        continue;
      }

      // Otherwise unapproved
      violations.push({
        component: `${comp.name}@${comp.version}`,
        license: licStr,
        reason: `Unapproved license '${licStr}' not in permissive allowlist`,
      });
    }
  }

  return {
    compliant: violations.length === 0,
    violations,
    totalComponents: components.length,
  };
}

// Local machinery deliberately has no direct-call save side effect.
const MAX_SAVED_BYTES = 16 * 1024 * 1024;
const text = (value) =>
  typeof value === "string" &&
  value.trim().length > 0 &&
  !/[\x00-\x1f\x7f-\x9f]/.test(value);
const failure = (category) => new Error(`SBOM ${category} failed`);

function validateOptions(options) {
  if (!options || typeof options !== "object" || Array.isArray(options))
    throw failure("invocation");
  for (const key of ["rootDir", "lockfilePath", "timestamp", "appVersion"])
    if (Object.hasOwn(options, key) && !text(options[key]))
      throw failure("invocation");
}

function parseArgs(args) {
  if (args.length === 1 && ["--help", "-h"].includes(args[0]))
    return { help: true };
  const result = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (["--verify-licenses", "--json"].includes(arg)) {
      const key = arg === "--json" ? "json" : "verify";
      if (result[key]) throw failure("invocation");
      result[key] = true;
    } else if (
      arg === "--output" ||
      arg === "-o" ||
      arg.startsWith("--output=") ||
      arg.startsWith("-o=")
    ) {
      if (result.output !== undefined) throw failure("invocation");
      const attached = arg.includes("=");
      const value = attached ? arg.slice(arg.indexOf("=") + 1) : args[++i];
      if (!text(value) || (!attached && value.startsWith("-")))
        throw failure("invocation");
      if (value.endsWith(path.sep)) throw failure("invocation");
      result.output = path.resolve(value);
      if (result.output === path.parse(result.output).root)
        throw failure("invocation");
    } else throw failure("invocation");
  }
  return result;
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

// Projection checks are local consistency checks, not CycloneDX schema certification.
function validateBom(bom, verify) {
  if (
    !bom ||
    bom.bomFormat !== "CycloneDX" ||
    bom.specVersion !== "1.5" ||
    bom.version !== 1 ||
    !/^urn:uuid:[0-9a-f-]{36}$/.test(bom.serialNumber) ||
    !text(bom.metadata?.timestamp) ||
    bom.metadata?.component?.name !== "acres" ||
    !text(bom.metadata.component.version) ||
    bom.metadata?.tools?.components?.[0]?.name !== "acres-sbom-generator" ||
    !Array.isArray(bom.components)
  )
    throw failure("serialization");
  for (const c of bom.components) {
    if (
      !c ||
      c.type !== "library" ||
      !text(c.name) ||
      !text(c.version) ||
      !text(c.purl) ||
      !Array.isArray(c.licenses) ||
      c.licenses.length === 0 ||
      c.licenses.some(
        (l) => !text(l?.license?.id || l?.license?.name || l?.expression),
      )
    )
      throw failure("serialization");
  }
  if (verify) {
    const actual = validateLicenseCompliance(bom.components);
    if (JSON.stringify(bom.licenseCompliance) !== JSON.stringify(actual))
      throw failure("serialization");
  } else if (Object.hasOwn(bom, "licenseCompliance"))
    throw failure("serialization");
}

function serializeBom(bom, verify, saving) {
  validateBom(bom, verify);
  const bytes = Buffer.from(JSON.stringify(bom, null, 2) + "\n");
  if (saving && bytes.length > MAX_SAVED_BYTES) throw failure("serialization");
  // Independently verify the serialized representation, including evaluated verdict.
  validateBom(JSON.parse(bytes.toString("utf8")), verify);
  return bytes;
}

function publishBom(output, parents, bytes, verify) {
  const temporary = path.join(
    path.dirname(output),
    `.sbom-${crypto.randomUUID()}.tmp`,
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
    validateBom(JSON.parse(actual.subarray(0, used).toString("utf8")), verify);
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

const HELP = `Usage: scripts/ops/generate-sbom.js [options]
  --verify-licenses  Evaluate the existing license policy
  --json            Print one complete CycloneDX v1.5 BOM
  --output, -o FILE Save to an absent destination (also accepts =FILE)
  --help, -h        Show standalone help
Defaults use the installed repository; relative output uses caller cwd.
New parents are private; retained outputs and symlink ancestors are rejected.
`;

function humanOutput(result, compliance, saved) {
  const lines = [
    "CycloneDX v1.5 SBOM Generation & License Verification:",
    `  Total production components: ${result.components.length}`,
    `  Excluded dev/test packages:   ${result.devExcludedCount}`,
    "  License distribution:",
  ];
  for (const [lic, count] of Object.entries(result.licenseCounts).sort(
    (a, b) => b[1] - a[1],
  ))
    lines.push(`    - ${lic.padEnd(45)}: ${count}`);
  if (compliance) {
    lines.push(
      compliance.compliant
        ? "  License Compliance: PASSED (100% compliant with approved permissive licenses)"
        : "  License Compliance: FAILED",
    );
    for (const v of compliance.violations)
      lines.push(`  - [${v.component}] ${v.license}: ${v.reason}`);
  }
  if (saved) lines.push("  SBOM artifact published");
  return lines.join("\n") + "\n";
}

function main(args) {
  let category = "invocation";
  let outputFault = false;
  const diagnostic = (value) => {
    process.exitCode = 1;
    try {
      process.stderr.write(`SBOM ${value} failed\n`, () => {});
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
  try {
    const options = parseArgs(args);
    if (options.help) {
      category = "output";
      process.stdout.write(HELP, (e) => {
        if (e && !outputFault) {
          outputFault = true;
          diagnostic("output");
        }
      });
      return;
    }
    category = "publication";
    const parents = options.output ? outputPreflight(options.output) : null;
    category = "generation";
    const result = generateSbom();
    const compliance = options.verify
      ? validateLicenseCompliance(result.components)
      : null;
    if (compliance) result.bom.licenseCompliance = compliance;
    category = "serialization";
    const bytes = serializeBom(
      result.bom,
      Boolean(options.verify),
      Boolean(options.output),
    );
    if (options.output) {
      category = "publication";
      try {
        publishBom(options.output, parents, bytes, Boolean(options.verify));
      } catch (e) {
        if (e.message === "SBOM cleanup failed") category = "cleanup";
        throw e;
      }
    }
    category = "output";
    const value = options.json
      ? bytes
      : humanOutput(result, compliance, Boolean(options.output));
    if (compliance && !compliance.compliant) process.exitCode = 1;
    process.stdout.write(value, (e) => {
      if (e && !outputFault) {
        outputFault = true;
        diagnostic("output");
      }
    });
  } catch {
    diagnostic(category);
  }
}

if (require.main === module) main(process.argv.slice(2));

module.exports = {
  DEFAULT_ALLOWED_LICENSES,
  DEFAULT_BANNED_LICENSE_PATTERNS,
  formatPurl,
  generateSbom,
  validateLicenseCompliance,
};
