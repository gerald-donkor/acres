import { createHash } from 'node:crypto';
import {
  manifestIdentity,
  publishReviewedManifest,
  validateGeoBoundariesHierarchyReview,
  validateGeoBoundariesManifest,
} from './geoboundaries-manifest';
import type { GeoBoundariesLayerManifest } from './geoboundaries.types';

function layer(
  overrides: Record<string, unknown> = {},
): GeoBoundariesLayerManifest {
  return {
    provider: 'geoBoundaries',
    releaseType: 'gbOpen',
    countryCode: 'GHA',
    level: 'ADM0',
    boundaryId: 'GHA-ADM0-test',
    representedYear: '2024',
    sourceUpdateDate: '2024-01-01T00:00:00.000Z',
    buildDate: '2024-02-01T00:00:00.000Z',
    boundarySource: 'Synthetic provider fixture',
    boundaryLicense: 'CC BY 4.0',
    licenseDetail: '',
    licenseSource: 'https://example.org/license',
    sourceUrl: 'https://www.geoboundaries.org/api/current/gbOpen/GHA/ADM0/',
    artifactUrl:
      'https://raw.githubusercontent.com/wmgeolab/geoBoundaries/0123456789abcdef0123456789abcdef01234567/releaseData/gbOpen/GHA/ADM0/geoBoundaries-GHA-ADM0.geojson',
    sha256: createHash('sha256').update('fixture').digest('hex'),
    byteLength: 7,
    featureCount: 1,
    attribution: 'Contains modified geoBoundaries data.',
    modificationNote: 'Normalized only.',
    hierarchyMode: 'country-root',
    ...overrides,
  };
}

describe('geoBoundaries manifest', () => {
  it('uses canonical layers rather than acquisition time for identity', () => {
    const layers = [layer()];
    const input = {
      schemaVersion: 1,
      acquiredAt: '2026-08-30T00:00:00.000Z',
      layers,
      identitySha256: manifestIdentity(layers),
    };
    expect(validateGeoBoundariesManifest(input).identitySha256).toBe(
      manifestIdentity(layers),
    );
  });

  it('rejects mutable discovery URLs and inferred hierarchy', () => {
    const mutable = [
      layer({
        artifactUrl:
          'https://www.geoboundaries.org/api/current/gbOpen/GHA/ADM0/',
      }),
    ];
    expect(() =>
      validateGeoBoundariesManifest({
        schemaVersion: 1,
        acquiredAt: '2026-08-30T00:00:00.000Z',
        layers: mutable,
        identitySha256: manifestIdentity(mutable),
      }),
    ).toThrow('commit-addressed');
    const inferred = [layer({ hierarchyMode: 'inferred' })];
    expect(() =>
      validateGeoBoundariesManifest({
        schemaVersion: 1,
        acquiredAt: '2026-08-30T00:00:00.000Z',
        layers: inferred,
        identitySha256: manifestIdentity(inferred),
      }),
    ).toThrow('Unsupported hierarchy mode');
  });

  it('publishes a complete, canonical deep review only', () => {
    const layers = [
      layer({ level: 'ADM0', featureCount: 1, hierarchyMode: 'country-root' }),
      layer({
        level: 'ADM1',
        boundaryId: 'GHA-ADM1',
        featureCount: 1,
        hierarchyMode: 'explicit-parent-map',
      }),
      layer({
        level: 'ADM2',
        boundaryId: 'GHA-ADM2',
        featureCount: 2,
        hierarchyMode: 'unresolved',
      }),
    ];
    const manifest = validateGeoBoundariesManifest({
      schemaVersion: 1,
      acquiredAt: '2026-08-30T00:00:00.000Z',
      layers,
      identitySha256: manifestIdentity(layers),
    });
    const review = validateGeoBoundariesHierarchyReview({
      schemaVersion: 1,
      baseManifestIdentitySha256: manifest.identitySha256,
      layers: [
        {
          countryCode: 'GHA',
          level: 'ADM2',
          parentLevel: 'ADM1',
          assignments: [
            { childShapeId: 'child-b', parentShapeId: 'parent' },
            { childShapeId: 'child-a', parentShapeId: 'parent' },
          ],
        },
      ],
    });
    const published = publishReviewedManifest(
      manifest,
      review,
      new Map([
        ['GHA/ADM0', new Set(['root'])],
        ['GHA/ADM1', new Set(['parent'])],
        ['GHA/ADM2', new Set(['child-a', 'child-b'])],
      ]),
    );
    expect(published.layers[2].explicitParentMap).toEqual({
      'child-a': 'parent',
      'child-b': 'parent',
    });
    expect(() =>
      publishReviewedManifest(
        manifest,
        { ...review, baseManifestIdentitySha256: 'b'.repeat(64) },
        new Map(),
      ),
    ).toThrow('different base manifest');
    expect(() =>
      publishReviewedManifest(
        manifest,
        {
          ...review,
          layers: [
            ...review.layers,
            {
              countryCode: 'GHA',
              level: 'ADM3',
              parentLevel: 'ADM2',
              assignments: [
                { childShapeId: 'extra', parentShapeId: 'child-a' },
              ],
            },
          ],
        },
        new Map(),
      ),
    ).toThrow('not a deep base-manifest layer');
  });
});
