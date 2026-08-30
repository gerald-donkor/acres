import { createHash } from 'node:crypto';
import {
  GEOBOUNDARIES_MANIFEST_SCHEMA_VERSION,
  GEOBOUNDARIES_MAX_ARTIFACT_BYTES,
  GEOBOUNDARIES_MAX_LAYERS,
  type GeoBoundariesLayerManifest,
  type GeoBoundariesLevel,
  type GeoBoundariesManifest,
  type HierarchyMode,
} from './geoboundaries.types';

const LEVELS = new Set<GeoBoundariesLevel>(['ADM0', 'ADM1']);
const HIERARCHY_MODES = new Set<HierarchyMode>([
  'country-root',
  'explicit-parent-map',
  'unresolved',
]);
const SHA256 = /^[a-f0-9]{64}$/;
const ISO3 = /^[A-Z]{3}$/;
// eslint-disable-next-line no-control-regex -- reject untrusted control characters.
const CONTROL = /[\u0000-\u001f\u007f]/;
const MAX_TEXT = 2_048;

export class GeoBoundariesManifestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GeoBoundariesManifestError';
  }
}

function object(value: unknown, name: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new GeoBoundariesManifestError(`${name} must be an object.`);
  return value as Record<string, unknown>;
}

function text(value: unknown, name: string, max = MAX_TEXT): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > max ||
    CONTROL.test(value)
  )
    throw new GeoBoundariesManifestError(
      `${name} must be non-empty text up to ${max} characters without control characters.`,
    );
  return value;
}

function optionalText(value: unknown, name: string, max = MAX_TEXT): string {
  if (typeof value !== 'string' || value.length > max || CONTROL.test(value))
    throw new GeoBoundariesManifestError(
      `${name} must be text up to ${max} characters without control characters.`,
    );
  return value;
}

function date(value: unknown, name: string): string {
  const result = text(value, name, 128);
  if (!Number.isFinite(Date.parse(result)))
    throw new GeoBoundariesManifestError(`${name} must be a valid date.`);
  return result;
}

function https(value: unknown, name: string, artifact = false): string {
  const result = text(value, name);
  let url: URL;
  try {
    url = new URL(result);
  } catch {
    throw new GeoBoundariesManifestError(`${name} must be an HTTPS URL.`);
  }
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.hash ||
    CONTROL.test(url.href)
  )
    throw new GeoBoundariesManifestError(
      `${name} must be a credential-free HTTPS URL.`,
    );
  if (artifact && !isCommitAddressedArtifactUrl(url))
    throw new GeoBoundariesManifestError(
      'artifactUrl must be a commit-addressed raw GitHub GeoJSON URL.',
    );
  return url.toString();
}

/** geoBoundaries API hands out raw.githubusercontent.com/<org>/<repo>/<40-sha>/... links. */
export function isCommitAddressedArtifactUrl(url: URL): boolean {
  return (
    url.hostname === 'raw.githubusercontent.com' &&
    /^\/[\w.-]+\/[\w.-]+\/[a-f0-9]{40}\/.+\.geojson$/i.test(url.pathname)
  );
}

