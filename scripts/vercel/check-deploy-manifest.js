'use strict';

/**
 * Compares a `vercel deploy --dry` upload manifest against the git-tracked
 * files inside the deploy allowlist (.vercelignore). The upload must equal
 * exactly the tracked in-scope set: nothing untracked or ignored, nothing
 * outside scope, and no tracked build input missing. The CLI also requires a
 * clean scope (no staged or unstaged change), so the upload is the committed
 * HEAD content and the recorded source SHA is accurate.
 *
 * Usage:
 *   vercel deploy --dry --target=preview < /dev/null > dry.json
 *   node scripts/vercel/check-deploy-manifest.js --manifest dry.json [--cwd <repo>]
 *
 * Exit codes: 0 ok, 1 manifest or scope violation, 2 usage or git error.
 * Never runs the Vercel CLI and never prints file contents.
 */

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const DEFAULT_SCOPE = Object.freeze([
  'client/',
  'server/',
  'packages/',
  'package.json',
  'package-lock.json',
  'vercel.json',
  '.node-version',
]);

// .env.example placeholders are tracked and hold no secrets.
const ENV_FILE = /(^|\/)\.env(\.(?!example$)|$)/;
const MAX_PRINTED_ERRORS = 50;

/**
 * @param {string} file Repo-relative POSIX path
 * @param {readonly string[]} scope Directory prefixes (trailing "/") or exact paths
 * @returns {boolean}
 */
function inScope(file, scope) {
  return scope.some((entry) => (entry.endsWith('/') ? file.startsWith(entry) : file === entry));
}

/**
 * @param {string} message
 * @param {string} file
 * @returns {string}
 */
function formatError(message, file) {
  return `${ENV_FILE.test(file) ? 'SECRET: ' : ''}${message}: ${file}`;
}

/**
 * @param {{ uploaded: unknown[], tracked: unknown[], scope?: readonly string[] }} input
 * @returns {{ errors: string[], expectedCount: number, uploadedCount: number }}
 */
function compareDeployManifest({ uploaded, tracked, scope = DEFAULT_SCOPE }) {
  const errors = [];
  const uploadedSet = new Set();

  for (const file of uploaded) {
    if (typeof file !== 'string' || file === '') {
      errors.push(`invalid path in upload: ${JSON.stringify(file)}`);
      continue;
    }
    if (uploadedSet.has(file)) {
      errors.push(formatError('duplicate path in upload', file));
      continue;
    }
    uploadedSet.add(file);
  }

  const trackedSet = new Set(tracked.filter((file) => typeof file === 'string' && file !== ''));
  const expected = [...trackedSet].filter((file) => inScope(file, scope));

  for (const file of uploadedSet) {
    if (!trackedSet.has(file)) {
      errors.push(formatError('untracked or ignored file in upload', file));
    } else if (!inScope(file, scope)) {
      errors.push(formatError('out-of-scope file in upload', file));
    }
  }

  for (const file of expected) {
    if (!uploadedSet.has(file)) {
      errors.push(formatError('build input missing from upload', file));
    }
  }

  return { errors, expectedCount: expected.length, uploadedCount: uploadedSet.size };
}

/**
 * @param {string[]} argv
 * @returns {{ manifest?: string, cwd: string }}
 */
function parseArgs(argv) {
  const args = { cwd: path.resolve(__dirname, '../..') };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    const value = argv[i + 1];
    if ((flag === '--manifest' || flag === '--cwd') && value !== undefined && !value.startsWith('--')) {
      args[flag.slice(2)] = value;
      i += 1;
    } else {
      throw new Error(`unknown or incomplete argument: ${flag}`);
    }
  }
  if (!args.manifest) throw new Error('--manifest <dry.json> is required');
  return args;
}

function main(argv) {
  let args;
  let manifest;
  try {
    args = parseArgs(argv);
    manifest = JSON.parse(fs.readFileSync(args.manifest, 'utf8'));
    if (!manifest || !Array.isArray(manifest.files)) {
      throw new Error('manifest JSON has no files array');
    }
  } catch (error) {
    console.error(`usage error: ${error.message}`);
    return 2;
  }

  let tracked;
  let dirty;
  try {
    const git = (...gitArgs) => execFileSync('git', gitArgs, { cwd: args.cwd, encoding: 'utf8' });
    const root = git('rev-parse', '--show-toplevel').trim();
    tracked = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' })
      .split('\0')
      .filter(Boolean);
    dirty = execFileSync('git', ['status', '--porcelain', '-z', '--', ...DEFAULT_SCOPE], {
      cwd: root,
      encoding: 'utf8',
    })
      .split('\0')
      .filter(Boolean);
  } catch {
    console.error(`usage error: git failed in ${args.cwd}`);
    return 2;
  }

  const uploaded = manifest.files.map((entry) => (entry && typeof entry === 'object' ? entry.path : entry));
  const { errors, uploadedCount } = compareDeployManifest({ uploaded, tracked });
  // Porcelain -z entries are "XY path"; a rename or copy is followed by its source.
  for (let i = 0; i < dirty.length; i += 1) {
    errors.push(formatError('uncommitted change in deploy scope', dirty[i].slice(3)));
    if (/^[RC]|^.[RC]/.test(dirty[i])) i += 1;
  }

  if (errors.length === 0) {
    console.log(`deploy manifest ok: ${uploadedCount} files`);
    return 0;
  }
  for (const error of errors.slice(0, MAX_PRINTED_ERRORS)) console.log(error);
  if (errors.length > MAX_PRINTED_ERRORS) {
    console.log(`… and ${errors.length - MAX_PRINTED_ERRORS} more`);
  }
  return 1;
}

if (require.main === module) {
  process.exitCode = main(process.argv.slice(2));
}

module.exports = { compareDeployManifest, DEFAULT_SCOPE };
