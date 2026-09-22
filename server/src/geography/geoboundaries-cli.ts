import { createHash } from 'node:crypto';
import {
  lstat,
  mkdir,
  readFile,
  realpath,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { GeoBoundariesImportService } from './geoboundaries-import.service';
import {
  publishReviewedManifest,
  validateGeoBoundariesHierarchyReview,
  validateGeoBoundariesManifest,
} from './geoboundaries-manifest';
import { normalizeGeoBoundariesLayer } from './geoboundaries-normalizer';
import {
  GeoBoundariesProvider,
  createAcquiredManifest,
} from './geoboundaries-provider';
import type {
  GeoBoundariesLevel,
  GeoBoundariesSelection,
} from './geoboundaries.types';

export function fail(message: string): never {
  console.error(`geography-cli: ${message}`);
  process.exitCode = 2;
  throw new Error(message);
}
export function arg(args: string[], name: string): string {
  const index = args.indexOf(name);
  if (index < 0 || !args[index + 1]) return fail(`missing ${name}`);
  return args[index + 1];
}
export function selections(value: string): GeoBoundariesSelection[] {
  const output = value.split(',').map((item) => {
    const [countryCode, level] = item.split('/');
    if (
      !countryCode ||
      !level ||
      !/^[A-Z]{3}$/.test(countryCode) ||
      !/^ADM[0-5]$/.test(level)
    )
      return fail('selection must be comma-separated ISO3/ADM0..ADM5 entries.');
    return { countryCode, level: level as GeoBoundariesLevel };
  });
  if (
    output.length === 0 ||
    new Set(output.map((item) => `${item.countryCode}/${item.level}`)).size !==
      output.length
  )
    return fail('selection must be non-empty and unique.');
  return output;
}
export function workDirectory(value: string): string {
  const path = resolve(value);
  if (path === resolve(process.cwd()) || path === resolve('/'))
    return fail(
      '--workdir must be a dedicated operator directory, not the repository or root.',
    );
  return path;
}
export async function atomicJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temp = `${path}.${process.pid}.tmp`;
  try {
    await writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, {
      mode: 0o600,
    });
    await rename(temp, path);
  } catch (error) {
    await rm(temp, { force: true });
    throw error;
  }
}

export async function regularInside(
  directory: string,
  path: string,
  name: string,
): Promise<void> {
  const lexical = relative(directory, path);
  if (outsideOrSame(lexical)) fail(`${name} must be a file inside --workdir.`);
  const stat = await lstat(path).catch(() =>
    fail(`${name} is not a regular file.`),
  );
  if (!stat.isFile() || stat.isSymbolicLink())
    fail(`${name} must be a non-symlink regular file.`);
  const canonical = relative(await realpath(directory), await realpath(path));
  if (outsideOrSame(canonical))
    fail(`${name} must resolve to a file inside --workdir.`);
}

function outsideOrSame(value: string): boolean {
  return (
    value === '' ||
    value === '..' ||
    value.startsWith(`..${sep}`) ||
    isAbsolute(value)
  );
}

async function writableInside(
  directory: string,
  path: string,
  name: string,
): Promise<void> {
  const lexical = relative(directory, path);
  if (outsideOrSame(lexical))
    fail(`${name} must be a distinct path inside --workdir.`);
  const parent = dirname(path);
  const parentStat = await lstat(parent).catch(() =>
    fail(`${name} parent must be an existing directory inside --workdir.`),
  );
  if (!parentStat.isDirectory() || parentStat.isSymbolicLink())
    fail(`${name} parent must be a non-symlink directory inside --workdir.`);
  const canonicalParent = relative(
    await realpath(directory),
    await realpath(parent),
  );
  if (
    canonicalParent === '..' ||
    canonicalParent.startsWith(`..${sep}`) ||
    isAbsolute(canonicalParent)
  )
    fail(`${name} parent must resolve inside --workdir.`);
}

export async function normalizedManifest(
  directory: string,
  manifestPath: string,
) {
  await regularInside(directory, manifestPath, '--manifest');
  const manifest = validateGeoBoundariesManifest(
    JSON.parse(await readFile(manifestPath, 'utf8')) as unknown,
  );
  const normalized = [];
  for (const layer of manifest.layers) {
    const path = resolve(
      directory,
      `${layer.countryCode}-${layer.level}.geojson`,
    );
    await regularInside(directory, path, 'artifact');
    const bytes = await readFile(path);
    if (
      bytes.byteLength !== layer.byteLength ||
      createHash('sha256').update(bytes).digest('hex') !== layer.sha256
    )
      fail(`checksum mismatch for ${layer.countryCode}/${layer.level}`);
    normalized.push(
      normalizeGeoBoundariesLayer(
        layer,
        JSON.parse(bytes.toString('utf8')) as unknown,
      ),
    );
  }
  return { manifest, normalized };
}

