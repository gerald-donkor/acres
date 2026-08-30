import { createHash } from 'node:crypto';
import {
  GEOBOUNDARIES_MANIFEST_SCHEMA_VERSION,
  GEOBOUNDARIES_MAX_ARTIFACT_BYTES,
  GEOBOUNDARIES_MAX_FEATURES,
  GEOBOUNDARIES_MAX_LAYERS,
  type GeoBoundariesLayerManifest,
  type GeoBoundariesHierarchyReview,
  type GeoBoundariesHierarchyReviewLayer,
  type GeoBoundariesLevel,
  type GeoBoundariesManifest,
  type HierarchyMode,
} from './geoboundaries.types';

const LEVELS = new Set<GeoBoundariesLevel>([
  'ADM0',
  'ADM1',
  'ADM2',
  'ADM3',
  'ADM4',
  'ADM5',
]);
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
    ((level === 'ADM2' ||
      level === 'ADM3' ||
      level === 'ADM4' ||
      level === 'ADM5') &&
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
    const entries = Object.entries(rawParentMap).sort(([a], [b]) =>
      a.localeCompare(b),
    );
    if (entries.length === 0 || entries.length > (item.featureCount as number))
      throw new GeoBoundariesManifestError(
        'explicitParentMap is outside feature bounds.',
      );
    explicitParentMap = Object.create(null) as Record<string, string>;
    for (const [child, parent] of entries) {
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
  const sorted = [...layers]
    .map((layer) => ({
      ...layer,
      ...(layer.explicitParentMap
        ? {
            explicitParentMap: Object.fromEntries(
              Object.entries(layer.explicitParentMap).sort(([a], [b]) =>
                a.localeCompare(b),
              ),
            ),
          }
        : {}),
    }))
    .sort((a, b) =>
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
  for (const item of layers) {
    if (
      (item.level === 'ADM2' ||
        item.level === 'ADM3' ||
        item.level === 'ADM4' ||
        item.level === 'ADM5') &&
      item.hierarchyMode === 'explicit-parent-map' &&
      !item.explicitParentMap
    )
      throw new GeoBoundariesManifestError(
        'Deep explicit-parent-map layers require a parent map.',
      );
    if (
      item.level !== 'ADM0' &&
      item.level !== 'ADM1' &&
      item.hierarchyMode === 'explicit-parent-map'
    ) {
      const parent = `ADM${Number(item.level.slice(3)) - 1}`;
      if (!selection.has(`${item.countryCode}/${parent}`))
        throw new GeoBoundariesManifestError(
          'Reviewed deep layers require their immediate parent layer.',
        );
    }
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

function immediateParent(
  level: GeoBoundariesLevel,
): GeoBoundariesLevel | undefined {
  const number = Number(level.slice(3));
  return number > 1 ? (`ADM${number - 1}` as GeoBoundariesLevel) : undefined;
}

export function validateGeoBoundariesHierarchyReview(
  value: unknown,
): GeoBoundariesHierarchyReview {
  const review = object(value, 'hierarchy review');
  if (
    Object.keys(review).some(
      (key) =>
        !['schemaVersion', 'baseManifestIdentitySha256', 'layers'].includes(
          key,
        ),
    )
  )
    throw new GeoBoundariesManifestError('Unknown hierarchy review key.');
  if (
    review.schemaVersion !== 1 ||
    !Array.isArray(review.layers) ||
    review.layers.length === 0 ||
    review.layers.length > GEOBOUNDARIES_MAX_LAYERS
  )
    throw new GeoBoundariesManifestError(
      'Invalid hierarchy review schemaVersion or layer count.',
    );
  const baseManifestIdentitySha256 = text(
    review.baseManifestIdentitySha256,
    'baseManifestIdentitySha256',
    64,
  );
  if (!SHA256.test(baseManifestIdentitySha256))
    throw new GeoBoundariesManifestError(
      'Invalid hierarchy review base identity.',
    );
  const seenLayers = new Set<string>();
  const layers = review.layers.map((raw): GeoBoundariesHierarchyReviewLayer => {
    const item = object(raw, 'review layer');
    if (
      Object.keys(item).some(
        (key) =>
          !['countryCode', 'level', 'parentLevel', 'assignments'].includes(key),
      )
    )
      throw new GeoBoundariesManifestError('Unknown review layer key.');
    const countryCode = text(item.countryCode, 'countryCode', 3);
    const level = text(item.level, 'level', 4) as GeoBoundariesLevel;
    const parentLevel = immediateParent(level);
    if (
      !ISO3.test(countryCode) ||
      !parentLevel ||
      item.parentLevel !== parentLevel
    )
      throw new GeoBoundariesManifestError(
        'Review layers require a deep ADM level and immediate parent.',
      );
    const key = `${countryCode}/${level}`;
    if (seenLayers.has(key))
      throw new GeoBoundariesManifestError(
        `Duplicate hierarchy review layer ${key}.`,
      );
    seenLayers.add(key);
    if (
      !Array.isArray(item.assignments) ||
      item.assignments.length === 0 ||
      item.assignments.length > GEOBOUNDARIES_MAX_FEATURES
    )
      throw new GeoBoundariesManifestError(
        'Review assignments are outside accepted bounds.',
      );
    const seenChildren = new Set<string>();
    const assignments = item.assignments
      .map((rawAssignment) => {
        const assignment = object(rawAssignment, 'review assignment');
        if (
          Object.keys(assignment).some(
            (key) => key !== 'childShapeId' && key !== 'parentShapeId',
          )
        )
          throw new GeoBoundariesManifestError(
            'Unknown review assignment key.',
          );
        const childShapeId = text(assignment.childShapeId, 'childShapeId', 256);
        if (seenChildren.has(childShapeId))
          throw new GeoBoundariesManifestError(
            'Duplicate review childShapeId.',
          );
        seenChildren.add(childShapeId);
        return {
          childShapeId,
          parentShapeId: text(assignment.parentShapeId, 'parentShapeId', 256),
        };
      })
      .sort((a, b) => a.childShapeId.localeCompare(b.childShapeId));
    return {
      countryCode,
      level: level as Exclude<GeoBoundariesLevel, 'ADM0' | 'ADM1'>,
      parentLevel,
      assignments,
    };
  });
  return { schemaVersion: 1, baseManifestIdentitySha256, layers };
}

export function publishReviewedManifest(
  manifest: GeoBoundariesManifest,
  review: GeoBoundariesHierarchyReview,
  featureIds: ReadonlyMap<string, ReadonlySet<string>>,
): GeoBoundariesManifest {
  if (review.baseManifestIdentitySha256 !== manifest.identitySha256)
    throw new GeoBoundariesManifestError(
      'Hierarchy review is bound to a different base manifest.',
    );
  const reviews = new Map(
    review.layers.map((item) => [`${item.countryCode}/${item.level}`, item]),
  );
  for (const key of reviews.keys()) {
    const matched = manifest.layers.find(
      (layer) => `${layer.countryCode}/${layer.level}` === key,
    );
    if (!matched || matched.level === 'ADM0' || matched.level === 'ADM1')
      throw new GeoBoundariesManifestError(
        `Hierarchy review layer ${key} is not a deep base-manifest layer.`,
      );
  }
  const layers = manifest.layers.map((layer) => {
    if (layer.level === 'ADM0' || layer.level === 'ADM1') return layer;
    const key = `${layer.countryCode}/${layer.level}`;
    const childIds = featureIds.get(key);
    const parentIds = featureIds.get(
      `${layer.countryCode}/${immediateParent(layer.level)}`,
    );
    const item = reviews.get(key);
    if (
      !childIds ||
      !parentIds ||
      !item ||
      item.assignments.length !== childIds.size
    )
      throw new GeoBoundariesManifestError(`Deep layer ${key} is unresolved.`);
    const explicitParentMap = Object.create(null) as Record<string, string>;
    for (const assignment of item.assignments) {
      if (
        !childIds.has(assignment.childShapeId) ||
        !parentIds.has(assignment.parentShapeId)
      )
        throw new GeoBoundariesManifestError(
          `Hierarchy review has unknown identity for ${key}.`,
        );
      explicitParentMap[assignment.childShapeId] = assignment.parentShapeId;
    }
    return {
      ...layer,
      hierarchyMode: 'explicit-parent-map' as const,
      explicitParentMap,
    };
  });
  if (
    layers.some(
      (layer) =>
        layer.level !== 'ADM0' &&
        layer.level !== 'ADM1' &&
        layer.hierarchyMode !== 'explicit-parent-map',
    )
  )
    throw new GeoBoundariesManifestError(
      'All deep layers must be reviewed before publication.',
    );
  return validateGeoBoundariesManifest({
    schemaVersion: 1,
    acquiredAt: manifest.acquiredAt,
    layers,
    identitySha256: manifestIdentity(layers),
  });
}
