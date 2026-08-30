import { createHash } from 'node:crypto';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import {
  GEOBOUNDARIES_MANIFEST_SCHEMA_VERSION,
  GEOBOUNDARIES_MAX_ARTIFACT_BYTES,
  type GeoBoundariesLayerManifest,
  type GeoBoundariesSelection,
} from './geoboundaries.types';
import { isCommitAddressedArtifactUrl } from './geoboundaries-manifest';

const API_HOST = 'www.geoboundaries.org';
const ARTIFACT_HOST = 'raw.githubusercontent.com';
const TIMEOUT_MS = 15_000;
const USER_AGENT = 'Acres-geoBoundaries-import/1.0 (+https://github.com/acres)';

interface ProviderMetadata {
  boundaryID: unknown;
  boundaryISO: unknown;
  boundaryType: unknown;
  boundaryYearRepresented: unknown;
  sourceDataUpdateDate: unknown;
  buildDate: unknown;
  boundarySource: unknown;
  boundaryLicense: unknown;
  licenseDetail: unknown;
  licenseSource: unknown;
  gjDownloadURL: unknown;
  admUnitCount: unknown;
}

export class GeoBoundariesAcquisitionError extends Error {
  constructor(
    readonly category:
      | 'selection'
      | 'discovery'
      | 'acquisition'
      | 'checksum'
      | 'provider-schema',
    message: string,
  ) {
    super(message);
    this.name = 'GeoBoundariesAcquisitionError';
  }
}

function selectionPath(selection: GeoBoundariesSelection): URL {
  if (
    !/^[A-Z]{3}$/.test(selection.countryCode) ||
    !/^ADM[01]$/.test(selection.level)
  )
    throw new GeoBoundariesAcquisitionError(
      'selection',
      'Selections require an uppercase ISO-3166 alpha-3 country and ADM0 through ADM5 level.',
    );
  return new URL(
    `/api/current/gbOpen/${selection.countryCode}/${selection.level}/`,
    `https://${API_HOST}`,
  );
}

async function safeFetch(url: URL, expectedHost: string): Promise<Response> {
  if (
    url.protocol !== 'https:' ||
    url.hostname !== expectedHost ||
    url.username ||
    url.password
  )
    throw new GeoBoundariesAcquisitionError(
      'acquisition',
      'Outbound URL violates the provider allowlist.',
    );
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      redirect: 'manual',
      signal: controller.signal,
      headers: {
        accept: 'application/json,application/geo+json',
        'user-agent': USER_AGENT,
      },
    });
    if (response.status >= 300 && response.status < 400)
      throw new GeoBoundariesAcquisitionError(
        'acquisition',
        'Provider redirects are rejected.',
      );
    if (!response.ok)
      throw new GeoBoundariesAcquisitionError(
        'acquisition',
        `Provider returned HTTP ${response.status}.`,
      );
    return response;
  } catch (error) {
    if (error instanceof GeoBoundariesAcquisitionError) throw error;
    throw new GeoBoundariesAcquisitionError(
      'acquisition',
      'Provider request failed or timed out.',
    );
  } finally {
    clearTimeout(timer);
  }
}

function string(value: unknown, key: string, allowEmpty = false): string {
  if (
    typeof value !== 'string' ||
    value.length > 2048 ||
    (!allowEmpty && value.length === 0) ||
    // eslint-disable-next-line no-control-regex -- reject untrusted control characters.
    /[\u0000-\u001f\u007f]/.test(value)
  )
    throw new GeoBoundariesAcquisitionError(
      'provider-schema',
      `Provider metadata ${key} is invalid.`,
    );
  return value;
}

function metadataToLayer(
  metadata: ProviderMetadata,
  selection: GeoBoundariesSelection,
  checksum: string,
  byteLength: number,
): GeoBoundariesLayerManifest {
  const artifactUrl = new URL(string(metadata.gjDownloadURL, 'gjDownloadURL'));
  if (!isCommitAddressedArtifactUrl(artifactUrl))
    throw new GeoBoundariesAcquisitionError(
      'provider-schema',
      'Provider GeoJSON link is not a commit-addressed raw GitHub artifact.',
    );
  if (
    string(metadata.boundaryISO, 'boundaryISO') !== selection.countryCode ||
    string(metadata.boundaryType, 'boundaryType') !== selection.level
  )
    throw new GeoBoundariesAcquisitionError(
      'provider-schema',
      'Provider metadata does not match the requested country/ADM layer.',
    );
  const featureCount = Number(metadata.admUnitCount);
  if (
    !Number.isSafeInteger(featureCount) ||
    featureCount < 1 ||
    featureCount > 50_000
  )
    throw new GeoBoundariesAcquisitionError(
      'provider-schema',
      'Provider feature count is outside accepted limits.',
    );
  return {
    provider: 'geoBoundaries',
    releaseType: 'gbOpen',
    countryCode: selection.countryCode,
    level: selection.level,
    boundaryId: string(metadata.boundaryID, 'boundaryID'),
    representedYear: string(
      metadata.boundaryYearRepresented,
      'boundaryYearRepresented',
    ),
    sourceUpdateDate: string(
      metadata.sourceDataUpdateDate,
      'sourceDataUpdateDate',
    ),
    buildDate: string(metadata.buildDate, 'buildDate'),
    boundarySource: string(metadata.boundarySource, 'boundarySource'),
    boundaryLicense: string(metadata.boundaryLicense, 'boundaryLicense'),
    licenseDetail: string(metadata.licenseDetail, 'licenseDetail', true),
    licenseSource: string(metadata.licenseSource, 'licenseSource'),
    sourceUrl: `https://${API_HOST}/api/current/gbOpen/${selection.countryCode}/${selection.level}/`,
    artifactUrl: artifactUrl.toString(),
    sha256: checksum,
    byteLength,
    featureCount,
    attribution:
      'Contains modified geoBoundaries data. Source: https://www.geoboundaries.org/ (CC BY 4.0).',
    modificationNote:
      'Acres stores normalized administrative-region records and geometry; no boundary hierarchy is inferred.',
    hierarchyMode:
      selection.level === 'ADM0'
        ? 'country-root'
        : selection.level === 'ADM1'
          ? 'explicit-parent-map'
          : 'unresolved',
  };
}

