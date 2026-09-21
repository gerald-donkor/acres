import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import {
  GEOBOUNDARIES_ACQUISITION_CATEGORIES,
  GeoBoundariesAcquisitionError,
  GeoBoundariesProvider,
  createAcquiredManifest,
  isGeoBoundariesAcquisitionCategory,
  metadataToLayer,
  safeFetch,
  selectionPath,
  writeResponseToFile,
  type ProviderMetadata,
} from './geoboundaries-provider';
import {
  GEOBOUNDARIES_MAX_ARTIFACT_BYTES,
  type GeoBoundariesLayerManifest,
  type GeoBoundariesSelection,
} from './geoboundaries.types';

describe('GeoBoundariesProvider and acquisition helpers', () => {
  describe('GEOBOUNDARIES_ACQUISITION_CATEGORIES', () => {
    it('contains all canonical error categories in order', () => {
      expect(GEOBOUNDARIES_ACQUISITION_CATEGORIES).toEqual([
        'selection',
        'discovery',
        'acquisition',
        'checksum',
        'provider-schema',
      ]);
    });
  });

  describe('isGeoBoundariesAcquisitionCategory', () => {
    it('returns true for all canonical categories', () => {
      for (const cat of GEOBOUNDARIES_ACQUISITION_CATEGORIES) {
        expect(isGeoBoundariesAcquisitionCategory(cat)).toBe(true);
      }
    });

    it('returns false for invalid values or casing', () => {
      expect(isGeoBoundariesAcquisitionCategory('SELECTION')).toBe(false);
      expect(isGeoBoundariesAcquisitionCategory('network')).toBe(false);
      expect(isGeoBoundariesAcquisitionCategory('')).toBe(false);
      expect(
        isGeoBoundariesAcquisitionCategory(null as unknown as string),
      ).toBe(false);
      expect(
        isGeoBoundariesAcquisitionCategory(undefined as unknown as string),
      ).toBe(false);
    });
  });

  describe('GeoBoundariesAcquisitionError', () => {
    it('sets name, category, and message', () => {
      const error = new GeoBoundariesAcquisitionError(
        'discovery',
        'Failed to discover metadata',
      );
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(GeoBoundariesAcquisitionError);
      expect(error.name).toBe('GeoBoundariesAcquisitionError');
      expect(error.category).toBe('discovery');
      expect(error.message).toBe('Failed to discover metadata');
    });
  });

  describe('selectionPath', () => {
    it('constructs expected geoBoundaries URL for valid selection', () => {
      const url = selectionPath({ countryCode: 'USA', level: 'ADM1' });
      expect(url.toString()).toBe(
        'https://www.geoboundaries.org/api/current/gbOpen/USA/ADM1/',
      );
    });

    it('throws selection error for lowercase countryCode', () => {
      expect(() =>
        selectionPath({ countryCode: 'usa', level: 'ADM1' }),
      ).toThrow(GeoBoundariesAcquisitionError);
      try {
        selectionPath({ countryCode: 'usa', level: 'ADM1' });
      } catch (err) {
        expect((err as GeoBoundariesAcquisitionError).category).toBe(
          'selection',
        );
      }
    });

    it('throws selection error for invalid country length or format', () => {
      expect(() =>
        selectionPath({ countryCode: '123', level: 'ADM1' }),
      ).toThrow(GeoBoundariesAcquisitionError);
    });

    it('throws selection error for invalid ADM level', () => {
      expect(() =>
        selectionPath({
          countryCode: 'USA',
          level: 'ADM6' as GeoBoundariesSelection['level'],
        }),
      ).toThrow(GeoBoundariesAcquisitionError);
      expect(() =>
        selectionPath({
          countryCode: 'USA',
          level: 'adm1' as GeoBoundariesSelection['level'],
        }),
      ).toThrow(GeoBoundariesAcquisitionError);
    });
  });

  describe('safeFetch', () => {
    const originalFetch = globalThis.fetch;

    afterEach(() => {
      globalThis.fetch = originalFetch;
    });

    it('rejects non-https URLs', async () => {
      const url = new URL('http://www.geoboundaries.org/test');
      await expect(safeFetch(url, 'www.geoboundaries.org')).rejects.toThrow(
        GeoBoundariesAcquisitionError,
      );
    });

    it('rejects unexpected hostnames', async () => {
      const url = new URL('https://evil.com/test');
      await expect(safeFetch(url, 'www.geoboundaries.org')).rejects.toThrow(
        GeoBoundariesAcquisitionError,
      );
    });

    it('rejects URLs with credentials', async () => {
      const url = new URL('https://user:pass@www.geoboundaries.org/test');
      await expect(safeFetch(url, 'www.geoboundaries.org')).rejects.toThrow(
        GeoBoundariesAcquisitionError,
      );
    });

    it('rejects HTTP redirects (301/302)', async () => {
      const mockRedirect = {
        status: 301,
        ok: false,
      } as unknown as Response;
      globalThis.fetch = jest.fn().mockResolvedValue(mockRedirect);

      const url = new URL('https://www.geoboundaries.org/test');
      await expect(safeFetch(url, 'www.geoboundaries.org')).rejects.toThrow(
        'Provider redirects are rejected.',
      );
    });

    it('rejects HTTP errors (!ok, 404/500)', async () => {
      const mockError = {
        status: 404,
        ok: false,
      } as unknown as Response;
      globalThis.fetch = jest.fn().mockResolvedValue(mockError);

      const url = new URL('https://www.geoboundaries.org/test');
      await expect(safeFetch(url, 'www.geoboundaries.org')).rejects.toThrow(
        'Provider returned HTTP 404.',
      );
    });

    it('handles network failure or timeout by throwing acquisition error', async () => {
      globalThis.fetch = jest
        .fn()
        .mockRejectedValue(new Error('Network offline'));

      const url = new URL('https://www.geoboundaries.org/test');
      await expect(safeFetch(url, 'www.geoboundaries.org')).rejects.toThrow(
        'Provider request failed or timed out.',
      );
    });

    it('returns response on successful fetch', async () => {
      const mockResponse = {
        status: 200,
        ok: true,
      } as Response;
      globalThis.fetch = jest.fn().mockResolvedValue(mockResponse);

      const url = new URL('https://www.geoboundaries.org/test');
      const response = await safeFetch(url, 'www.geoboundaries.org');
      expect(response).toBe(mockResponse);
    });
  });

  describe('metadataToLayer', () => {
    const validSelection: GeoBoundariesSelection = {
      countryCode: 'GHA',
      level: 'ADM1',
    };

    const validMetadata: ProviderMetadata = {
      boundaryID: 'GHA-ADM1-123456',
      boundaryISO: 'GHA',
      boundaryType: 'ADM1',
      boundaryYearRepresented: '2023',
      sourceDataUpdateDate: '2023-01-01',
      buildDate: '2023-06-01',
      boundarySource: 'Ghana Statistical Service',
      boundaryLicense: 'CC BY 4.0',
      licenseDetail: 'Open data license detail',
      licenseSource: 'https://statsghana.gov.gh',
      gjDownloadURL:
        'https://raw.githubusercontent.com/wmgeolab/geoBoundaries/0123456789abcdef0123456789abcdef01234567/releaseData/gbOpen/GHA/ADM1/geoBoundaries-GHA-ADM1.geojson',
      admUnitCount: 16,
    };

    it('transforms valid metadata into GeoBoundariesLayerManifest', () => {
      const layer = metadataToLayer(
        validMetadata,
        validSelection,
        'sha256-hash-value',
        5000,
      );

      expect(layer).toEqual({
        provider: 'geoBoundaries',
        releaseType: 'gbOpen',
        countryCode: 'GHA',
        level: 'ADM1',
        boundaryId: 'GHA-ADM1-123456',
        representedYear: '2023',
        sourceUpdateDate: '2023-01-01',
        buildDate: '2023-06-01',
        boundarySource: 'Ghana Statistical Service',
        boundaryLicense: 'CC BY 4.0',
        licenseDetail: 'Open data license detail',
        licenseSource: 'https://statsghana.gov.gh',
        sourceUrl: 'https://www.geoboundaries.org/api/current/gbOpen/GHA/ADM1/',
        artifactUrl:
          'https://raw.githubusercontent.com/wmgeolab/geoBoundaries/0123456789abcdef0123456789abcdef01234567/releaseData/gbOpen/GHA/ADM1/geoBoundaries-GHA-ADM1.geojson',
        sha256: 'sha256-hash-value',
        byteLength: 5000,
        featureCount: 16,
        attribution:
          'Contains modified geoBoundaries data. Source: https://www.geoboundaries.org/ (CC BY 4.0).',
        modificationNote:
          'Acres stores normalized administrative-region records and geometry; no boundary hierarchy is inferred.',
        hierarchyMode: 'explicit-parent-map',
      });
    });

    it('sets country-root hierarchyMode for ADM0', () => {
      const sel: GeoBoundariesSelection = { countryCode: 'GHA', level: 'ADM0' };
      const meta: ProviderMetadata = {
        ...validMetadata,
        boundaryType: 'ADM0',
        gjDownloadURL:
          'https://raw.githubusercontent.com/wmgeolab/geoBoundaries/0123456789abcdef0123456789abcdef01234567/releaseData/gbOpen/GHA/ADM0/geoBoundaries-GHA-ADM0.geojson',
      };
      const layer = metadataToLayer(meta, sel, 'hash', 100);
      expect(layer.hierarchyMode).toBe('country-root');
    });

    it('sets unresolved hierarchyMode for ADM2 and deeper', () => {
      const sel: GeoBoundariesSelection = { countryCode: 'GHA', level: 'ADM2' };
      const meta: ProviderMetadata = {
        ...validMetadata,
        boundaryType: 'ADM2',
        gjDownloadURL:
          'https://raw.githubusercontent.com/wmgeolab/geoBoundaries/0123456789abcdef0123456789abcdef01234567/releaseData/gbOpen/GHA/ADM2/geoBoundaries-GHA-ADM2.geojson',
      };
      const layer = metadataToLayer(meta, sel, 'hash', 100);
      expect(layer.hierarchyMode).toBe('unresolved');
    });

    it('throws provider-schema if gjDownloadURL is not commit addressed', () => {
      const meta: ProviderMetadata = {
        ...validMetadata,
        gjDownloadURL:
          'https://raw.githubusercontent.com/wmgeolab/geoBoundaries/main/releaseData/gbOpen/GHA/ADM1/geoBoundaries-GHA-ADM1.geojson',
      };
      expect(() => metadataToLayer(meta, validSelection, 'hash', 100)).toThrow(
        'Provider GeoJSON link is not a commit-addressed raw GitHub artifact.',
      );
    });

    it('throws provider-schema if country or level does not match selection', () => {
      const metaMismatch: ProviderMetadata = {
        ...validMetadata,
        boundaryISO: 'USA',
      };
      expect(() =>
        metadataToLayer(metaMismatch, validSelection, 'hash', 100),
      ).toThrow(
        'Provider metadata does not match the requested country/ADM layer.',
      );
    });

    it('throws provider-schema if featureCount is invalid or exceeds 50000', () => {
      const metaInvalidCount: ProviderMetadata = {
        ...validMetadata,
        admUnitCount: 0,
      };
      expect(() =>
        metadataToLayer(metaInvalidCount, validSelection, 'hash', 100),
      ).toThrow('Provider feature count is outside accepted limits.');

      const metaOverLimit: ProviderMetadata = {
        ...validMetadata,
        admUnitCount: 50001,
      };
      expect(() =>
        metadataToLayer(metaOverLimit, validSelection, 'hash', 100),
      ).toThrow('Provider feature count is outside accepted limits.');
    });

    it('throws provider-schema on control characters in string fields', () => {
      const metaBadString: ProviderMetadata = {
        ...validMetadata,
        boundarySource: 'Source\u0000WithControlChar',
      };
      expect(() =>
        metadataToLayer(metaBadString, validSelection, 'hash', 100),
      ).toThrow('Provider metadata boundarySource is invalid.');
    });
  });

  describe('writeResponseToFile', () => {
    let testDir: string;

    beforeEach(async () => {
      testDir = await mkdtemp(join(tmpdir(), 'acres-provider-test-'));
    });

    afterEach(async () => {
      await rm(testDir, { recursive: true, force: true });
    });

    it('throws acquisition error when response body is missing', async () => {
      const mockResponse = {
        body: null,
        headers: new Headers(),
      } as Response;

      await expect(
        writeResponseToFile(mockResponse, join(testDir, 'test.geojson')),
      ).rejects.toThrow('Provider artifact has no response body.');
    });

    it('throws acquisition error when content-type is not JSON/GeoJSON', async () => {
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('{}'));
          controller.close();
        },
      });

      const mockResponse = {
        body: stream,
        headers: new Headers({ 'content-type': 'text/html' }),
      } as unknown as Response;

      await expect(
        writeResponseToFile(mockResponse, join(testDir, 'test.geojson')),
      ).rejects.toThrow('Provider artifact content type is not GeoJSON/JSON.');
    });

    it('writes valid GeoJSON stream to file and calculates sha256', async () => {
      const jsonContent = JSON.stringify({
        type: 'FeatureCollection',
        features: [],
      });
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(jsonContent));
          controller.close();
        },
      });

      const mockResponse = {
        body: stream,
        headers: new Headers({
          'content-type': 'application/geo+json',
          'content-length': String(jsonContent.length),
        }),
      } as unknown as Response;

      const targetPath = join(testDir, 'output.geojson');
      const result = await writeResponseToFile(mockResponse, targetPath);

      expect(result.byteLength).toBe(jsonContent.length);
      expect(result.sha256).toMatch(/^[a-f0-9]{64}$/);

      const written = await readFile(targetPath, 'utf8');
      expect(written).toBe(jsonContent);
    });

    it('throws acquisition error when content-length exceeds max byte limit', async () => {
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array(10));
          controller.close();
        },
      });
      const mockResponse = {
        body: stream,
        headers: new Headers({
          'content-type': 'application/geo+json',
          'content-length': String(GEOBOUNDARIES_MAX_ARTIFACT_BYTES + 1),
        }),
      } as unknown as Response;

      await expect(
        writeResponseToFile(mockResponse, join(testDir, 'test.geojson')),
      ).rejects.toThrow('Provider artifact exceeds the byte limit.');
    });

    it('throws acquisition error when streamed byte length exceeds max byte limit', async () => {
      const largeChunk = {
        byteLength: GEOBOUNDARIES_MAX_ARTIFACT_BYTES + 1,
      } as Uint8Array;
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(largeChunk);
          controller.close();
        },
      });
      const mockResponse = {
        body: stream,
        headers: new Headers({
          'content-type': 'application/geo+json',
        }),
      } as unknown as Response;

      await expect(
        writeResponseToFile(mockResponse, join(testDir, 'test.geojson')),
      ).rejects.toThrow('Provider artifact exceeds the byte limit.');
    });
  });

  describe('GeoBoundariesProvider.prototype.acquire', () => {
    let testDir: string;
    let originalFetch: typeof globalThis.fetch;
    const selection: GeoBoundariesSelection = {
      countryCode: 'GHA',
      level: 'ADM1',
    };

    const validMetadata = {
      boundaryID: 'GHA-ADM1-12345',
      boundaryISO: 'GHA',
      boundaryType: 'ADM1',
      boundaryYearRepresented: '2023',
      sourceDataUpdateDate: '2023-01-01',
      buildDate: '2023-02-01',
      boundarySource: 'Test Source',
      boundaryLicense: 'CC-BY-4.0',
      licenseDetail: 'Test details',
      licenseSource: 'https://example.com/license',
      gjDownloadURL:
        'https://raw.githubusercontent.com/wmgeolab/geoBoundaries/0123456789abcdef0123456789abcdef01234567/boundary.geojson',
      admUnitCount: '16',
    };

    beforeEach(async () => {
      testDir = await mkdtemp(join(tmpdir(), 'acres-acquire-test-'));
      originalFetch = globalThis.fetch;
    });

    afterEach(async () => {
      globalThis.fetch = originalFetch;
      await rm(testDir, { recursive: true, force: true });
    });

    it('successfully acquires and persists boundary artifact with manifest', async () => {
      const jsonContent = JSON.stringify({
        type: 'FeatureCollection',
        features: [],
      });
      globalThis.fetch = jest.fn().mockImplementation((url: string | URL) => {
        const urlStr = url.toString();
        if (urlStr.includes('www.geoboundaries.org')) {
          return Promise.resolve(
            new Response(JSON.stringify(validMetadata), {
              status: 200,
              headers: { 'content-type': 'application/json' },
            }),
          );
        }
        return Promise.resolve(
          new Response(jsonContent, {
            status: 200,
            headers: {
              'content-type': 'application/geo+json',
              'content-length': String(jsonContent.length),
            },
          }),
        );
      });

      const provider = new GeoBoundariesProvider();
      const result = await provider.acquire(selection, testDir);

      expect(result.artifactPath).toBe(join(testDir, 'GHA-ADM1.geojson'));
      expect(result.layer.countryCode).toBe('GHA');
      expect(result.layer.level).toBe('ADM1');
      const saved = await readFile(result.artifactPath, 'utf8');
      expect(saved).toBe(jsonContent);
    });

    it('cleans up temporary file and rethrows if artifact download fails', async () => {
      globalThis.fetch = jest.fn().mockImplementation((url: string | URL) => {
        const urlStr = url.toString();
        if (urlStr.includes('www.geoboundaries.org')) {
          return Promise.resolve(
            new Response(JSON.stringify(validMetadata), {
              status: 200,
              headers: { 'content-type': 'application/json' },
            }),
          );
        }
        return Promise.resolve(
          new Response('Forbidden', {
            status: 403,
            headers: { 'content-type': 'text/plain' },
          }),
        );
      });

      const provider = new GeoBoundariesProvider();
      await expect(provider.acquire(selection, testDir)).rejects.toThrow(
        GeoBoundariesAcquisitionError,
      );

      const targetPath = join(testDir, 'GHA-ADM1.geojson');
      await expect(readFile(targetPath)).rejects.toThrow();
    });
  });

  describe('GeoBoundariesProvider.artifactFilename', () => {
    it('returns filename when artifactUrl ends with .geojson', () => {
      const layer = {
        countryCode: 'GHA',
        level: 'ADM1',
        artifactUrl: 'https://example.com/data/boundary.geojson',
      } as unknown as GeoBoundariesLayerManifest;
      expect(GeoBoundariesProvider.artifactFilename(layer)).toBe(
        'GHA-ADM1.geojson',
      );
    });

    it('returns empty string when artifactUrl does not end with .geojson', () => {
      const layer = {
        countryCode: 'GHA',
        level: 'ADM1',
        artifactUrl: 'https://example.com/data/boundary.zip',
      } as unknown as GeoBoundariesLayerManifest;
      expect(GeoBoundariesProvider.artifactFilename(layer)).toBe('');
    });
  });

  describe('createAcquiredManifest', () => {
    it('creates deterministic manifest with identitySha256 and sorted layers', () => {
      const layer1 = {
        countryCode: 'USA',
        level: 'ADM1',
      } as unknown as GeoBoundariesLayerManifest;
      const layer2 = {
        countryCode: 'GHA',
        level: 'ADM0',
      } as unknown as GeoBoundariesLayerManifest;

      const manifest = createAcquiredManifest([layer1, layer2]);

      expect(manifest.schemaVersion).toBe(1);
      expect(manifest.layers).toEqual([layer2, layer1]);
      expect(manifest.identitySha256).toMatch(/^[a-f0-9]{64}$/);
    });
  });
});
