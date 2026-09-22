import { createHash } from 'node:crypto';
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { NestFactory } from '@nestjs/core';
import {
  acquire,
  arg,
  atomicJson,
  fail,
  importManifest,
  main,
  normalizedManifest,
  regularInside,
  reviewHierarchy,
  selections,
  workDirectory,
} from './geoboundaries-cli';
import { GeoBoundariesImportService } from './geoboundaries-import.service';
import { manifestIdentity } from './geoboundaries-manifest';
import { GeoBoundariesProvider } from './geoboundaries-provider';
import type {
  GeoBoundariesLayerManifest,
  GeoBoundariesLevel,
} from './geoboundaries.types';

describe('geoBoundaries CLI', () => {
  let directory: string;
  let logSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;
  const originalArgv = process.argv;
  const originalExitCode = process.exitCode;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'acres-geoboundaries-cli-'));
    logSpy = jest.spyOn(console, 'log').mockImplementation();
    errorSpy = jest.spyOn(console, 'error').mockImplementation();
    process.exitCode = undefined;
  });

  afterEach(async () => {
    process.argv = originalArgv;
    process.exitCode = originalExitCode;
    jest.restoreAllMocks();
    await rm(directory, { recursive: true, force: true });
  });

  function geoJson(level: GeoBoundariesLevel, shapeId: string) {
    return {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: {
            shapeID: shapeId,
            shapeName: shapeId,
            shapeGroup: 'GHA',
            shapeType: level,
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
        },
      ],
    };
  }

  function layer(
    level: GeoBoundariesLevel,
    bytes: Buffer,
  ): GeoBoundariesLayerManifest {
    return {
      provider: 'geoBoundaries',
      releaseType: 'gbOpen',
      countryCode: 'GHA',
      level,
      boundaryId: `GHA-${level}-fixture`,
      representedYear: '2026',
      sourceUpdateDate: '2026-09-01T00:00:00.000Z',
      buildDate: '2026-09-02T00:00:00.000Z',
      boundarySource: 'Synthetic fixture',
      boundaryLicense: 'CC BY 4.0',
      licenseDetail: '',
      licenseSource: 'https://example.org/license',
      sourceUrl: `https://www.geoboundaries.org/api/current/gbOpen/GHA/${level}/`,
      artifactUrl: `https://raw.githubusercontent.com/wmgeolab/geoBoundaries/0123456789abcdef0123456789abcdef01234567/releaseData/gbOpen/GHA/${level}/fixture.geojson`,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      byteLength: bytes.byteLength,
      featureCount: 1,
      attribution: 'Contains modified geoBoundaries data.',
      modificationNote: 'Normalized only.',
      hierarchyMode:
        level === 'ADM0'
          ? 'country-root'
          : level === 'ADM1'
            ? 'explicit-parent-map'
            : 'unresolved',
    };
  }

  async function writeManifest(
    levels: readonly GeoBoundariesLevel[] = ['ADM0'],
  ) {
    const layers: GeoBoundariesLayerManifest[] = [];
    for (const level of levels) {
      const source = geoJson(
        level,
        level === 'ADM0' ? 'root' : level === 'ADM1' ? 'parent' : 'child',
      );
      const bytes = Buffer.from(JSON.stringify(source));
      await writeFile(join(directory, `GHA-${level}.geojson`), bytes);
      layers.push(layer(level, bytes));
    }
    const manifest = {
      schemaVersion: 1,
      acquiredAt: '2026-09-22T00:00:00.000Z',
      layers,
      identitySha256: manifestIdentity(layers),
    };
    const manifestPath = join(directory, 'manifest.json');
    await writeFile(manifestPath, JSON.stringify(manifest));
    return { manifest, manifestPath };
  }

  it('fails with a namespaced error and exit code 2', () => {
    expect(() => fail('bad input')).toThrow('bad input');
    expect(errorSpy).toHaveBeenCalledWith('geography-cli: bad input');
    expect(process.exitCode).toBe(2);
  });

  it('reads named arguments and rejects missing values', () => {
    expect(arg(['--workdir', directory], '--workdir')).toBe(directory);
    expect(() => arg([], '--workdir')).toThrow('missing --workdir');
    expect(() => arg(['--workdir'], '--workdir')).toThrow('missing --workdir');
  });

  it('parses unique country and level selections', () => {
    expect(selections('GHA/ADM0,GHA/ADM1')).toEqual([
      { countryCode: 'GHA', level: 'ADM0' },
      { countryCode: 'GHA', level: 'ADM1' },
    ]);
  });

  it.each(['', 'ghA/ADM0', 'GH/ADM0', 'GHA/adm0', 'GHA/ADM6', 'GHA'])(
    'rejects malformed selection %p',
    (value) => {
      expect(() => selections(value)).toThrow(
        'selection must be comma-separated ISO3/ADM0..ADM5 entries.',
      );
    },
  );

  it('rejects duplicate selections', () => {
    expect(() => selections('GHA/ADM0,GHA/ADM0')).toThrow(
      'selection must be non-empty and unique.',
    );
  });

  it('resolves a dedicated work directory and rejects cwd and root', () => {
    expect(workDirectory(directory)).toBe(resolve(directory));
    expect(() => workDirectory(process.cwd())).toThrow('dedicated operator');
    expect(() => workDirectory('/')).toThrow('dedicated operator');
  });

  it('writes JSON atomically with private parent and file modes', async () => {
    const target = join(directory, 'nested', 'value.json');
    await atomicJson(target, { ok: true });
    expect(await readFile(target, 'utf8')).toBe('{\n  "ok": true\n}\n');
    expect((await lstat(join(directory, 'nested'))).mode & 0o777).toBe(0o700);
    expect((await lstat(target)).mode & 0o777).toBe(0o600);
    expect(await readdir(join(directory, 'nested'))).toEqual(['value.json']);
  });

  it('removes its temporary file when the atomic rename fails', async () => {
    const target = join(directory, 'destination');
    await mkdir(target);
    await expect(atomicJson(target, { ok: true })).rejects.toBeDefined();
    expect(await readdir(directory)).toEqual(['destination']);
  });

  it('accepts only regular non-symlink files inside the workdir', async () => {
    const file = join(directory, 'file.json');
    await writeFile(file, '{}');
    await expect(
      regularInside(directory, file, 'fixture'),
    ).resolves.toBeUndefined();
    await expect(
      regularInside(directory, directory, 'fixture'),
    ).rejects.toThrow('must be a file inside --workdir');
    await expect(
      regularInside(
        directory,
        join(directory, '..', 'outside.json'),
        'fixture',
      ),
    ).rejects.toThrow('must be a file inside --workdir');
    await expect(
      regularInside(directory, join(directory, 'missing.json'), 'fixture'),
    ).rejects.toThrow('is not a regular file');
    const link = join(directory, 'link.json');
    await symlink(file, link);
    await expect(regularInside(directory, link, 'fixture')).rejects.toThrow(
      'non-symlink regular file',
    );
    const outside = await mkdtemp(join(tmpdir(), 'acres-cli-outside-'));
    try {
      const outsideFile = join(outside, 'outside.json');
      await writeFile(outsideFile, '{}');
      const linkedDirectory = join(directory, 'linked-directory');
      await symlink(outside, linkedDirectory);
      await expect(
        regularInside(
          directory,
          join(linkedDirectory, 'outside.json'),
          'fixture',
        ),
      ).rejects.toThrow('must resolve to a file inside --workdir');
    } finally {
      await rm(outside, { recursive: true, force: true });
    }
    const subdirectory = join(directory, 'subdirectory');
    await mkdir(subdirectory);
    await expect(
      regularInside(directory, subdirectory, 'fixture'),
    ).rejects.toThrow('non-symlink regular file');
  });

  it('validates checksums and normalizes manifest artifacts', async () => {
    const { manifest, manifestPath } = await writeManifest();
    await expect(
      normalizedManifest(directory, manifestPath),
    ).resolves.toMatchObject({
      manifest: { identitySha256: manifest.identitySha256 },
      normalized: [{ features: [{ shapeId: 'root' }] }],
    });
    const artifactPath = join(directory, 'GHA-ADM0.geojson');
    const original = await readFile(artifactPath);
    const corrupted = Buffer.from(original);
    corrupted[corrupted.length - 1] ^= 1;
    await writeFile(artifactPath, corrupted);
    await expect(normalizedManifest(directory, manifestPath)).rejects.toThrow(
      'checksum mismatch for GHA/ADM0',
    );
  });

  it('prints an acquisition dry run without contacting the provider', async () => {
    const providerSpy = jest.spyOn(GeoBoundariesProvider.prototype, 'acquire');
    await acquire([
      '--workdir',
      directory,
      '--select',
      'GHA/ADM0',
      '--dry-run',
    ]);
    expect(providerSpy).not.toHaveBeenCalled();
    expect(JSON.parse(String(logSpy.mock.calls[0][0]))).toEqual({
      outcome: 'dry-run',
      selections: [{ countryCode: 'GHA', level: 'ADM0' }],
      workdir: directory,
    });
  });

  it('acquires layers and atomically writes the resulting manifest', async () => {
    const bytes = Buffer.from(JSON.stringify(geoJson('ADM0', 'root')));
    jest.spyOn(GeoBoundariesProvider.prototype, 'acquire').mockResolvedValue({
      layer: layer('ADM0', bytes),
      artifactPath: join(directory, 'GHA-ADM0.geojson'),
    });
    await acquire(['--workdir', directory, '--select', 'GHA/ADM0']);
    const output = JSON.parse(String(logSpy.mock.calls[0][0])) as {
      outcome: string;
      manifest: string;
    };
    expect(output).toMatchObject({
      outcome: 'acquired',
      manifest: join(directory, 'manifest.json'),
    });
    expect(JSON.parse(await readFile(output.manifest, 'utf8'))).toMatchObject({
      schemaVersion: 1,
      layers: [{ level: 'ADM0' }],
    });
  });

  it('reviews hierarchy in dry-run and live modes', async () => {
    const { manifest, manifestPath } = await writeManifest([
      'ADM0',
      'ADM1',
      'ADM2',
    ]);
    const parentMapPath = join(directory, 'parent-map.json');
    await writeFile(
      parentMapPath,
      JSON.stringify({
        schemaVersion: 1,
        baseManifestIdentitySha256: manifest.identitySha256,
        layers: [
          {
            countryCode: 'GHA',
            level: 'ADM2',
            parentLevel: 'ADM1',
            assignments: [{ childShapeId: 'child', parentShapeId: 'parent' }],
          },
        ],
      }),
    );
    const outputPath = join(directory, 'published.json');
    const args = [
      '--workdir',
      directory,
      '--manifest',
      manifestPath,
      '--parent-map',
      parentMapPath,
      '--output',
      outputPath,
    ];
    await reviewHierarchy([...args, '--dry-run']);
    expect(JSON.parse(String(logSpy.mock.calls[0][0]))).toMatchObject({
      outcome: 'dry-run',
      assignmentCount: 1,
    });
    await expect(readFile(outputPath, 'utf8')).rejects.toBeDefined();

    logSpy.mockClear();
    await reviewHierarchy(args);
    expect(JSON.parse(String(logSpy.mock.calls[0][0]))).toMatchObject({
      outcome: 'reviewed',
      reviewedLayers: [{ country: 'GHA', level: 'ADM2', assignments: 1 }],
    });
    expect(JSON.parse(await readFile(outputPath, 'utf8'))).toMatchObject({
      layers: [
        { level: 'ADM0' },
        { level: 'ADM1' },
        {
          level: 'ADM2',
          hierarchyMode: 'explicit-parent-map',
          explicitParentMap: { child: 'parent' },
        },
      ],
    });
  });

  it('rejects a hierarchy output outside the workdir or matching an input', async () => {
    const { manifestPath } = await writeManifest();
    const parentMapPath = join(directory, 'parent-map.json');
    await writeFile(parentMapPath, '{}');
    await expect(
      reviewHierarchy([
        '--workdir',
        directory,
        '--manifest',
        manifestPath,
        '--parent-map',
        parentMapPath,
        '--output',
        manifestPath,
      ]),
    ).rejects.toThrow('distinct path inside --workdir');
  });

  it('rejects unsafe hierarchy output paths and parents', async () => {
    const baseArgs = [
      '--workdir',
      directory,
      '--manifest',
      join(directory, 'manifest.json'),
      '--parent-map',
      join(directory, 'parent-map.json'),
      '--output',
    ];
    await expect(
      reviewHierarchy([...baseArgs, join(directory, '..', 'outside.json')]),
    ).rejects.toThrow('distinct path inside --workdir');
    await expect(
      reviewHierarchy([...baseArgs, join(directory, 'missing', 'output.json')]),
    ).rejects.toThrow('parent must be an existing directory');

    const parentFile = join(directory, 'parent-file');
    await writeFile(parentFile, 'not a directory');
    await expect(
      reviewHierarchy([...baseArgs, join(parentFile, 'output.json')]),
    ).rejects.toThrow('parent must be a non-symlink directory');

    const outside = await mkdtemp(join(tmpdir(), 'acres-cli-output-'));
    try {
      const outsideParent = join(outside, 'parent');
      await mkdir(outsideParent);
      const linkedDirectory = join(directory, 'linked-output');
      await symlink(outside, linkedDirectory);
      await expect(
        reviewHierarchy([
          ...baseArgs,
          join(linkedDirectory, 'parent', 'output.json'),
        ]),
      ).rejects.toThrow('parent must resolve inside --workdir');
    } finally {
      await rm(outside, { recursive: true, force: true });
    }
  });

  it('imports a validated manifest through a closed Nest application context', async () => {
    const { manifestPath } = await writeManifest();
    const importLayers = jest.fn().mockResolvedValue({
      sourceVersion: 'gbOpen-test',
      regionCount: 1,
      unchanged: false,
    });
    const close = jest.fn().mockResolvedValue(undefined);
    const createSpy = jest
      .spyOn(NestFactory, 'createApplicationContext')
      .mockResolvedValue({
        get: jest.fn((token: unknown) => {
          expect(token).toBe(GeoBoundariesImportService);
          return { importLayers };
        }),
        close,
      } as never);
    await importManifest([
      '--workdir',
      directory,
      '--manifest',
      manifestPath,
      '--dry-run',
    ]);
    expect(createSpy).toHaveBeenCalledWith(expect.any(Function), {
      logger: false,
    });
    expect(importLayers).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ features: expect.any(Array) }),
      ]),
      expect.any(String),
      true,
    );
    expect(close).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(logSpy.mock.calls[0][0]))).toMatchObject({
      outcome: 'dry-run',
      sourceVersion: 'gbOpen-test',
      regions: 1,
    });
  });

  it('closes the Nest context when import fails', async () => {
    const { manifestPath } = await writeManifest();
    const close = jest.fn().mockResolvedValue(undefined);
    jest.spyOn(NestFactory, 'createApplicationContext').mockResolvedValue({
      get: jest.fn(() => ({
        importLayers: jest.fn().mockRejectedValue(new Error('database failed')),
      })),
      close,
    } as never);
    await expect(
      importManifest(['--workdir', directory, '--manifest', manifestPath]),
    ).rejects.toThrow('database failed');
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('shows usage for empty and help commands', async () => {
    process.argv = ['node', 'cli'];
    await main();
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Usage:'));
    logSpy.mockClear();
    process.argv = ['node', 'cli', '--help'];
    await main();
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('acquire|review|import'),
    );
  });

  it('dispatches acquire and reports the complete command list for invalid commands', async () => {
    process.argv = [
      'node',
      'cli',
      'acquire',
      '--workdir',
      directory,
      '--select',
      'GHA/ADM0',
      '--dry-run',
    ];
    await main();
    expect(JSON.parse(String(logSpy.mock.calls[0][0]))).toMatchObject({
      outcome: 'dry-run',
    });
    process.exitCode = undefined;
    process.argv = ['node', 'cli', 'unknown'];
    await expect(main()).rejects.toThrow(
      'command must be acquire, review, or import.',
    );
    expect(process.exitCode).toBe(2);
  });

  it('dispatches review and import commands', async () => {
    const { manifest, manifestPath } = await writeManifest([
      'ADM0',
      'ADM1',
      'ADM2',
    ]);
    const parentMapPath = join(directory, 'parent-map.json');
    await writeFile(
      parentMapPath,
      JSON.stringify({
        schemaVersion: 1,
        baseManifestIdentitySha256: manifest.identitySha256,
        layers: [
          {
            countryCode: 'GHA',
            level: 'ADM2',
            parentLevel: 'ADM1',
            assignments: [{ childShapeId: 'child', parentShapeId: 'parent' }],
          },
        ],
      }),
    );
    process.argv = [
      'node',
      'cli',
      'review',
      '--workdir',
      directory,
      '--manifest',
      manifestPath,
      '--parent-map',
      parentMapPath,
      '--output',
      join(directory, 'published.json'),
      '--dry-run',
    ];
    await main();
    expect(JSON.parse(String(logSpy.mock.calls[0][0]))).toMatchObject({
      outcome: 'dry-run',
      assignmentCount: 1,
    });

    logSpy.mockClear();
    const close = jest.fn().mockResolvedValue(undefined);
    jest.spyOn(NestFactory, 'createApplicationContext').mockResolvedValue({
      get: jest.fn(() => ({
        importLayers: jest.fn().mockResolvedValue({
          sourceVersion: 'gbOpen-live',
          regionCount: 3,
          unchanged: true,
        }),
      })),
      close,
    } as never);
    process.argv = [
      'node',
      'cli',
      'import',
      '--workdir',
      directory,
      '--manifest',
      manifestPath,
    ];
    await main();
    expect(JSON.parse(String(logSpy.mock.calls[0][0]))).toEqual({
      outcome: 'imported',
      sourceVersion: 'gbOpen-live',
      regions: 3,
      unchanged: true,
    });
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('reports an unhandled entrypoint failure and sets exit code 1', async () => {
    jest.resetModules();
    jest.doMock('./geoboundaries-provider', () => {
      const actual = jest.requireActual<
        typeof import('./geoboundaries-provider')
      >('./geoboundaries-provider');
      return {
        ...actual,
        GeoBoundariesProvider: class {
          acquire(): Promise<never> {
            return Promise.reject(new Error('provider unavailable'));
          }
        },
      };
    });
    process.argv = [
      'node',
      'geoboundaries-cli',
      'acquire',
      '--workdir',
      directory,
      '--select',
      'GHA/ADM0',
    ];

    jest.isolateModules(() => {
      jest.requireActual('./geoboundaries-cli');
    });
    await new Promise<void>((resolvePromise) => setImmediate(resolvePromise));

    expect(process.exitCode).toBe(1);
    expect(errorSpy).toHaveBeenCalledWith(
      'geography-cli: provider unavailable',
    );
    jest.dontMock('./geoboundaries-provider');
  });

  it('preserves an existing exit code and sanitizes a non-Error entrypoint failure', async () => {
    jest.resetModules();
    jest.doMock('./geoboundaries-provider', () => {
      const actual = jest.requireActual<
        typeof import('./geoboundaries-provider')
      >('./geoboundaries-provider');
      return {
        ...actual,
        GeoBoundariesProvider: class {
          acquire(): Promise<never> {
            return Promise.reject('provider unavailable');
          }
        },
      };
    });
    process.exitCode = 7;
    process.argv = [
      'node',
      'geoboundaries-cli',
      'acquire',
      '--workdir',
      directory,
      '--select',
      'GHA/ADM0',
    ];

    jest.isolateModules(() => {
      jest.requireActual('./geoboundaries-cli');
    });
    await new Promise<void>((resolvePromise) => setImmediate(resolvePromise));

    expect(process.exitCode).toBe(7);
    expect(errorSpy).toHaveBeenCalledWith('geography-cli: failed');
    jest.dontMock('./geoboundaries-provider');
  });
});
