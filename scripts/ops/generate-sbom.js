#!/usr/bin/env node
/**
 * scripts/ops/generate-sbom.js
 *
 * Deterministic Software Bill of Materials (SBOM) Generator & License Compliance Validator.
 * Generates CycloneDX v1.5 JSON SBOM covering production dependencies across root and workspaces.
 * Validates license expressions against permitted permissive licenses and rejects viral copyleft licenses.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DEFAULT_ALLOWED_LICENSES = [
  'MIT',
  'MIT-0',
  'Apache-2.0',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'ISC',
  '0BSD',
  'CC0-1.0',
  'Unlicense',
  'BlueOak-1.0.0',
  'Python-2.0',
  'CC-BY-4.0',
  'LGPL-3.0-or-later',
  'SEE LICENSE AT https://gsap.com/standard-license',
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
    const pkgPath = path.join(rootDir, key, 'package.json');
    if (!fs.existsSync(pkgPath)) return null;
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    if (typeof pkg.license === 'string') return pkg.license;
    if (Array.isArray(pkg.licenses) && pkg.licenses[0]?.type) return pkg.licenses[0].type;
    if (pkg.license && typeof pkg.license === 'object' && pkg.license.type) return pkg.license.type;
  } catch {
    // ignore
  }
  return null;
}

/**
 * Normalizes package URL (purl) per package-url specification for npm.
 */
function formatPurl(name, version) {
  if (name.startsWith('@')) {
    const [scope, pkg] = name.split('/');
    return `pkg:npm/%40${scope.slice(1)}/${pkg}@${version}`;
  }
  return `pkg:npm/${name}@${version}`;
}

/**
 * Generates CycloneDX v1.5 SBOM from package-lock.json.
 */
function generateSbom(options = {}) {
  const rootDir = options.rootDir || path.resolve(__dirname, '../..');
  const lockfilePath = options.lockfilePath || path.join(rootDir, 'package-lock.json');

  if (!fs.existsSync(lockfilePath)) {
    throw new Error(`package-lock.json not found at ${lockfilePath}`);
  }

  const lock = JSON.parse(fs.readFileSync(lockfilePath, 'utf8'));
  const packages = lock.packages || {};

  const componentMap = new Map();
  const devExcluded = [];
  const licenseCounts = {};

  for (const [key, pkg] of Object.entries(packages)) {
    // Skip root workspace entry and internal workspaces
    if (!key || key === '' || key === 'client' || key === 'server' || key === 'packages/shared') {
      continue;
    }
    // Skip workspace self-references in node_modules
    if (key.startsWith('node_modules/@acres/')) {
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
    license = license || 'UNKNOWN';

    licenseCounts[license] = (licenseCounts[license] || 0) + 1;

    let hexHash = null;
    if (pkg.integrity && pkg.integrity.startsWith('sha512-')) {
      const b64 = pkg.integrity.replace('sha512-', '');
      try {
        hexHash = Buffer.from(b64, 'base64').toString('hex');
      } catch {
        hexHash = null;
      }
    }

    const purl = formatPurl(pkgName, pkg.version);

    // Format license for CycloneDX
    const licenseObj = {};
    if (license.includes(' AND ') || license.includes(' OR ') || (license.startsWith('(') && license.endsWith(')'))) {
      licenseObj.expression = license;
    } else if (license.startsWith('http') || license.includes('license') || license.includes('Standard')) {
      licenseObj.license = { name: license };
    } else {
      licenseObj.license = { id: license };
    }

    const component = {
      type: 'library',
      name: pkgName,
      version: pkg.version,
      purl,
      licenses: [licenseObj],
    };

    if (hexHash) {
      component.hashes = [
        {
          alg: 'SHA-512',
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
    bomFormat: 'CycloneDX',
    specVersion: '1.5',
    serialNumber: `urn:uuid:${crypto.randomUUID()}`,
    version: 1,
    metadata: {
      timestamp: options.timestamp || new Date().toISOString(),
      tools: {
        components: [
          {
            type: 'application',
            name: 'acres-sbom-generator',
            version: '1.0.0',
            vendor: 'Acres',
          },
        ],
      },
      component: {
        type: 'application',
        name: 'acres',
        version: options.appVersion || '0.1.0',
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
  const bannedPatterns = options.bannedPatterns || DEFAULT_BANNED_LICENSE_PATTERNS;

  const violations = [];

  for (const comp of components) {
    const licEntries = comp.licenses && comp.licenses.length > 0 ? comp.licenses : [{ license: { name: 'UNKNOWN' } }];
    for (const licEntry of licEntries) {
      const licStr = licEntry?.license?.id || licEntry?.license?.name || licEntry?.expression || 'UNKNOWN';

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
      if (licStr.includes(' AND ') || licStr.includes(' OR ') || licStr.includes(' and ')) {
        const parts = licStr
          .replace(/[()]/g, '')
          .split(/\s+(?:AND|OR|and|or)\s+/)
          .map((p) => p.trim());
        const unapproved = parts.filter((p) => !allowed.includes(p));
        if (unapproved.length > 0) {
          violations.push({
            component: `${comp.name}@${comp.version}`,
            license: licStr,
            reason: `Contains unapproved license clause(s): ${unapproved.join(', ')}`,
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

// CLI runner
if (require.main === module) {
  const args = process.argv.slice(2);
  const verifyLicenses = args.includes('--verify-licenses');
  const jsonOutput = args.includes('--json');
  const outIdx = args.indexOf('--output');
  const outputPath = outIdx !== -1 && args[outIdx + 1] ? args[outIdx + 1] : null;

  try {
    const { bom, components, devExcludedCount, licenseCounts } = generateSbom();

    if (outputPath) {
      fs.writeFileSync(outputPath, JSON.stringify(bom, null, 2) + '\n', 'utf8');
    }

    if (verifyLicenses) {
      const compliance = validateLicenseCompliance(components);
      if (!compliance.compliant) {
        console.error('SBOM License Compliance Check FAILED:');
        for (const v of compliance.violations) {
          console.error(`  - [${v.component}] ${v.license}: ${v.reason}`);
        }
        process.exit(1);
      }
    }

    if (jsonOutput) {
      console.log(JSON.stringify(bom, null, 2));
    } else {
      console.log('CycloneDX v1.5 SBOM Generation & License Verification:');
      console.log(`  Total production components: ${components.length}`);
      console.log(`  Excluded dev/test packages:   ${devExcludedCount}`);
      console.log('  License distribution:');
      for (const [lic, count] of Object.entries(licenseCounts).sort((a, b) => b[1] - a[1])) {
        console.log(`    - ${lic.padEnd(45)}: ${count}`);
      }
      if (verifyLicenses) {
        console.log('  License Compliance: PASSED (100% compliant with approved permissive licenses)');
      }
      if (outputPath) {
        console.log(`  SBOM artifact written to: ${outputPath}`);
      }
    }
  } catch (err) {
    console.error(`Failed to generate SBOM: ${err.message}`);
    process.exit(1);
  }
}

module.exports = {
  DEFAULT_ALLOWED_LICENSES,
  DEFAULT_BANNED_LICENSE_PATTERNS,
  formatPurl,
  generateSbom,
  validateLicenseCompliance,
};
