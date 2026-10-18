'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync, execFileSync } = require('node:child_process');
const { compareDeployManifest } = require('./check-deploy-manifest');

const SCRIPT = path.resolve(__dirname, 'check-deploy-manifest.js');
const TRACKED = [
  'client/package.json',
  'client/public/assets/ui/images/Hero Image.png',
  'server/src/main.ts',
  'packages/shared/package.json',
  'package.json',
  'package-lock.json',
  'vercel.json',
  '.node-version',
  'docs/product.md',
  'AGENTS.md',
];
const IN_SCOPE = TRACKED.filter((file) => !['docs/product.md', 'AGENTS.md'].includes(file));

test('exact match passes with equal counts', () => {
  const result = compareDeployManifest({ uploaded: IN_SCOPE, tracked: TRACKED });
  assert.deepEqual(result, { errors: [], expectedCount: 8, uploadedCount: 8 });
});

test('untracked root .env is flagged as a secret', () => {
  const { errors } = compareDeployManifest({ uploaded: [...IN_SCOPE, '.env'], tracked: TRACKED });
  assert.deepEqual(errors, ['SECRET: untracked or ignored file in upload: .env']);
});

test('untracked server/.env is flagged as a secret', () => {
  const { errors } = compareDeployManifest({ uploaded: [...IN_SCOPE, 'server/.env'], tracked: TRACKED });
  assert.deepEqual(errors, ['SECRET: untracked or ignored file in upload: server/.env']);
});

test('untracked backups file is flagged', () => {
  const { errors } = compareDeployManifest({ uploaded: [...IN_SCOPE, 'backups/x.json'], tracked: TRACKED });
  assert.deepEqual(errors, ['untracked or ignored file in upload: backups/x.json']);
});

test('tracked files outside scope are flagged', () => {
  const { errors } = compareDeployManifest({
    uploaded: [...IN_SCOPE, 'docs/product.md', 'AGENTS.md'],
    tracked: TRACKED,
  });
  assert.deepEqual(errors, [
    'out-of-scope file in upload: docs/product.md',
    'out-of-scope file in upload: AGENTS.md',
  ]);
});

test('missing tracked in-scope file is flagged', () => {
  const uploaded = IN_SCOPE.filter((file) => file !== 'client/package.json');
  const result = compareDeployManifest({ uploaded, tracked: TRACKED });
  assert.deepEqual(result.errors, ['build input missing from upload: client/package.json']);
  assert.equal(result.expectedCount, 8);
  assert.equal(result.uploadedCount, 7);
});

test('a path with spaces is one path', () => {
  const uploaded = IN_SCOPE.filter((file) => !file.includes(' '));
  const { errors } = compareDeployManifest({ uploaded, tracked: TRACKED });
  assert.deepEqual(errors, [
    'build input missing from upload: client/public/assets/ui/images/Hero Image.png',
  ]);
});

test('exact-path scope does not admit a prefix match', () => {
  const { errors } = compareDeployManifest({
    uploaded: [...IN_SCOPE, 'package.json.bak'],
    tracked: [...TRACKED, 'package.json.bak'],
  });
  assert.deepEqual(errors, ['out-of-scope file in upload: package.json.bak']);
});

test('duplicate and non-string entries are errors, not crashes', () => {
  const { errors } = compareDeployManifest({
    uploaded: [...IN_SCOPE, 'vercel.json', null, 7],
    tracked: TRACKED,
  });
  assert.deepEqual(errors, [
    'duplicate path in upload: vercel.json',
    'invalid path in upload: null',
    'invalid path in upload: 7',
  ]);
});

test('tracked .env.example placeholders are not labelled as secrets', () => {
  const { errors } = compareDeployManifest({ uploaded: [...IN_SCOPE, '.env.example'], tracked: [...TRACKED, '.env.example'] });
  assert.deepEqual(errors, ['out-of-scope file in upload: .env.example']);
});

test('CLI exits 0, 1 and 2 against a temporary repository', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'acres-manifest-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', args, { cwd: dir, stdio: 'ignore' });
  git('init', '-q');
  fs.mkdirSync(path.join(dir, 'client'));
  fs.writeFileSync(path.join(dir, 'client/a.txt'), 'a');
  fs.writeFileSync(path.join(dir, 'package.json'), '{}');
  git('add', '.');
  git('-c', 'user.name=test', '-c', 'user.email=test@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '-qm', 'init');

  const manifestPath = path.join(dir, 'dry.json');
  const run = (...args) => spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' });
  const writeManifest = (paths) =>
    fs.writeFileSync(manifestPath, JSON.stringify({ files: paths.map((p) => ({ path: p })) }));

  writeManifest(['client/a.txt', 'package.json']);
  let result = run('--manifest', manifestPath, '--cwd', dir);
  assert.equal(result.status, 0);
  assert.equal(result.stdout.trim(), 'deploy manifest ok: 2 files');

  writeManifest(['client/a.txt', 'package.json', '.env']);
  result = run('--manifest', manifestPath, '--cwd', dir);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /^SECRET: untracked or ignored file in upload: \.env$/m);

  writeManifest(['client/a.txt', 'package.json']);
  fs.writeFileSync(path.join(dir, 'client/a.txt'), 'changed');
  result = run('--manifest', manifestPath, '--cwd', path.join(dir, 'client'));
  assert.equal(result.status, 1);
  assert.equal(result.stdout.trim(), 'uncommitted change in deploy scope: client/a.txt');
  git('checkout', '--', 'client/a.txt');

  result = run('--cwd', dir);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /--manifest/);

  fs.writeFileSync(manifestPath, JSON.stringify({ fileCount: 0 }));
  result = run('--manifest', manifestPath, '--cwd', dir);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /no files array/);

  result = run('--manifest', manifestPath, '--cwd', os.tmpdir());
  assert.equal(result.status, 2);
});
