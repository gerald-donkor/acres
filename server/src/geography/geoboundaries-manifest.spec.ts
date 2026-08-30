import { createHash } from 'node:crypto';
import {
  manifestIdentity,
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
});