function layer(value: unknown): GeoBoundariesLayerManifest {
  const item = object(value, 'layer');
  const allowed = new Set([
    'provider',
    'releaseType',
    'countryCode',
    'level',
    'boundaryId',
    'representedYear',
    'sourceUpdateDate',
    'buildDate',
    'boundarySource',
    'boundaryLicense',
    'licenseDetail',
    'licenseSource',
    'sourceUrl',
    'artifactUrl',
    'sha256',
    'byteLength',
    'featureCount',
    'attribution',
    'modificationNote',
    'hierarchyMode',
    'explicitParentMap',
  ]);
  for (const key of Object.keys(item))
    if (!allowed.has(key))
      throw new GeoBoundariesManifestError(
        `Unknown manifest layer key: ${key}.`,
      );
  if (item.provider !== 'geoBoundaries' || item.releaseType !== 'gbOpen')
    throw new GeoBoundariesManifestError(
      'Only geoBoundaries gbOpen layers are supported.',
    );
  const countryCode = text(item.countryCode, 'countryCode', 3);
  if (!ISO3.test(countryCode))
    throw new GeoBoundariesManifestError(
      'countryCode must be ISO-3166 alpha-3 uppercase.',
    );
  const level = text(item.level, 'level', 4) as GeoBoundariesLevel;
  if (!LEVELS.has(level))
    throw new GeoBoundariesManifestError('level must be ADM0 through ADM5.');
  const hierarchyMode = text(
    item.hierarchyMode,
    'hierarchyMode',
    32,
  ) as HierarchyMode;
  if (!HIERARCHY_MODES.has(hierarchyMode))
    throw new GeoBoundariesManifestError('Unsupported hierarchy mode.');
  if (
    (level === 'ADM0' && hierarchyMode !== 'country-root') ||
    (level === 'ADM1' && hierarchyMode === 'unresolved') ||
    (level >= 'ADM2' &&
      hierarchyMode !== 'unresolved' &&
      hierarchyMode !== 'explicit-parent-map')
  )
    throw new GeoBoundariesManifestError(
      'hierarchyMode is incompatible with the ADM level.',
    );
  const sha256 = text(item.sha256, 'sha256', 64);
  if (!SHA256.test(sha256))
    throw new GeoBoundariesManifestError(
      'sha256 must be lowercase 64-character hexadecimal.',
    );
  if (
    !Number.isSafeInteger(item.byteLength) ||
    (item.byteLength as number) <= 0 ||
    (item.byteLength as number) > GEOBOUNDARIES_MAX_ARTIFACT_BYTES
  )
    throw new GeoBoundariesManifestError(
      'byteLength is outside the allowed artifact limit.',
    );
  if (
    !Number.isSafeInteger(item.featureCount) ||
    (item.featureCount as number) <= 0 ||
    (item.featureCount as number) > 50_000
  )
    throw new GeoBoundariesManifestError(
      'featureCount is outside the allowed bound.',
    );
  let explicitParentMap: Record<string, string> | undefined;
  if (item.explicitParentMap !== undefined) {
    if (hierarchyMode !== 'explicit-parent-map')
      throw new GeoBoundariesManifestError(
        'explicitParentMap requires explicit-parent-map mode.',
      );
    const rawParentMap = object(item.explicitParentMap, 'explicitParentMap');
    explicitParentMap = {};
    for (const [child, parent] of Object.entries(rawParentMap)) {
      explicitParentMap[text(child, 'explicit parent child', 256)] = text(
        parent,
        'explicit parent value',
        256,
      );
    }
  }
  return {
    provider: 'geoBoundaries',
    releaseType: 'gbOpen',
    countryCode,
    level,
    boundaryId: text(item.boundaryId, 'boundaryId', 256),
    representedYear: text(item.representedYear, 'representedYear', 128),
    sourceUpdateDate: date(item.sourceUpdateDate, 'sourceUpdateDate'),
    buildDate: date(item.buildDate, 'buildDate'),
    boundarySource: text(item.boundarySource, 'boundarySource'),
    boundaryLicense: text(item.boundaryLicense, 'boundaryLicense'),
    licenseDetail: optionalText(item.licenseDetail, 'licenseDetail'),
    licenseSource: https(item.licenseSource, 'licenseSource'),
    sourceUrl: https(item.sourceUrl, 'sourceUrl'),
    artifactUrl: https(item.artifactUrl, 'artifactUrl', true),
    sha256,
    byteLength: item.byteLength as number,
    featureCount: item.featureCount as number,
    attribution: text(item.attribution, 'attribution'),
    modificationNote: text(item.modificationNote, 'modificationNote'),
    hierarchyMode,
    ...(explicitParentMap ? { explicitParentMap } : {}),
  };
}

export function canonicalManifestContent(
  layers: readonly GeoBoundariesLayerManifest[],
): string {
  const sorted = [...layers].sort((a, b) =>
    `${a.countryCode}/${a.level}/${a.boundaryId}`.localeCompare(
      `${b.countryCode}/${b.level}/${b.boundaryId}`,
    ),
  );
  return JSON.stringify({
    schemaVersion: GEOBOUNDARIES_MANIFEST_SCHEMA_VERSION,
    layers: sorted,
  });
}

export function manifestIdentity(
  layers: readonly GeoBoundariesLayerManifest[],
): string {
  return createHash('sha256')
    .update(canonicalManifestContent(layers))
    .digest('hex');
}

export function validateGeoBoundariesManifest(
  value: unknown,
): GeoBoundariesManifest {
  const manifest = object(value, 'manifest');
  const allowed = new Set([
    'schemaVersion',
    'acquiredAt',
    'layers',
    'identitySha256',
  ]);
  for (const key of Object.keys(manifest))
    if (!allowed.has(key))
      throw new GeoBoundariesManifestError(`Unknown manifest key: ${key}.`);
  if (
    manifest.schemaVersion !== GEOBOUNDARIES_MANIFEST_SCHEMA_VERSION ||
    !Array.isArray(manifest.layers) ||
    manifest.layers.length === 0 ||
    manifest.layers.length > GEOBOUNDARIES_MAX_LAYERS
  )
    throw new GeoBoundariesManifestError(
      'Invalid manifest schemaVersion or layer count.',
    );
  const layers = manifest.layers.map(layer);
  const selection = new Set<string>();
  for (const item of layers) {
    const key = `${item.countryCode}/${item.level}`;
    if (selection.has(key))
      throw new GeoBoundariesManifestError(`Duplicate selection ${key}.`);
    selection.add(key);
  }
  const identitySha256 = text(manifest.identitySha256, 'identitySha256', 64);
  if (
    !SHA256.test(identitySha256) ||
    identitySha256 !== manifestIdentity(layers)
  )
    throw new GeoBoundariesManifestError(
      'Manifest identitySha256 does not match canonical layer content.',
    );
  return {
    schemaVersion: GEOBOUNDARIES_MANIFEST_SCHEMA_VERSION,
    acquiredAt: date(manifest.acquiredAt, 'acquiredAt'),
    layers,
    identitySha256,
  };
}
