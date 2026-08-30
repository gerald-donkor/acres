import { normalizeGeoBoundariesLayer } from './geoboundaries-normalizer';
import type { GeoBoundariesLayerManifest } from './geoboundaries.types';

const layer: GeoBoundariesLayerManifest = {
  provider: 'geoBoundaries',
  releaseType: 'gbOpen',
  countryCode: 'GHA',
  level: 'ADM1',
  boundaryId: 'GHA-ADM1-test',
  representedYear: '2024',
  sourceUpdateDate: '2024-01-01T00:00:00.000Z',
  buildDate: '2024-02-01T00:00:00.000Z',
  boundarySource: 'fixture',
  boundaryLicense: 'CC BY 4.0',
  licenseDetail: '',
  licenseSource: 'https://example.org/license',
  sourceUrl: 'https://example.org/source',
  artifactUrl:
    'https://raw.githubusercontent.com/wmgeolab/geoBoundaries/0123456789abcdef0123456789abcdef01234567/releaseData/gbOpen/GHA/ADM1/fixture.geojson',
  sha256: 'a'.repeat(64),
  byteLength: 100,
  featureCount: 1,
  attribution: 'geoBoundaries',
  modificationNote: 'none',
  hierarchyMode: 'explicit-parent-map',
};
const feature = {
  type: 'Feature',
  properties: {
    shapeID: 'GHA.1_1',
    shapeName: 'Fixture',
    shapeGroup: 'GHA',
    shapeType: 'ADM1',
    shapeISO: 'GHA',
  },
  geometry: {
    type: 'Polygon',
    coordinates: [
      [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 0],
      ],
    ],
  },
};

describe('normalizeGeoBoundariesLayer', () => {
  it('accepts matching Polygon features and rejects source identity drift', () => {
    expect(
      normalizeGeoBoundariesLayer(layer, {
        type: 'FeatureCollection',
        features: [feature],
      }).features[0].shapeId,
    ).toBe('GHA.1_1');
    expect(() =>
      normalizeGeoBoundariesLayer(layer, {
        type: 'FeatureCollection',
        features: [
          {
            ...feature,
            properties: { ...feature.properties, shapeGroup: 'USA' },
          },
        ],
      }),
    ).toThrow('does not match');
  });
});
