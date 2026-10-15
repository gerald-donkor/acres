// Runs inside the scanner Sandbox as `node -e <script> <main sha256>
// <daily sha256> <max daily age hours> [database dir]`. Exit 0 plus the
// `signatures-ok` marker means both CVDs match their pinned hashes and
// daily.cvd is fresh. Kept identical to the probe's copy in
// scripts/vercel/probe-platform.js (a unit test compares the two).
export const SIGNATURE_CHECK = `
const fs = require('node:fs');
const crypto = require('node:crypto');
const cp = require('node:child_process');
const dir = process.argv[4] || '/var/lib/clamav';
const maxAgeMs = Number(process.argv[3]) * 3600000;
if (!(maxAgeMs > 0)) process.exit(4);
for (const [name, hash] of [['main.cvd', process.argv[1]], ['daily.cvd', process.argv[2]]]) {
  const file = dir + '/' + name;
  if (crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex') !== hash) process.exit(2);
  const info = cp.execFileSync('sigtool', ['--info', file], { encoding: 'utf8', timeout: 10000 });
  const line = info.match(/^Build time:\\s*(.+)$/m);
  const time = line ? Date.parse(line[1]) : NaN;
  const age = Date.now() - time;
  if (!Number.isFinite(time) || age < 0 || (name === 'daily.cvd' && age > maxAgeMs)) process.exit(3);
}
process.stdout.write('signatures-ok\\n');
`;

export const SIGNATURES_OK_MARKER = 'signatures-ok';
