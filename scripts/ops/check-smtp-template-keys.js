const REQUIRED_KEYS = ['SMTP_USER', 'SMTP_PASS'];
const LEGACY_KEYS = ['SMTP_USERNAME', 'SMTP_PASSWORD'];
const WATCHED_KEY =
  /^(?:\s*export\s+)?\s*(SMTP_(?:USERNAME|PASSWORD|USER|PASS))(?=$|[^A-Za-z0-9_])/;

function checkSmtpTemplateKeys(envText) {
  if (typeof envText !== 'string') {
    return ['production.env.example must be text'];
  }

  const counts = new Map();
  const seenLegacy = new Set();
  const ambiguous = new Set();
  // A BOM is accepted only at the beginning of the file; CRLF is a line ending.
  for (const line of envText.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    if (/^\s*(?:#|$)/.test(line)) continue;
    const match = line.match(WATCHED_KEY);
    if (!match) continue;
    const key = match[1];
    if (LEGACY_KEYS.includes(key)) seenLegacy.add(key);
    if (line.startsWith(`${key}=`) && !/^\s/.test(line[key.length + 1] || '')) {
      counts.set(key, (counts.get(key) || 0) + 1);
    } else {
      ambiguous.add(key);
    }
  }

  const errors = [];
  for (const key of REQUIRED_KEYS) {
    if (counts.get(key) !== 1)
      errors.push(`production.env.example must define ${key} exactly once`);
  }
  for (const key of LEGACY_KEYS) {
    if (seenLegacy.has(key))
      errors.push(`production.env.example must not define ${key}`);
  }
  for (const key of [...REQUIRED_KEYS, ...LEGACY_KEYS]) {
    if (ambiguous.has(key))
      errors.push(`production.env.example has an ambiguous ${key} assignment`);
  }
  return errors;
}

module.exports = { checkSmtpTemplateKeys };
