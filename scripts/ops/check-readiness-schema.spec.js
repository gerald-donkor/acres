const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Ajv = require('ajv');
const {
  REQUIRED_SECTIONS,
  REQUIRED_SECRET_KEYS,
  MANAGED_SECRET_KEYS,
  REQUIRED_RETENTION_KEYS,
} = require('./check-launch-readiness');

const launchDir = path.resolve(__dirname, '../../infra/launch');
const example = JSON.parse(fs.readFileSync(path.join(launchDir, 'readiness.example.json'), 'utf8'));
const vercelExample = JSON.parse(fs.readFileSync(path.join(launchDir, 'readiness.vercel.example.json'), 'utf8'));
const schema = JSON.parse(fs.readFileSync(path.join(launchDir, 'readiness.schema.json'), 'utf8'));
const validate = new Ajv({ allErrors: true, schemaId: 'auto' }).compile(schema);
const clone = () => structuredClone(example);
const cloneVercel = () => structuredClone(vercelExample);

test('schema pointer resolves and unresolved templates are structurally valid', () => {
  assert.equal(example.$schema, './readiness.schema.json');
  assert.equal(fs.existsSync(path.resolve(launchDir, example.$schema)), true);
  assert.equal(validate(example), true, JSON.stringify(validate.errors));

  assert.equal(vercelExample.$schema, './readiness.schema.json');
  assert.equal(fs.existsSync(path.resolve(launchDir, vercelExample.$schema)), true);
  assert.equal(validate(vercelExample), true, JSON.stringify(validate.errors));
});

test('schema covers the validator category and policy key lists for compose and managed profiles', () => {
  const sections = schema.properties.sections;
  assert.deepEqual(sections.required, REQUIRED_SECTIONS);

  const composeSections = schema.definitions.composeSections;
  assert.deepEqual(Object.keys(composeSections.properties), REQUIRED_SECTIONS);
  assert.deepEqual(composeSections.required, REQUIRED_SECTIONS);
  for (const [name, keys] of [
    ['secret_references', REQUIRED_SECRET_KEYS],
    ['data_retention_policy', REQUIRED_RETENTION_KEYS],
  ]) {
    const section = composeSections.properties[name];
    assert.deepEqual(Object.keys(section.properties).filter((key) => keys.includes(key)), keys);
    assert.equal(keys.every((key) => section.required.includes(key)), true);
  }

  const managedSections = schema.definitions.managedSections;
  assert.deepEqual(Object.keys(managedSections.properties), REQUIRED_SECTIONS);
  assert.deepEqual(managedSections.required, REQUIRED_SECTIONS);
  for (const [name, keys] of [
    ['secret_references', MANAGED_SECRET_KEYS],
    ['data_retention_policy', REQUIRED_RETENTION_KEYS],
  ]) {
    const section = managedSections.properties[name];
    assert.deepEqual(Object.keys(section.properties).filter((key) => keys.includes(key)), keys);
    assert.equal(keys.every((key) => section.required.includes(key)), true);
  }
});

test('missing section is rejected for both profiles', () => {
  const record = clone();
  delete record.sections.smtp_delivery;
  assert.equal(validate(record), false);

  const vRecord = cloneVercel();
  delete vRecord.sections.smtp_delivery;
  assert.equal(validate(vRecord), false);
});

test('wrong section type is rejected for both profiles', () => {
  const record = clone();
  record.sections.smtp_delivery = [];
  assert.equal(validate(record), false);

  const vRecord = cloneVercel();
  vRecord.sections.smtp_delivery = [];
  assert.equal(validate(vRecord), false);
});

test('misspelled secret key is rejected in compose profile', () => {
  const record = clone();
  record.sections.secret_references.session_secrect_source =
    record.sections.secret_references.session_secret_source;
  delete record.sections.secret_references.session_secret_source;
  assert.equal(validate(record), false);
});

test('misspelled secret key is rejected in managed profile', () => {
  const vRecord = cloneVercel();
  vRecord.sections.secret_references.session_secrect_source =
    vRecord.sections.secret_references.session_secret_source;
  delete vRecord.sections.secret_references.session_secret_source;
  assert.equal(validate(vRecord), false);
});

test('malformed release and wrong field types are rejected in compose profile', () => {
  const record = clone();
  delete record.sections.deployment_and_rollback.release.previous.server_image;
  assert.equal(validate(record), false);
  const wrongType = clone();
  wrongType.sections.backup_and_disaster_recovery.rpo_hours = 'one';
  assert.equal(validate(wrongType), false);
});

test('malformed release and wrong field types are rejected in managed profile', () => {
  const vRecord = cloneVercel();
  delete vRecord.sections.deployment_and_rollback.release.previous.deployment_id;
  assert.equal(validate(vRecord), false);
  const wrongType = cloneVercel();
  wrongType.sections.backup_and_disaster_recovery.pitr_recovery_window_days = 'seven';
  assert.equal(validate(wrongType), false);
});

test('fractional policy values accepted by the launch validator remain structural', () => {
  const record = clone();
  record.sections.secrets_management.rotation_cadence_days = 0.5;
  record.sections.slo_and_alerting.availability_target_percent = 99.95;
  record.sections.slo_and_alerting.max_p95_latency_ms = 499.5;
  record.sections.slo_and_alerting.capacity_target_rps = 100.5;
  record.sections.slo_and_alerting.max_database_acquisition_p95_latency_ms = 49.5;
  record.sections.slo_and_alerting.max_database_query_p95_latency_ms = 99.5;
  record.sections.backup_and_disaster_recovery.rpo_hours = 0.5;
  record.sections.backup_and_disaster_recovery.rto_hours = 3.5;
  assert.equal(validate(record), true, JSON.stringify(validate.errors));

  const vRecord = cloneVercel();
  vRecord.sections.secrets_management.rotation_cadence_days = 0.5;
  vRecord.sections.slo_and_alerting.availability_target_percent = 99.95;
  vRecord.sections.slo_and_alerting.max_p95_latency_ms = 499.5;
  vRecord.sections.slo_and_alerting.capacity_target_rps = 100.5;
  vRecord.sections.slo_and_alerting.max_database_acquisition_p95_latency_ms = 49.5;
  vRecord.sections.slo_and_alerting.max_database_query_p95_latency_ms = 99.5;
  vRecord.sections.backup_and_disaster_recovery.rpo_hours = 0.5;
  vRecord.sections.backup_and_disaster_recovery.rto_hours = 3.5;
  assert.equal(validate(vRecord), true, JSON.stringify(validate.errors));
});

test('unknown fields require a schema revision', () => {
  const record = clone();
  record.sections.smtp_delivery.future_field = 'value';
  assert.equal(validate(record), false);

  const vRecord = cloneVercel();
  vRecord.sections.smtp_delivery.future_field = 'value';
  assert.equal(validate(vRecord), false);
});

test('unknown target architecture is rejected by schema', () => {
  const record = clone();
  record.target_architecture = 'unsupported-hybrid-cloud';
  assert.equal(validate(record), false);
});