export async function acquire(args: string[]): Promise<void> {
  const directory = workDirectory(arg(args, '--workdir'));
  const selected = selections(arg(args, '--select'));
  const dryRun = args.includes('--dry-run');
  if (dryRun) {
    console.log(
      JSON.stringify({
        outcome: 'dry-run',
        selections: selected,
        workdir: directory,
      }),
    );
    return;
  }
  const provider = new GeoBoundariesProvider();
  const acquired = [];
  for (const selection of selected)
    acquired.push(await provider.acquire(selection, directory));
  const manifest = createAcquiredManifest(acquired.map((item) => item.layer));
  const manifestPath = resolve(directory, 'manifest.json');
  await atomicJson(manifestPath, manifest);
  console.log(
    JSON.stringify({
      outcome: 'acquired',
      layers: acquired.map(({ layer }) => ({
        country: layer.countryCode,
        level: layer.level,
        boundaryId: layer.boundaryId,
        bytes: layer.byteLength,
        checksum: layer.sha256.slice(0, 12),
      })),
      manifest: manifestPath,
    }),
  );
}

export async function importManifest(args: string[]): Promise<void> {
  const manifestPath = resolve(arg(args, '--manifest'));
  const directory = workDirectory(arg(args, '--workdir'));
  const dryRun = args.includes('--dry-run');
  const { manifest, normalized } = await normalizedManifest(
    directory,
    manifestPath,
  );
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: false,
  });
  try {
    const result = await app
      .get(GeoBoundariesImportService)
      .importLayers(normalized, manifest.identitySha256, dryRun);
    console.log(
      JSON.stringify({
        outcome: dryRun ? 'dry-run' : 'imported',
        sourceVersion: result.sourceVersion,
        regions: result.regionCount,
        unchanged: result.unchanged,
      }),
    );
  } finally {
    await app.close();
  }
}

export async function reviewHierarchy(args: string[]): Promise<void> {
  const directory = workDirectory(arg(args, '--workdir'));
  const manifestPath = resolve(arg(args, '--manifest'));
  const parentMapPath = resolve(arg(args, '--parent-map'));
  const outputPath = resolve(arg(args, '--output'));
  if (outputPath === manifestPath || outputPath === parentMapPath)
    fail('--output must be a distinct path inside --workdir.');
  await writableInside(directory, outputPath, '--output');
  await regularInside(directory, parentMapPath, '--parent-map');
  const { manifest, normalized } = await normalizedManifest(
    directory,
    manifestPath,
  );
  const review = validateGeoBoundariesHierarchyReview(
    JSON.parse(await readFile(parentMapPath, 'utf8')) as unknown,
  );
  const featureIds = new Map(
    normalized.map((item) => [
      `${item.layer.countryCode}/${item.layer.level}`,
      new Set(item.features.map((feature) => feature.shapeId)),
    ]),
  );
  const published = publishReviewedManifest(manifest, review, featureIds);
  const counts = review.layers.map((item) => ({
    country: item.countryCode,
    level: item.level,
    assignments: item.assignments.length,
  }));
  if (args.includes('--dry-run')) {
    console.log(
      JSON.stringify({
        outcome: 'dry-run',
        baseIdentity: manifest.identitySha256.slice(0, 12),
        publishIdentity: published.identitySha256.slice(0, 12),
        reviewedLayers: counts,
        assignmentCount: counts.reduce(
          (sum, item) => sum + item.assignments,
          0,
        ),
      }),
    );
    return;
  }
  await atomicJson(outputPath, published);
  console.log(
    JSON.stringify({
      outcome: 'reviewed',
      publishIdentity: published.identitySha256.slice(0, 12),
      reviewedLayers: counts,
    }),
  );
}

export async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);
  if (args.includes('--help') || command === '--help' || !command) {
    console.log(
      'Usage: geography-provider <acquire|review|import> --workdir /safe/operator/dir [--select GHA/ADM0] [--manifest /safe/operator/dir/manifest.json] [--parent-map /safe/operator/dir/parent-map.json --output /safe/operator/dir/publish-manifest.json] [--dry-run]',
    );
    return;
  }
  if (command === 'acquire') return acquire(args);
  if (command === 'review') return reviewHierarchy(args);
  if (command === 'import') return importManifest(args);
  fail('command must be acquire, review, or import.');
}

if (process.argv[1] && process.argv[1].includes('geoboundaries-cli')) {
  void main().catch((error: unknown) => {
    if (process.exitCode === undefined) process.exitCode = 1;
    console.error(
      `geography-cli: ${error instanceof Error ? error.message : 'failed'}`,
    );
  });
}