async function writeResponseToFile(
  response: Response,
  target: string,
): Promise<{ sha256: string; byteLength: number }> {
  if (!response.body)
    throw new GeoBoundariesAcquisitionError(
      'acquisition',
      'Provider artifact has no response body.',
    );
  const contentType = response.headers.get('content-type') ?? '';
  if (!/application\/(geo\+json|json)|text\/json/i.test(contentType))
    throw new GeoBoundariesAcquisitionError(
      'acquisition',
      'Provider artifact content type is not GeoJSON/JSON.',
    );
  const contentLength = response.headers.get('content-length');
  if (
    contentLength &&
    (!/^\d+$/.test(contentLength) ||
      Number(contentLength) > GEOBOUNDARIES_MAX_ARTIFACT_BYTES)
  )
    throw new GeoBoundariesAcquisitionError(
      'acquisition',
      'Provider artifact exceeds the byte limit.',
    );
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  const hash = createHash('sha256');
  for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
    byteLength += chunk.byteLength;
    if (byteLength > GEOBOUNDARIES_MAX_ARTIFACT_BYTES)
      throw new GeoBoundariesAcquisitionError(
        'acquisition',
        'Provider artifact exceeds the byte limit.',
      );
    hash.update(chunk);
    chunks.push(chunk);
  }
  await writeFile(target, Buffer.concat(chunks), { mode: 0o600 });
  return { sha256: hash.digest('hex'), byteLength };
}

/** Discovery uses geoBoundaries' mutable API, while every retained artifact URL is immutable. */
export class GeoBoundariesProvider {
  async acquire(
    selection: GeoBoundariesSelection,
    workDirectory: string,
  ): Promise<{ layer: GeoBoundariesLayerManifest; artifactPath: string }> {
    const discoveryUrl = selectionPath(selection);
    const discovery = await safeFetch(discoveryUrl, API_HOST);
    let metadata: ProviderMetadata;
    try {
      metadata = (await discovery.json()) as ProviderMetadata;
    } catch {
      throw new GeoBoundariesAcquisitionError(
        'discovery',
        'Provider discovery response was not JSON.',
      );
    }
    const artifactCandidate = new URL(
      string(metadata.gjDownloadURL, 'gjDownloadURL'),
    );
    if (
      artifactCandidate.hostname !== ARTIFACT_HOST ||
      !isCommitAddressedArtifactUrl(artifactCandidate) ||
      artifactCandidate.search ||
      artifactCandidate.hash ||
      artifactCandidate.username ||
      artifactCandidate.password
    )
      throw new GeoBoundariesAcquisitionError(
        'provider-schema',
        'Provider artifact host is not allowed.',
      );
    const absoluteWorkDirectory = resolve(workDirectory);
    await mkdir(absoluteWorkDirectory, { recursive: true, mode: 0o700 });
    const filename = `${selection.countryCode}-${selection.level}.geojson`;
    const artifactPath = join(absoluteWorkDirectory, filename);
    const tempPath = `${artifactPath}.${process.pid}.tmp`;
    try {
      const artifact = await safeFetch(artifactCandidate, ARTIFACT_HOST);
      const received = await writeResponseToFile(artifact, tempPath);
      const layer = metadataToLayer(
        metadata,
        selection,
        received.sha256,
        received.byteLength,
      );
      await rename(tempPath, artifactPath);
      return { layer, artifactPath };
    } catch (error) {
      await rm(tempPath, { force: true });
      throw error;
    }
  }

  static artifactFilename(layer: GeoBoundariesLayerManifest): string {
    return basename(new URL(layer.artifactUrl).pathname).endsWith('.geojson')
      ? `${layer.countryCode}-${layer.level}.geojson`
      : '';
  }
}

export function createAcquiredManifest(
  layers: readonly GeoBoundariesLayerManifest[],
): Record<string, unknown> {
  const canonicalLayers = [...layers].sort((a, b) =>
    `${a.countryCode}/${a.level}`.localeCompare(`${b.countryCode}/${b.level}`),
  );
  const identity = createHash('sha256')
    .update(
      JSON.stringify({
        schemaVersion: GEOBOUNDARIES_MANIFEST_SCHEMA_VERSION,
        layers: canonicalLayers,
      }),
    )
    .digest('hex');
  return {
    schemaVersion: GEOBOUNDARIES_MANIFEST_SCHEMA_VERSION,
    acquiredAt: new Date().toISOString(),
    layers: canonicalLayers,
    identitySha256: identity,
  };
}
