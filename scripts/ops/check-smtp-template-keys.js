function checkSmtpTemplateKeys(envText) {
  const counts = new Map();
  for (const line of envText.split('\n')) {
    const match = line.match(/^([A-Z0-9_]+)=/);
    if (match) counts.set(match[1], (counts.get(match[1]) || 0) + 1);
  }

  const errors = [];
  for (const key of ['SMTP_USER', 'SMTP_PASS']) {
    if (counts.get(key) !== 1) errors.push(`production.env.example must define ${key} exactly once`);
  }
  for (const key of ['SMTP_USERNAME', 'SMTP_PASSWORD']) {
    if (counts.has(key)) errors.push(`production.env.example must not define ${key}`);
  }
  return errors;
}

module.exports = { checkSmtpTemplateKeys };
