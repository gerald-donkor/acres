import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// The probe (CommonJS, outside the server build) keeps its own copy of the
// in-VM check; compare the source text so the two cannot drift.
const between = (file: string) => {
  const text = readFileSync(file, 'utf8');
  const start = text.indexOf('const SIGNATURE_CHECK = `');
  const end = text.indexOf('`;', start);
  if (start < 0 || end < 0) throw new Error(`No SIGNATURE_CHECK in ${file}`);
  return text.slice(start, end + 2);
};

describe('sandbox signature check', () => {
  it('matches the platform probe copy exactly', () => {
    expect(between(join(__dirname, 'sandbox-signature-check.ts'))).toBe(
      between(join(__dirname, '../../../scripts/vercel/probe-platform.js')),
    );
  });
});
