const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const {
  formatPurl,
  generateSbom,
  validateLicenseCompliance,
  DEFAULT_ALLOWED_LICENSES,
  DEFAULT_BANNED_LICENSE_PATTERNS,
} = require('./generate-sbom');

test('formatPurl: accurately formats scoped and unscoped packages', () => {
  assert.equal(formatPurl('react', '19.2.8'), 'pkg:npm/react@19.2.8');
  assert.equal(formatPurl('@nestjs/core', '11.2.1'), 'pkg:npm/%40nestjs/core@11.2.1');
  assert.equal(formatPurl('@acres/shared', '0.1.0'), 'pkg:npm/%40acres/shared@0.1.0');
});

test('generateSbom: produces valid CycloneDX v1.5 JSON with required metadata and components', () => {
  const result = generateSbom();
  assert.ok(result.bom, 'Expected bom object');
  assert.equal(result.bom.bomFormat, 'CycloneDX');
  assert.equal(result.bom.specVersion, '1.5');
  assert.ok(result.bom.serialNumber.startsWith('urn:uuid:'));
  assert.equal(result.bom.version, 1);
  assert.equal(result.bom.metadata.component.name, 'acres');
  assert.equal(result.bom.metadata.tools.components[0].name, 'acres-sbom-generator');
  assert.ok(Array.isArray(result.bom.components));
  assert.ok(result.bom.components.length > 500, `Expected >500 components, got ${result.bom.components.length}`);

  // Validate random component structure
  const first = result.bom.components[0];
  assert.equal(first.type, 'library');
  assert.ok(first.name);
  assert.ok(first.version);
  assert.ok(first.purl.startsWith('pkg:npm/'));
  assert.ok(Array.isArray(first.licenses));
  assert.ok(first.licenses.length > 0);
});

test('generateSbom: excludes devDependencies like typescript, eslint, and playwright', () => {
  const result = generateSbom();
  const componentNames = new Set(result.bom.components.map((c) => c.name));

  assert.ok(result.devExcludedCount > 0, 'Expected devExcludedCount > 0');
  assert.equal(componentNames.has('typescript'), false, 'typescript should be excluded from prod SBOM');
  assert.equal(componentNames.has('eslint'), false, 'eslint should be excluded from prod SBOM');
  assert.equal(componentNames.has('@playwright/test'), false, '@playwright/test should be excluded from prod SBOM');
  assert.equal(componentNames.has('@types/node'), false, '@types/node should be excluded from prod SBOM');

  // Assert essential production dependencies ARE present
  assert.ok(componentNames.has('react'), 'react must be in prod components');
  assert.ok(componentNames.has('@nestjs/core'), '@nestjs/core must be in prod components');
  assert.ok(componentNames.has('class-validator'), 'class-validator must be in prod components');
});

test('generateSbom: extracts SHA-512 integrity hashes when present', () => {
  const result = generateSbom();
  const componentsWithHashes = result.bom.components.filter(
    (c) => c.hashes && c.hashes.length > 0 && c.hashes[0].alg === 'SHA-512'
  );
  assert.ok(
    componentsWithHashes.length > 700,
    `Expected >700 components with SHA-512 hashes, got ${componentsWithHashes.length}`
  );
  const sampleHash = componentsWithHashes[0].hashes[0].content;
  assert.match(sampleHash, /^[a-f0-9]{128}$/, 'SHA-512 content must be a 128-char hex string');
});

test('validateLicenseCompliance: production components comply 100% with permitted permissive licenses', () => {
  const result = generateSbom();
  const compliance = validateLicenseCompliance(result.components);

  assert.equal(compliance.compliant, true, `Expected full compliance, violations: ${JSON.stringify(compliance.violations)}`);
  assert.equal(compliance.violations.length, 0);
  assert.equal(compliance.totalComponents, result.components.length);
});

test('validateLicenseCompliance: fails closed and detects banned copyleft licenses (AGPL, GPL, SSPL)', () => {
  const mockComponents = [
    {
      name: 'permissive-lib',
      version: '1.0.0',
      purl: 'pkg:npm/permissive-lib@1.0.0',
      licenses: [{ license: { id: 'MIT' } }],
    },
    {
      name: 'agpl-bad-lib',
      version: '2.0.0',
      purl: 'pkg:npm/agpl-bad-lib@2.0.0',
      licenses: [{ license: { id: 'AGPL-3.0-only' } }],
    },
    {
      name: 'gpl-bad-lib',
      version: '3.0.0',
      purl: 'pkg:npm/gpl-bad-lib@3.0.0',
      licenses: [{ license: { id: 'GPL-3.0' } }],
    },
    {
      name: 'sspl-bad-lib',
      version: '1.0.0',
      purl: 'pkg:npm/sspl-bad-lib@1.0.0',
      licenses: [{ license: { id: 'SSPL' } }],
    },
  ];

  const compliance = validateLicenseCompliance(mockComponents);
  assert.equal(compliance.compliant, false);
  assert.equal(compliance.violations.length, 3);
  assert.ok(compliance.violations.some((v) => v.component === 'agpl-bad-lib@2.0.0'));
  assert.ok(compliance.violations.some((v) => v.component === 'gpl-bad-lib@3.0.0'));
  assert.ok(compliance.violations.some((v) => v.component === 'sspl-bad-lib@1.0.0'));
});

test('validateLicenseCompliance: validates compound expressions correctly', () => {
  const validCompound = [
    {
      name: 'dual-licensed',
      version: '1.0.0',
      purl: 'pkg:npm/dual-licensed@1.0.0',
      licenses: [{ expression: '(MIT AND BSD-3-Clause)' }],
    },
  ];
  const complianceValid = validateLicenseCompliance(validCompound);
  assert.equal(complianceValid.compliant, true);

  const invalidCompound = [
    {
      name: 'bad-compound',
      version: '1.0.0',
      purl: 'pkg:npm/bad-compound@1.0.0',
      licenses: [{ expression: 'MIT AND AGPL-3.0' }],
    },
  ];
  const complianceInvalid = validateLicenseCompliance(invalidCompound);
  assert.equal(complianceInvalid.compliant, false);
});
