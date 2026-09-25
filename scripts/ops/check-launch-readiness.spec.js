const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const {
  validateReadiness,
  parseBackupScheduleCron,
  checkPlaceholdersAndSecrets,
  REQUIRED_SECTIONS,
  REQUIRED_SECRET_KEYS,
} = require('./check-launch-readiness');
const { runChecks } = require('./run-static-integrity-checks');

const fixedNow = new Date('2026-09-25T12:00:00Z');
const restoreFixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'readiness-restore-fixture-'));
const restoreFixturePath = path.join(restoreFixtureDir, 'restore-drill-evidence-valid.json');
const validRestoreReport = {
  drill_timestamp: '20260828T120000Z',
  status: 'success',
  rto_compliant: true,
  record_parity_verified: true,
  postgis_verified: true,
  foreign_keys_verified: true,
  tables_source: 46,
  tables_restored: 46,
  migrations_source: 17,
  migrations_restored: 17,
  backup_bytes: 1024,
  duration_ms: 2500,
};
fs.writeFileSync(restoreFixturePath, JSON.stringify(validRestoreReport));
test.after(() => fs.rmSync(restoreFixtureDir, { recursive: true, force: true }));

function buildValidApprovedRecord() {
  return {
    version: '1.0.0',
    environment: 'production',
    target_architecture: 'single-host-compose-caddy',
    created_at: '2026-08-28T00:00:00Z',
    notes: 'Approved test readiness fixture with full no-AI assertions.',
    sections: {
      production_domain_tls: {
        status: 'approved',
        domain: 'acres.example.com',
        tls_contact_email: 'ops@example.com',
        hsts_approved: true,
        custom_certificates: false,
        approver: 'ops-lead',
        evidence: ['DNS A record points to host', 'Caddyfile HSTS verified'],
        notes: 'Verified production domain',
      },
      smtp_delivery: {
        status: 'approved',
        provider: 'resend',
        host: 'smtp.resend.com',
        port: 587,
        tls_mode: 'STARTTLS',
        from_address: 'notifications@acres.example.com',
        credentials_source_reference: 'vault:acres/production/smtp#password',
        delivery_policy: 'Transactional notifications only',
        bounce_abuse_handling: 'docs/ops/smtp-bounce.md',
        approver: 'ops-lead',
        evidence: ['DKIM and SPF records verified', 'Test delivery succeeded'],
        notes: 'Verified SMTP delivery',
      },
      secrets_management: {
        status: 'approved',
        injection_mechanism: 'vault-agent',
        masking_policy: 'All credentials masked in logs and telemetry',
        rotation_cadence_days: 90,
        compromise_response_plan: 'docs/runbooks/compromise-response.md',
        approver: 'security-lead',
        evidence: ['Vault agent runtime injection drill completed'],
        notes: 'Verified secrets management',
      },
      secret_references: {
        status: 'approved',
        session_secret_source: 'vault:acres/production/session#secret',
        csrf_secret_source: 'vault:acres/production/csrf#secret',
        db_migrator_secret_source: 'vault:acres/production/postgres#migrator_password',
        db_app_secret_source: 'vault:acres/production/postgres#app_password',
        db_monitor_secret_source: 'vault:acres/production/postgres#monitor_password',
        valkey_secret_source: 'vault:acres/production/valkey#password',
        garage_rpc_secret_source: 'vault:acres/production/garage#rpc_secret',
        garage_admin_secret_source: 'vault:acres/production/garage#admin_token',
        garage_metrics_secret_source: 'vault:acres/production/garage#metrics_token',
        garage_s3_secret_source: 'vault:acres/production/garage#s3_secret',
        smtp_secret_source: 'vault:acres/production/smtp#password',
        grafana_admin_secret_source: 'vault:acres/production/grafana#admin_password',
        approver: 'security-lead',
        evidence: ['All secret references verified against Vault policy'],
        notes: 'Verified indirect secret references',
      },
      slo_and_alerting: {
        status: 'approved',
        availability_target_percent: 99.9,
        max_p95_latency_ms: 500,
        capacity_target_rps: 100,
        max_database_acquisition_p95_latency_ms: 50,
        max_database_query_p95_latency_ms: 100,
        alert_recipients: ['pagerduty:acres-production-alerts'],
        alert_thresholds_defined: true,
        escalation_runbook_ref: 'docs/runbooks/escalation.md',
        approver: 'sre-lead',
        evidence: ['Prometheus alerts tested with alertmanager route'],
        notes: 'Verified SLO and alerting',
      },
      backup_and_disaster_recovery: {
        status: 'approved',
        rpo_hours: 1,
        rto_hours: 4,
        backup_destination: 's3://acres-dr-backups-us-west-2/backups',
        backup_schedule_cron: '0 * * * *',
        restore_drill_completed: true,
        restore_drill_date: '2026-08-28T12:00:00Z',
        db_object_reconciliation_tested: true,
        approver: 'sre-lead',
        evidence: [restoreFixturePath],
        notes: 'Verified disaster recovery',
      },
      data_retention_policy: {
        status: 'approved',
        account_retention_policy: '365d',
        audit_retention_policy: '730d',
        upload_quarantine_retention_policy: '7d',
        rejected_object_retention_policy: '1d',
        export_retention_policy: '30d',
        report_retention_policy: 'indefinite_until_tenant_deletion',
        telemetry_retention_policy: '15d',
        backup_retention_policy: '30d',
        approver: 'legal-lead',
        evidence: ['Retention policy review approved'],
        notes: 'Verified data retention policies',
      },
      volume_encryption: {
        status: 'approved',
        encryption_mechanism: 'luks2-dm-crypt',
        encrypted_mount_paths: ['/mnt/encrypted/postgres', '/mnt/encrypted/valkey', '/mnt/encrypted/garage'],
        key_separation_confirmed: true,
        key_recovery_owner: 'infra-security-team',
        approver: 'security-lead',
        evidence: ['LUKS2 block device encryption verified with separate key storage'],
        notes: 'Verified volume encryption',
      },
      graphql_introspection: {
        status: 'approved',
        production_introspection_enabled: false,
        justification: 'Disabled for production attack surface reduction',
        approver: 'security-lead',
        evidence: ['GraphQL schema introspection verified disabled on production route'],
        notes: 'Verified GraphQL introspection policy',
      },
      deployment_and_rollback: {
        status: 'approved',
        target_host_profile: 'dedicated-c2-standard-8',
        image_registry_path: 'registry.example.com/acres/app',
        deployment_approver: 'release-manager',
        rollback_authority: 'on-call-sre',
        image_provenance_policy: 'cosign-signed-commits-only',
        release: {
          reviewed_source_commit: 'a'.repeat(40),
          current: {
            client_image: `registry.example.com/acres/app/client@sha256:${'a'.repeat(64)}`,
            server_image: `registry.example.com/acres/app/server@sha256:${'b'.repeat(64)}`,
          },
          previous: {
            client_image: `old.example.com/acres/client@sha256:${'c'.repeat(64)}`,
            server_image: `old.example.com/acres/server@sha256:${'d'.repeat(64)}`,
          },
          client_provenance_evidence: 'artifact:client-attestation-1',
          server_provenance_evidence: 'artifact:server-attestation-1',
          live_drill_evidence: 'artifact:live-drill-1',
        },
        live_readiness_drill_completed: true,
        approver: 'release-manager',
        evidence: ['Staging deployment and rollback drill executed successfully'],
        notes: 'Verified deployment and rollback posture',
      },
      optional_ai_posture: {
        status: 'approved',
        ai_enabled: false,
        no_ai_path_verified: true,
        server_ai_draft_enabled_false: true,
        no_gemini_api_key_provisioned: true,
        unpaid_provider_excluded: true,
        phase11_status: 'implemented_unpaid_preview_excluded_from_launch',
        approver: 'product-and-security-lead',
        evidence: [
          'Deterministic report authoring, exports, and analytics verified with AI_DRAFT_ENABLED=false',
          'Absence of GEMINI_API_KEY verified in production environment inventory and container images',
          'Unpaid Gemini Developer API preview confirmed excluded from production launch profile',
        ],
        notes: 'Phase 11A preview exists in codebase but is excluded from production launch.',
      },
    },
  };
}

function expectedImageEnv(record) {
  const { client_image, server_image } = record.sections.deployment_and_rollback.release.current;
  return { ACRES_CLIENT_IMAGE: client_image, ACRES_SERVER_IMAGE: server_image };
}

function validateApprovedRecord(record, filePath = 'test.json') {
  return validateReadiness(record, filePath, { env: expectedImageEnv(record), now: fixedNow });
}

test('validateReadiness passes for a fully approved record with no-AI assertions', () => {
  const record = buildValidApprovedRecord();
  const result = validateApprovedRecord(record);

  assert.strictEqual(Object.keys(result.categoryBlockers).length, 0);
  assert.strictEqual(result.totalApproved, REQUIRED_SECTIONS.length);
  assert.strictEqual(result.totalSections, REQUIRED_SECTIONS.length);
});

test('approved recovery requires a child report beyond prose, dossier, or a matching filename', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'readiness-restore-negative-'));
  try {
    const fake = path.join(dir, 'restore-drill-evidence-fake.json');
    const dossier = path.join(dir, 'launch-evidence-dossier.json');
    fs.writeFileSync(fake, JSON.stringify({ status: 'success' }));
    fs.writeFileSync(dossier, JSON.stringify({ overall_status: 'PASSED' }));
    for (const evidence of [[], ['Restore completed'], [dossier], [fake]]) {
      const record = buildValidApprovedRecord();
      record.sections.backup_and_disaster_recovery.evidence = evidence;
      const blockers = validateApprovedRecord(record).categoryBlockers.backup_and_disaster_recovery || [];
      assert.ok(blockers.some((blocker) => /restore drill child JSON report|required|report is invalid/.test(blocker)), JSON.stringify(blockers));
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('restore child report validates every required success field and numerical invariant', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'readiness-restore-fields-'));
  try {
    const file = path.join(dir, 'custom-report.json');
    const mutations = [
      ['status', undefined], ['status', 'failed'], ['rto_compliant', false], ['rto_compliant', 'true'],
      ['record_parity_verified', null], ['postgis_verified', false], ['foreign_keys_verified', undefined],
      ['tables_source', -1], ['tables_restored', 45], ['migrations_source', 1.5],
      ['migrations_restored', '17'], ['backup_bytes', 0], ['backup_bytes', Infinity],
      ['duration_ms', -1], ['duration_ms', '2500'],
      ['drill_timestamp', '20260230T120000Z'], ['drill_timestamp', '20260926T120000Z'],
      ['drill_timestamp', '20260828T250000Z'], ['drill_timestamp', '2026-08-28T12:00:00Z'],
    ];
    for (const [field, value] of mutations) {
      const report = { ...validRestoreReport, [field]: value };
      fs.writeFileSync(file, JSON.stringify(report));
      const record = buildValidApprovedRecord();
      record.sections.backup_and_disaster_recovery.evidence = [file];
      const blockers = validateApprovedRecord(record).categoryBlockers.backup_and_disaster_recovery || [];
      assert.ok(blockers.some((blocker) => blocker.includes('report is invalid or failed')), `${field}: ${JSON.stringify(blockers)}`);
    }
    fs.writeFileSync(file, JSON.stringify(validRestoreReport));
    const record = buildValidApprovedRecord();
    record.sections.backup_and_disaster_recovery.evidence = [file];
    assert.strictEqual(validateApprovedRecord(record).categoryBlockers.backup_and_disaster_recovery, undefined);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('restore date is strict UTC and tracks the latest valid referenced report', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'readiness-restore-dates-'));
  try {
    const older = path.join(dir, 'older.json');
    const latest = path.join(dir, 'latest.json');
    fs.writeFileSync(older, JSON.stringify(validRestoreReport));
    fs.writeFileSync(latest, JSON.stringify({ ...validRestoreReport, drill_timestamp: '20260829T000000Z' }));
    const record = buildValidApprovedRecord();
    record.sections.backup_and_disaster_recovery.evidence = [latest, older];
    record.sections.backup_and_disaster_recovery.restore_drill_date = '2026-08-29';
    assert.strictEqual(validateApprovedRecord(record).categoryBlockers.backup_and_disaster_recovery, undefined);
    for (const date of ['2026-08-28', '2026-02-30', '2026-08-29T00:00:00+01:00',
      'last Friday', '2026-09-26', '2026-08-29T25:00:00Z']) {
      record.sections.backup_and_disaster_recovery.restore_drill_date = date;
      assert.ok(validateApprovedRecord(record).categoryBlockers.backup_and_disaster_recovery?.length, date);
    }
    record.sections.backup_and_disaster_recovery.restore_drill_date = '2026-08-29';
    fs.writeFileSync(older, JSON.stringify({ ...validRestoreReport, status: 'failed' }));
    assert.ok(validateApprovedRecord(record).categoryBlockers.backup_and_disaster_recovery?.some(
      (blocker) => blocker.includes('report is invalid or failed')));
    fs.writeFileSync(older, JSON.stringify({ backup_bytes: 1024, duration_ms: 2500, postgis_verified: true }));
    assert.ok(validateApprovedRecord(record).categoryBlockers.backup_and_disaster_recovery?.some(
      (blocker) => blocker.includes('report is invalid or failed')));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('non-object evidence blocker does not echo its path', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'readiness-evidence-path-'));
  try {
    const file = path.join(dir, 'credential-bearing-reference.json');
    fs.writeFileSync(file, 'null');
    const record = buildValidApprovedRecord();
    record.sections.backup_and_disaster_recovery.evidence = [restoreFixturePath, file];
    const blockers = validateApprovedRecord(record).categoryBlockers.backup_and_disaster_recovery || [];
    assert.ok(blockers.some((blocker) => blocker.includes('must contain a JSON object')));
    assert.ok(!JSON.stringify(blockers).includes('credential-bearing-reference'));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('release approval fails closed on missing and placeholder fields', () => {
  const fields = [
    ['reviewed_source_commit'], ['current', 'client_image'], ['current', 'server_image'],
    ['previous', 'client_image'], ['previous', 'server_image'],
    ['client_provenance_evidence'], ['server_provenance_evidence'], ['live_drill_evidence'],
  ];
  for (const fieldPath of fields) {
    for (const value of [undefined, '__REQUIRED_VALUE__']) {
      const record = buildValidApprovedRecord();
      let target = record.sections.deployment_and_rollback.release;
      for (const part of fieldPath.slice(0, -1)) target = target[part];
      target[fieldPath.at(-1)] = value;
      const result = validateApprovedRecord(record);
      assert.ok(result.categoryBlockers.deployment_and_rollback?.length, `${fieldPath.join('.')} ${value}`);
    }
  }
});

test('release approval rejects malformed and inconsistent image pairs', () => {
  const mutations = [
    (r) => { r.reviewed_source_commit = 'g'.repeat(40); },
    (r) => { r.current.client_image = 'registry.example.com/acres/app/client:latest'; },
    (r) => { r.current.client_image = r.current.server_image; },
    (r) => { r.previous.client_image = r.previous.server_image; },
    (r) => { r.previous = { ...r.current }; },
    (r) => { r.current.client_image = `registry.example.com/acres/application/client@sha256:${'a'.repeat(64)}`; },
    (r) => { r.current.client_image = `wrong.example.com/acres/app/client@sha256:${'a'.repeat(64)}`; },
  ];
  for (const mutate of mutations) {
    const record = buildValidApprovedRecord();
    mutate(record.sections.deployment_and_rollback.release);
    assert.ok(validateApprovedRecord(record).categoryBlockers.deployment_and_rollback?.length);
  }
});

test('release evidence requires distinct stable identifiers or successful local JSON', () => {
  const os = require('node:os');
  const dir = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'release-evidence-'));
  try {
    const file = path.join(dir, 'passed.json');
    fs.writeFileSync(file, JSON.stringify({ status: 'success' }));
    const record = buildValidApprovedRecord();
    const release = record.sections.deployment_and_rollback.release;
    release.live_drill_evidence = file;
    assert.strictEqual(validateApprovedRecord(record).categoryBlockers.deployment_and_rollback, undefined);
    release.live_drill_evidence = 'https://artifacts.example/release/drill.json';
    assert.strictEqual(validateApprovedRecord(record).categoryBlockers.deployment_and_rollback, undefined);
    for (const value of ['a free-text sentence', 'artifact:*', 'missing.json', '']) {
      release.live_drill_evidence = value;
      assert.ok(validateApprovedRecord(record).categoryBlockers.deployment_and_rollback?.length, value);
    }
    release.live_drill_evidence = release.client_provenance_evidence;
    assert.ok(validateApprovedRecord(record).categoryBlockers.deployment_and_rollback?.length);
    fs.writeFileSync(file, JSON.stringify({ status: 'FAILED' }));
    release.live_drill_evidence = file;
    assert.ok(validateApprovedRecord(record).categoryBlockers.deployment_and_rollback?.length);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('approved deployment requires the exact current pair and redacts supplied images', () => {
  const record = buildValidApprovedRecord();
  const release = record.sections.deployment_and_rollback.release;
  const good = expectedImageEnv(record);
  assert.strictEqual(validateReadiness(record, 'test.json', { env: good }).categoryBlockers.deployment_and_rollback, undefined);
  const sensitive = 'sensitive-operator-value';
  const cases = [
    [{}, ['ACRES_CLIENT_IMAGE', 'ACRES_SERVER_IMAGE']],
    [{ ACRES_CLIENT_IMAGE: good.ACRES_CLIENT_IMAGE }, ['ACRES_SERVER_IMAGE']],
    [{ ACRES_SERVER_IMAGE: good.ACRES_SERVER_IMAGE }, ['ACRES_CLIENT_IMAGE']],
    [{ ...good, ACRES_CLIENT_IMAGE: good.ACRES_SERVER_IMAGE, ACRES_SERVER_IMAGE: good.ACRES_CLIENT_IMAGE }, ['ACRES_CLIENT_IMAGE', 'ACRES_SERVER_IMAGE']],
    [{ ...good, ACRES_CLIENT_IMAGE: sensitive }, ['ACRES_CLIENT_IMAGE']],
    [{ ...good, ACRES_SERVER_IMAGE: sensitive }, ['ACRES_SERVER_IMAGE']],
    [{ ACRES_CLIENT_IMAGE: sensitive, ACRES_SERVER_IMAGE: sensitive }, ['ACRES_CLIENT_IMAGE', 'ACRES_SERVER_IMAGE']],
  ];
  for (const [env, expectedNames] of cases) {
    const blockers = validateReadiness(record, 'test.json', { env }).categoryBlockers.deployment_and_rollback;
    assert.ok(blockers?.length);
    for (const name of expectedNames) assert.ok(blockers.some((message) => message.includes(name)));
    assert.ok(!JSON.stringify(blockers).includes(sensitive));
  }
  assert.ok(validateReadiness(record, 'test.json').categoryBlockers.deployment_and_rollback?.length);
  release.current.client_image = '__REQUIRED_sentinel-with-sensitive-operator-value__';
  const blockers = validateReadiness(record, 'test.json', { env: good }).categoryBlockers.deployment_and_rollback;
  assert.ok(!JSON.stringify(blockers).includes('sensitive-operator-value'));
});

test('ordinary CLI and aggregate wrapper require the pair without echoing it', () => {
  if (process.env.ACRES_READINESS_WRAPPER_TEST_NESTED === '1') return;
  const os = require('node:os');
  const dir = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'release-readiness-'));
  try {
    const record = buildValidApprovedRecord();
    const file = path.join(dir, 'approved.json');
    fs.writeFileSync(file, JSON.stringify(record));
    const images = record.sections.deployment_and_rollback.release.current;
    const env = { ...process.env, ACRES_CLIENT_IMAGE: images.client_image, ACRES_SERVER_IMAGE: images.server_image };
    const command = path.join(__dirname, 'check-launch-readiness.js');
    const obsolete = spawnSync(process.execPath, [command, '--bind-images', file], { env, encoding: 'utf8' });
    assert.strictEqual(obsolete.status, 1);
    assert.match(obsolete.stdout + obsolete.stderr, /Usage:/, String(obsolete.error));
    const wrapper = path.join(__dirname, 'launch-readiness.sh');
    const commands = [[process.execPath, [command, file]], ['sh', [wrapper, file]]];
    for (const [executable, args] of commands) {
      const commandEnv = executable === 'sh' ? { ...env, ACRES_READINESS_WRAPPER_TEST_NESTED: '1' } : env;
      const passed = spawnSync(executable, args, { env: commandEnv, encoding: 'utf8' });
      assert.strictEqual(passed.status, 0, passed.stdout + passed.stderr);
      for (const pair of [{}, { ACRES_CLIENT_IMAGE: images.client_image }, { ACRES_SERVER_IMAGE: 'operator-secret-image-value' }]) {
        const checkEnv = { ...commandEnv, ...pair };
        if (!Object.hasOwn(pair, 'ACRES_CLIENT_IMAGE')) delete checkEnv.ACRES_CLIENT_IMAGE;
        if (!Object.hasOwn(pair, 'ACRES_SERVER_IMAGE')) delete checkEnv.ACRES_SERVER_IMAGE;
        const failed = spawnSync(executable, args, { env: checkEnv, encoding: 'utf8' });
        assert.strictEqual(failed.status, 1, failed.stdout + failed.stderr);
        assert.ok(!(failed.stdout + failed.stderr).includes('operator-secret-image-value'));
      }
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('validateReadiness rejects ai_enabled: true with the launch-exclusion fatal blocker', () => {
  const record = buildValidApprovedRecord();
  record.sections.optional_ai_posture.ai_enabled = true;

  const result = validateApprovedRecord(record);
  const aiBlockers = result.categoryBlockers.optional_ai_posture || [];

  assert.ok(
    aiBlockers.some((msg) =>
      msg.includes('FATAL: Optional AI is marked enabled (ai_enabled: true), but the Phase 11A unpaid Gemini Developer API preview is excluded from production launch')
    ),
    `Expected launch exclusion fatal blocker, got: ${JSON.stringify(aiBlockers)}`
  );
});

test('validateReadiness fails closed when no_ai_path_verified is false on approved record', () => {
  const record = buildValidApprovedRecord();
  record.sections.optional_ai_posture.no_ai_path_verified = false;

  const result = validateApprovedRecord(record);
  const aiBlockers = result.categoryBlockers.optional_ai_posture || [];

  assert.ok(
    aiBlockers.some((msg) => msg.includes('Deterministic no-AI product journeys must be verified')),
    `Expected no-AI path verification blocker, got: ${JSON.stringify(aiBlockers)}`
  );
});

test('validateReadiness fails closed when server_ai_draft_enabled_false is not asserted', () => {
  const record = buildValidApprovedRecord();
  record.sections.optional_ai_posture.server_ai_draft_enabled_false = false;

  const result = validateApprovedRecord(record);
  const aiBlockers = result.categoryBlockers.optional_ai_posture || [];

  assert.ok(
    aiBlockers.some((msg) => msg.includes('Server configuration must explicitly assert AI_DRAFT_ENABLED=false')),
    `Expected AI_DRAFT_ENABLED=false assertion blocker, got: ${JSON.stringify(aiBlockers)}`
  );
});

test('validateReadiness fails closed when no_gemini_api_key_provisioned is not asserted', () => {
  const record = buildValidApprovedRecord();
  record.sections.optional_ai_posture.no_gemini_api_key_provisioned = false;

  const result = validateApprovedRecord(record);
  const aiBlockers = result.categoryBlockers.optional_ai_posture || [];

  assert.ok(
    aiBlockers.some((msg) => msg.includes('Absence of GEMINI_API_KEY in production API/worker runtime secrets must be confirmed')),
    `Expected absence of GEMINI_API_KEY blocker, got: ${JSON.stringify(aiBlockers)}`
  );
});

test('validateReadiness fails closed when unpaid_provider_excluded is not asserted', () => {
  const record = buildValidApprovedRecord();
  record.sections.optional_ai_posture.unpaid_provider_excluded = false;

  const result = validateApprovedRecord(record);
  const aiBlockers = result.categoryBlockers.optional_ai_posture || [];

  assert.ok(
    aiBlockers.some((msg) => msg.includes('Exclusion of unpaid Gemini Developer API provider from production launch must be confirmed')),
    `Expected unpaid provider exclusion blocker, got: ${JSON.stringify(aiBlockers)}`
  );
});

test('validateReadiness fails closed when phase11_status is missing or empty', () => {
  const record = buildValidApprovedRecord();
  record.sections.optional_ai_posture.phase11_status = '';

  const result = validateApprovedRecord(record);
  const aiBlockers = result.categoryBlockers.optional_ai_posture || [];

  assert.ok(
    aiBlockers.some((msg) => msg.includes("Field 'phase11_status' is required")),
    `Expected phase11_status blocker, got: ${JSON.stringify(aiBlockers)}`
  );
});

test('validateReadiness fails closed when ai_enabled is non-boolean or null', () => {
  const record = buildValidApprovedRecord();
  record.sections.optional_ai_posture.ai_enabled = null;

  const result = validateApprovedRecord(record);
  const aiBlockers = result.categoryBlockers.optional_ai_posture || [];

  assert.ok(
    aiBlockers.some((msg) => msg.includes("Field 'ai_enabled' is required and must be a boolean")),
    `Expected boolean type blocker for ai_enabled, got: ${JSON.stringify(aiBlockers)}`
  );
});

test('validateReadiness rejects key literal and client-exposed secret without echoing the secret value', () => {
  const fakeKey = 'AIzaSy' + 'A1B2C3D4E5F6G7H8I9J0K1L2M3N4O5P6Q7R8';
  const record = buildValidApprovedRecord();
  record.sections.optional_ai_posture.notes = `Using test key ${fakeKey}`;
  record.sections.production_domain_tls.notes = 'NEXT_PUBLIC_CLIENT_SECRET_KEY';

  const blockers = [];
  checkPlaceholdersAndSecrets(record, '', blockers);

  assert.ok(
    blockers.some((b) => b.includes('appears to contain a literal secret value')),
    `Expected literal secret blocker, got: ${JSON.stringify(blockers)}`
  );
  assert.ok(
    blockers.some((b) => b.includes('contains client-exposed secret pattern')),
    `Expected client-exposed secret blocker, got: ${JSON.stringify(blockers)}`
  );

  // CRITICAL: Ensure raw secret string is NOT present in any blocker message
  for (const b of blockers) {
    assert.strictEqual(
      b.includes(fakeKey),
      false,
      `Blocker message leaked raw secret key: "${b}"`
    );
  }
});

test('validateReadiness rejects Gemini key reference in secret_references as a contradiction', () => {
  const record = buildValidApprovedRecord();
  record.sections.secret_references.gemini_api_key_source = 'vault:acres/prod#gemini';

  const result = validateApprovedRecord(record);
  const aiBlockers = result.categoryBlockers.optional_ai_posture || [];

  assert.ok(
    aiBlockers.some((msg) => msg.includes('declares an AI/Gemini secret source when AI is excluded from launch')),
    `Expected secret_references contradiction blocker, got: ${JSON.stringify(aiBlockers)}`
  );
});

test('validateReadiness rejects Gemini key in optional_ai_posture as a contradiction', () => {
  const record = buildValidApprovedRecord();
  record.sections.optional_ai_posture.gemini_api_key = 'vault:acres/prod#gemini';

  const result = validateApprovedRecord(record);
  const aiBlockers = result.categoryBlockers.optional_ai_posture || [];

  assert.ok(
    aiBlockers.some((msg) => msg.includes('optional_ai_posture must not contain a Gemini API key or key reference')),
    `Expected optional_ai_posture contradiction blocker, got: ${JSON.stringify(aiBlockers)}`
  );
});

test('validateReadiness passes evidence cross-validation when a referenced dossier exists and passed', () => {
  const os = require('node:os');
  const tmpDir = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'readiness-evidence-'));
  try {
    const dossierPath = path.join(tmpDir, 'launch-evidence-dossier-test.json');
    fs.writeFileSync(
      dossierPath,
      JSON.stringify({ version: '1.0.0', overall_status: 'PASSED', total_stages: 7, stages: [] }),
      'utf8'
    );
    const record = buildValidApprovedRecord();
    record.sections.backup_and_disaster_recovery.evidence = [restoreFixturePath, dossierPath];

    const result = validateApprovedRecord(record);
    assert.strictEqual(Object.keys(result.categoryBlockers).length, 0);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('validateReadiness blocks approval when referenced evidence file is missing', () => {
  const record = buildValidApprovedRecord();
  record.sections.backup_and_disaster_recovery.evidence = ['backups/restore-drill-evidence-does-not-exist.json'];

  const result = validateApprovedRecord(record);
  const blockers = result.categoryBlockers.backup_and_disaster_recovery || [];
  assert.ok(
    blockers.some((b) => b.includes('no matching file exists on disk')),
    `Expected missing-file blocker, got: ${JSON.stringify(blockers)}`
  );
});

test('validateReadiness blocks approval when referenced evidence reports failure', () => {
  const os = require('node:os');
  const tmpDir = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'readiness-evidence-'));
  try {
    const dossierPath = path.join(tmpDir, 'launch-evidence-dossier-failed.json');
    fs.writeFileSync(
      dossierPath,
      JSON.stringify({ version: '1.0.0', overall_status: 'FAILED', total_stages: 7 }),
      'utf8'
    );
    const record = buildValidApprovedRecord();
    record.sections.backup_and_disaster_recovery.evidence = [dossierPath];

    const result = validateApprovedRecord(record);
    const blockers = result.categoryBlockers.backup_and_disaster_recovery || [];
    assert.ok(
      blockers.some((b) => b.includes('reports drill failure')),
      `Expected failure-report blocker, got: ${JSON.stringify(blockers)}`
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('validateReadiness blocks approval when referenced evidence is not valid JSON', () => {
  const os = require('node:os');
  const tmpDir = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'readiness-evidence-'));
  try {
    const badPath = path.join(tmpDir, 'corrupt-evidence.json');
    fs.writeFileSync(badPath, '{ not valid json', 'utf8');
    const record = buildValidApprovedRecord();
    record.sections.slo_and_alerting.evidence = [badPath];

    const result = validateApprovedRecord(record);
    const blockers = result.categoryBlockers.slo_and_alerting || [];
    assert.ok(
      blockers.some((b) => b.includes('is not valid JSON')),
      `Expected invalid-JSON blocker, got: ${JSON.stringify(blockers)}`
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('validateReadiness skips cross-validation for non-approved sections', () => {
  const record = buildValidApprovedRecord();
  record.sections.backup_and_disaster_recovery.status = 'unresolved';
  record.sections.backup_and_disaster_recovery.evidence = ['backups/restore-drill-evidence-does-not-exist.json'];

  const result = validateApprovedRecord(record);
  const blockers = result.categoryBlockers.backup_and_disaster_recovery || [];
  assert.ok(
    blockers.every((b) => !b.includes('no matching file exists on disk')),
    `Non-approved sections must not get evidence-file blockers, got: ${JSON.stringify(blockers)}`
  );
});
test('validateReadiness resolves repo-relative evidence from a record kept in a subdir', () => {
  const os = require('node:os');
  const tmpRoot = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'readiness-basedir-'));
  try {
    // Evidence lives next to the readiness file, referenced relatively.
    const subDir = path.join(tmpRoot, 'infra', 'launch');
    fs.mkdirSync(subDir, { recursive: true });
    const evidencePath = path.join(subDir, 'my-evidence.json');
    fs.writeFileSync(evidencePath, JSON.stringify({ status: 'success' }), 'utf8');
    const record = buildValidApprovedRecord();
    record.sections.backup_and_disaster_recovery.evidence = ['my-evidence.json'];

    const result = validateApprovedRecord(record, path.join(subDir, 'operator.json'));
    const blockers = result.categoryBlockers.backup_and_disaster_recovery || [];
    assert.ok(
      blockers.every((b) => !b.includes('no matching file exists on disk')),
      `Subdir-relative evidence must resolve, got: ${JSON.stringify(blockers)}`
    );
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test('validateReadiness blocks approval when evidence reports a non-zero exitCode', () => {
  const os = require('node:os');
  const tmpDir = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'readiness-evidence-'));
  try {
    const reportPath = path.join(tmpDir, 'reconciliation-report.json');
    fs.writeFileSync(reportPath, JSON.stringify({ summary: { exitCode: 1 } }), 'utf8');
    const record = buildValidApprovedRecord();
    record.sections.backup_and_disaster_recovery.evidence = [reportPath];

    const result = validateApprovedRecord(record);
    const blockers = result.categoryBlockers.backup_and_disaster_recovery || [];
    assert.ok(
      blockers.some((b) => b.includes('summary.exitCode: 1')),
      `Expected exitCode blocker, got: ${JSON.stringify(blockers)}`
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('validateReadiness fails closed when max_database_acquisition_p95_latency_ms is missing, non-number, or exceeds 50ms', () => {
  const missingRecord = buildValidApprovedRecord();
  delete missingRecord.sections.slo_and_alerting.max_database_acquisition_p95_latency_ms;
  const missingResult = validateApprovedRecord(missingRecord);
  const missingBlockers = missingResult.categoryBlockers.slo_and_alerting || [];
  assert.ok(
    missingBlockers.some((b) => b.includes('Max database pool acquisition p95 latency ceiling must be a positive number <= 50ms')),
    `Expected missing acquisition latency blocker, got: ${JSON.stringify(missingBlockers)}`
  );

  const invalidRecord = buildValidApprovedRecord();
  invalidRecord.sections.slo_and_alerting.max_database_acquisition_p95_latency_ms = '50';
  const invalidResult = validateApprovedRecord(invalidRecord);
  const invalidBlockers = invalidResult.categoryBlockers.slo_and_alerting || [];
  assert.ok(
    invalidBlockers.some((b) => b.includes('Max database pool acquisition p95 latency ceiling must be a positive number <= 50ms')),
    `Expected non-number acquisition latency blocker, got: ${JSON.stringify(invalidBlockers)}`
  );

  const exceededRecord = buildValidApprovedRecord();
  exceededRecord.sections.slo_and_alerting.max_database_acquisition_p95_latency_ms = 75;
  const exceededResult = validateApprovedRecord(exceededRecord);
  const exceededBlockers = exceededResult.categoryBlockers.slo_and_alerting || [];
  assert.ok(
    exceededBlockers.some((b) => b.includes('Max database pool acquisition p95 latency ceiling must be a positive number <= 50ms (received: 75)')),
    `Expected ceiling exceeded acquisition latency blocker, got: ${JSON.stringify(exceededBlockers)}`
  );
});

test('validateReadiness fails closed when max_database_query_p95_latency_ms is missing, non-number, or exceeds 100ms', () => {
  const missingRecord = buildValidApprovedRecord();
  delete missingRecord.sections.slo_and_alerting.max_database_query_p95_latency_ms;
  const missingResult = validateApprovedRecord(missingRecord);
  const missingBlockers = missingResult.categoryBlockers.slo_and_alerting || [];
  assert.ok(
    missingBlockers.some((b) => b.includes('Max database query execution p95 latency ceiling must be a positive number <= 100ms')),
    `Expected missing query latency blocker, got: ${JSON.stringify(missingBlockers)}`
  );

  const invalidRecord = buildValidApprovedRecord();
  invalidRecord.sections.slo_and_alerting.max_database_query_p95_latency_ms = -10;
  const invalidResult = validateApprovedRecord(invalidRecord);
  const invalidBlockers = invalidResult.categoryBlockers.slo_and_alerting || [];
  assert.ok(
    invalidBlockers.some((b) => b.includes('Max database query execution p95 latency ceiling must be a positive number <= 100ms')),
    `Expected negative query latency blocker, got: ${JSON.stringify(invalidBlockers)}`
  );

  const exceededRecord = buildValidApprovedRecord();
  exceededRecord.sections.slo_and_alerting.max_database_query_p95_latency_ms = 150;
  const exceededResult = validateApprovedRecord(exceededRecord);
  const exceededBlockers = exceededResult.categoryBlockers.slo_and_alerting || [];
  assert.ok(
    exceededBlockers.some((b) => b.includes('Max database query execution p95 latency ceiling must be a positive number <= 100ms (received: 150)')),
    `Expected ceiling exceeded query latency blocker, got: ${JSON.stringify(exceededBlockers)}`
  );
});

test('validateReadiness blocks approval when evidence reports database baseline failure or breach', () => {
  const os = require('node:os');
  const tmpDir = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'readiness-evidence-db-'));
  try {
    const failedSummaryPath = path.join(tmpDir, 'failed-summary-evidence.json');
    fs.writeFileSync(
      failedSummaryPath,
      JSON.stringify({ status: 'success', summary: { databaseBaselineCompliance: 'failed' } }),
      'utf8'
    );
    const rec1 = buildValidApprovedRecord();
    rec1.sections.slo_and_alerting.evidence = [failedSummaryPath];
    const res1 = validateApprovedRecord(rec1);
    const blockers1 = res1.categoryBlockers.slo_and_alerting || [];
    assert.ok(
      blockers1.some((b) => b.includes('reports database baseline failure (summary.databaseBaselineCompliance: "failed")')),
      `Expected baseline compliance failure blocker, got: ${JSON.stringify(blockers1)}`
    );

    const breachedBaselinePath = path.join(tmpDir, 'breached-baseline-evidence.json');
    fs.writeFileSync(
      breachedBaselinePath,
      JSON.stringify({ status: 'success', databaseTelemetryBaseline: { status: 'breached' } }),
      'utf8'
    );
    const rec2 = buildValidApprovedRecord();
    rec2.sections.slo_and_alerting.evidence = [breachedBaselinePath];
    const res2 = validateApprovedRecord(rec2);
    const blockers2 = res2.categoryBlockers.slo_and_alerting || [];
    assert.ok(
      blockers2.some((b) => b.includes('reports database baseline breach (databaseTelemetryBaseline.status: "breached")')),
      `Expected baseline breach blocker, got: ${JSON.stringify(blockers2)}`
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('validateReadiness blocks approval when evidence dossier reports failed stages or stage-level failures', () => {
  const os = require('node:os');
  const tmpDir = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'readiness-evidence-dossier-'));
  try {
    const failedStagesDossierPath = path.join(tmpDir, 'dossier-failed-stages.json');
    fs.writeFileSync(
      failedStagesDossierPath,
      JSON.stringify({
        overall_status: 'PASSED',
        failed_stages: 1,
        stages: [{ stage_id: 'ingress_deployment', status: 'FAILED', error_message: 'Caddy routing error' }],
      }),
      'utf8'
    );
    const rec = buildValidApprovedRecord();
    rec.sections.deployment_and_rollback.evidence = [failedStagesDossierPath];
    const res = validateApprovedRecord(rec);
    const blockers = res.categoryBlockers.deployment_and_rollback || [];
    assert.ok(
      blockers.some((b) => b.includes('reports 1 failed drill stage(s)')),
      `Expected failed stages blocker, got: ${JSON.stringify(blockers)}`
    );
    assert.ok(
      blockers.some((b) => b.includes("reports stage 'ingress_deployment' failed: Caddy routing error")),
      `Expected stage failure blocker, got: ${JSON.stringify(blockers)}`
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('validateReadiness blocks approval when evidence dossier reports sloCompliance or recoveryCompliance failure', () => {
  const os = require('node:os');
  const tmpDir = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'readiness-evidence-dossier-summary-'));
  try {
    const failedSloDossierPath = path.join(tmpDir, 'dossier-failed-slo.json');
    fs.writeFileSync(
      failedSloDossierPath,
      JSON.stringify({
        overall_status: 'PASSED',
        failed_stages: 0,
        summary: {
          sloCompliance: 'capacity_alerts_failed',
          recoveryCompliance: 'restore_reconcile_failed',
          staticIntegrity: 'failed',
        },
      }),
      'utf8'
    );
    const rec = buildValidApprovedRecord();
    rec.sections.slo_and_alerting.evidence = [failedSloDossierPath];
    const res = validateApprovedRecord(rec);
    const blockers = res.categoryBlockers.slo_and_alerting || [];
    assert.ok(
      blockers.some((b) => b.includes('reports SLO compliance failure (summary.sloCompliance: "capacity_alerts_failed")')),
      `Expected sloCompliance blocker, got: ${JSON.stringify(blockers)}`
    );
    assert.ok(
      blockers.some((b) => b.includes('reports recovery compliance failure (summary.recoveryCompliance: "restore_reconcile_failed")')),
      `Expected recoveryCompliance blocker, got: ${JSON.stringify(blockers)}`
    );
    assert.ok(
      blockers.some((b) => b.includes('reports stage summary failure (summary.staticIntegrity: "failed")')),
      `Expected staticIntegrity blocker, got: ${JSON.stringify(blockers)}`
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('validateReadiness accepts valid passed evidence dossier with database baseline compliance', () => {
  const os = require('node:os');
  const tmpDir = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'readiness-evidence-dossier-pass-'));
  try {
    const passedDossierPath = path.join(tmpDir, 'launch-evidence-dossier-pass.json');
    fs.writeFileSync(
      passedDossierPath,
      JSON.stringify({
        version: '1.0.0',
        environment: 'drill',
        overall_status: 'PASSED',
        total_stages: 7,
        passed_stages: 7,
        failed_stages: 0,
        stages: [
          { stage_id: 'static_templates', status: 'PASSED' },
          { stage_id: 'supply_chain_sast', status: 'PASSED' },
          { stage_id: 'ingress_deployment', status: 'PASSED' },
          { stage_id: 'volume_encryption', status: 'PASSED' },
          { stage_id: 'secret_rotation', status: 'PASSED' },
          { stage_id: 'capacity_alerting', status: 'PASSED' },
          { stage_id: 'disaster_recovery', status: 'PASSED' },
        ],
        databaseTelemetryBaseline: {
          status: 'verified',
          postgresExporter: { up: 1, lastScrapeError: 0 },
          postgresServer: { pgUp: 1 },
        },
        summary: {
          staticIntegrity: 'passed',
          supplyChainSecurity: 'passed',
          ingressDeployment: 'passed',
          volumeEncryption: 'passed',
          secretRotation: 'passed',
          capacityAlerting: 'passed',
          disasterRecovery: 'passed',
          sloCompliance: 'capacity_alerts_verified',
          recoveryCompliance: 'restore_reconcile_verified',
          alertVerification: 'passed',
          dosResilience: 'passed',
          databaseBaselineCompliance: 'passed',
          noAiPosture: 'preview_excluded_from_launch',
        },
      }),
      'utf8'
    );
    const rec = buildValidApprovedRecord();
    rec.sections.slo_and_alerting.evidence = [passedDossierPath];
    const res = validateApprovedRecord(rec);
    assert.strictEqual(res.categoryBlockers.slo_and_alerting, undefined);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('validateReadiness blocks approval when availability_target_percent < 99.9, max_p95_latency_ms > 500, or capacity_target_rps < 100', () => {
  const lowAvail = buildValidApprovedRecord();
  lowAvail.sections.slo_and_alerting.availability_target_percent = 99.5;
  const availRes = validateApprovedRecord(lowAvail);
  const availBlockers = availRes.categoryBlockers.slo_and_alerting || [];
  assert.ok(
    availBlockers.some((b) => b.includes('Availability target percent must be between 99.9 and 100.0 (received: 99.5)')),
    `Expected low availability blocker, got: ${JSON.stringify(availBlockers)}`
  );

  const highLatency = buildValidApprovedRecord();
  highLatency.sections.slo_and_alerting.max_p95_latency_ms = 750;
  const latencyRes = validateApprovedRecord(highLatency);
  const latencyBlockers = latencyRes.categoryBlockers.slo_and_alerting || [];
  assert.ok(
    latencyBlockers.some((b) => b.includes('Max p95 latency ceiling must be a positive number <= 500ms (received: 750)')),
    `Expected high latency blocker, got: ${JSON.stringify(latencyBlockers)}`
  );

  const lowRps = buildValidApprovedRecord();
  lowRps.sections.slo_and_alerting.capacity_target_rps = 50;
  const rpsRes = validateApprovedRecord(lowRps);
  const rpsBlockers = rpsRes.categoryBlockers.slo_and_alerting || [];
  assert.ok(
    rpsBlockers.some((b) => b.includes('Capacity target RPS must be a positive number >= 100 RPS (received: 50)')),
    `Expected low capacity blocker, got: ${JSON.stringify(rpsBlockers)}`
  );
});

test('validateReadiness blocks approval when rpo_hours > 1 or rto_hours > 4', () => {
  const highRpo = buildValidApprovedRecord();
  highRpo.sections.backup_and_disaster_recovery.rpo_hours = 2;
  const rpoRes = validateApprovedRecord(highRpo);
  const rpoBlockers = rpoRes.categoryBlockers.backup_and_disaster_recovery || [];
  assert.ok(
    rpoBlockers.some((b) => b.includes('RPO hours must be a positive number <= 1 hour (received: 2)')),
    `Expected high RPO blocker, got: ${JSON.stringify(rpoBlockers)}`
  );

  const highRto = buildValidApprovedRecord();
  highRto.sections.backup_and_disaster_recovery.rto_hours = 8;
  const rtoRes = validateApprovedRecord(highRto);
  const rtoBlockers = rtoRes.categoryBlockers.backup_and_disaster_recovery || [];
  assert.ok(
    rtoBlockers.some((b) => b.includes('RTO hours must be a positive number <= 4 hours (received: 8)')),
    `Expected high RTO blocker, got: ${JSON.stringify(rtoBlockers)}`
  );
});

test('backup cron parser computes maximum cyclic start gaps', () => {
  for (const [cron, gap] of [
    ['0 * * * *', 60], ['0,30 * * * *', 30], ['* * * * *', 1],
    ['5,20,55 * * * *', 35], ['*/7 * * * *', 7],
    ['*/40 * * * *', 40], ['  0\t* * * *  ', 60],
    ['0\f*\v*\f*\v*', 60],
  ]) {
    assert.deepStrictEqual(parseBackupScheduleCron(cron), { valid: true, maxGapMinutes: gap });
  }
  for (const cron of [
    '0 2 * * *', '0 * * * * *', '@daily', '*/0 * * * *', '*/61 * * * *',
    '0,0 * * * *', '0,60 * * * *', '0, * * * *', ',0 * * * *',
    '0-30 * * * *', '+0 * * * *', '00x * * * *', '0 * 1 * *',
    '0 * * jan *', '0 * * * mon', '', null,
  ]) {
    assert.strictEqual(parseBackupScheduleCron(cron).valid, false, String(cron));
  }
});

test('approved recovery requires a supported UTC start gap within its RPO', () => {
  for (const [cron, rpo, blocked] of [
    ['0 * * * *', 1, false], ['0,30 * * * *', 0.5, false],
    ['* * * * *', 1 / 60, false], ['5,20,55 * * * *', 35 / 60, false],
    ['*/7 * * * *', 7 / 60, false], ['*/40 * * * *', 0.5, true],
    ['0 2 * * *', 1, true], ['0 * * * *', 0.5, true],
  ]) {
    const record = buildValidApprovedRecord();
    record.sections.backup_and_disaster_recovery.backup_schedule_cron = cron;
    record.sections.backup_and_disaster_recovery.rpo_hours = rpo;
    const result = validateApprovedRecord(record);
    const blockers = result.categoryBlockers.backup_and_disaster_recovery || [];
    assert.strictEqual(blockers.some((item) => item.includes('Backup schedule')), blocked, cron);
  }
  const record = buildValidApprovedRecord();
  record.sections.backup_and_disaster_recovery.backup_schedule_cron = '0 * * * *';
  record.sections.backup_and_disaster_recovery.rpo_hours = 0;
  const blockers = validateApprovedRecord(record).categoryBlockers.backup_and_disaster_recovery || [];
  assert.ok(blockers.some((item) => item.includes('RPO hours')));
  assert.ok(blockers.every((item) => !item.includes('maximum start gap')));
});

test('validateReadiness blocks approval when restore drill evidence reports RTO breach, parity failure, or table/migration count mismatch', () => {
  const os = require('node:os');
  const tmpDir = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'readiness-restore-drill-'));
  try {
    const rtoBreachPath = path.join(tmpDir, 'restore-drill-evidence-rto-breach.json');
    fs.writeFileSync(
      rtoBreachPath,
      JSON.stringify({
        status: 'success',
        rto_target_seconds: 300,
        rto_compliant: false,
        record_parity_verified: true,
        postgis_verified: true,
        foreign_keys_verified: true,
        tables_source: 46,
        tables_restored: 46,
        migrations_source: 17,
        migrations_restored: 17,
      }),
      'utf8'
    );
    const rec1 = buildValidApprovedRecord();
    rec1.sections.backup_and_disaster_recovery.evidence = [rtoBreachPath];
    const res1 = validateApprovedRecord(rec1);
    const b1 = res1.categoryBlockers.backup_and_disaster_recovery || [];
    assert.ok(b1.some((msg) => msg.includes('reports RTO breach (rto_compliant: false)')));

    const parityFailPath = path.join(tmpDir, 'restore-drill-evidence-parity-fail.json');
    fs.writeFileSync(
      parityFailPath,
      JSON.stringify({
        status: 'success',
        rto_target_seconds: 300,
        rto_compliant: true,
        record_parity_verified: false,
        postgis_verified: true,
        foreign_keys_verified: true,
        tables_source: 46,
        tables_restored: 46,
        migrations_source: 17,
        migrations_restored: 17,
      }),
      'utf8'
    );
    const rec2 = buildValidApprovedRecord();
    rec2.sections.backup_and_disaster_recovery.evidence = [parityFailPath];
    const res2 = validateApprovedRecord(rec2);
    const b2 = res2.categoryBlockers.backup_and_disaster_recovery || [];
    assert.ok(b2.some((msg) => msg.includes('reports record parity verification failure')));

    const tableMismatchPath = path.join(tmpDir, 'restore-drill-evidence-table-mismatch.json');
    fs.writeFileSync(
      tableMismatchPath,
      JSON.stringify({
        status: 'success',
        rto_target_seconds: 300,
        rto_compliant: true,
        record_parity_verified: true,
        postgis_verified: true,
        foreign_keys_verified: true,
        tables_source: 46,
        tables_restored: 45,
        migrations_source: 17,
        migrations_restored: 17,
      }),
      'utf8'
    );
    const rec3 = buildValidApprovedRecord();
    rec3.sections.backup_and_disaster_recovery.evidence = [tableMismatchPath];
    const res3 = validateApprovedRecord(rec3);
    const b3 = res3.categoryBlockers.backup_and_disaster_recovery || [];
    assert.ok(b3.some((msg) => msg.includes('reports table count discrepancy (source: 46, restored: 45)')));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('validateReadiness blocks approval when storage reconciliation evidence reports missing or mismatched objects or error status', () => {
  const os = require('node:os');
  const tmpDir = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'readiness-reconcile-'));
  try {
    const errorStatusPath = path.join(tmpDir, 'reconcile-report-error.json');
    fs.writeFileSync(
      errorStatusPath,
      JSON.stringify({
        summary: {
          totalDatabaseObjects: 10,
          totalBucketObjects: 10,
          matchedObjects: 8,
          missingObjects: 2,
          mismatchedObjects: 0,
          status: 'error',
          exitCode: 1,
        },
      }),
      'utf8'
    );
    const rec1 = buildValidApprovedRecord();
    rec1.sections.backup_and_disaster_recovery.evidence = [errorStatusPath];
    const res1 = validateApprovedRecord(rec1);
    const b1 = res1.categoryBlockers.backup_and_disaster_recovery || [];
    assert.ok(b1.some((msg) => msg.includes('reports storage reconciliation failure (summary.status: "error")')));
    assert.ok(b1.some((msg) => msg.includes('reports missing storage object(s) (2 missing)')));

    const mismatchPath = path.join(tmpDir, 'reconcile-report-mismatch.json');
    fs.writeFileSync(
      mismatchPath,
      JSON.stringify({
        summary: {
          totalDatabaseObjects: 10,
          totalBucketObjects: 10,
          matchedObjects: 9,
          missingObjects: 0,
          mismatchedObjects: 1,
          status: 'error',
          exitCode: 1,
        },
      }),
      'utf8'
    );
    const rec2 = buildValidApprovedRecord();
    rec2.sections.backup_and_disaster_recovery.evidence = [mismatchPath];
    const res2 = validateApprovedRecord(rec2);
    const b2 = res2.categoryBlockers.backup_and_disaster_recovery || [];
    assert.ok(b2.some((msg) => msg.includes('reports storage object checksum or size mismatch(es) (1 mismatched)')));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('validateReadiness blocks approval when evidence dossier reports disasterRecoveryBaseline breach or restore/reconcile compliance failure', () => {
  const os = require('node:os');
  const tmpDir = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'readiness-dossier-dr-'));
  try {
    const drBreachPath = path.join(tmpDir, 'launch-evidence-dossier-dr-breached.json');
    fs.writeFileSync(
      drBreachPath,
      JSON.stringify({
        version: '1.0.0',
        environment: 'drill',
        overall_status: 'PASSED',
        total_stages: 7,
        stages: [],
        disasterRecoveryBaseline: {
          status: 'breached',
          error_message: 'stage failed',
        },
        summary: {
          restoreCompliance: 'failed',
          reconcileCompliance: 'failed',
          recoveryCompliance: 'restore_reconcile_failed',
        },
      }),
      'utf8'
    );
    const rec = buildValidApprovedRecord();
    rec.sections.backup_and_disaster_recovery.evidence = [drBreachPath];
    const res = validateApprovedRecord(rec);
    const b = res.categoryBlockers.backup_and_disaster_recovery || [];
    assert.ok(b.some((msg) => msg.includes('reports disaster recovery baseline breach (disasterRecoveryBaseline.status: "breached")')));
    assert.ok(b.some((msg) => msg.includes('reports restore drill compliance failure (summary.restoreCompliance: "failed")')));
    assert.ok(b.some((msg) => msg.includes('reports storage reconciliation compliance failure (summary.reconcileCompliance: "failed")')));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('validateReadiness accepts valid passed disaster recovery evidence and compliant dossier', () => {
  const os = require('node:os');
  const tmpDir = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'readiness-dossier-dr-pass-'));
  try {
    const passedDossierPath = path.join(tmpDir, 'launch-evidence-dossier-dr-pass.json');
    fs.writeFileSync(
      passedDossierPath,
      JSON.stringify({
        version: '1.0.0',
        environment: 'drill',
        overall_status: 'PASSED',
        total_stages: 7,
        passed_stages: 7,
        failed_stages: 0,
        stages: [
          { stage_id: 'static_templates', status: 'PASSED' },
          { stage_id: 'supply_chain_sast', status: 'PASSED' },
          { stage_id: 'ingress_deployment', status: 'PASSED' },
          { stage_id: 'volume_encryption', status: 'PASSED' },
          { stage_id: 'secret_rotation', status: 'PASSED' },
          { stage_id: 'capacity_alerting', status: 'PASSED' },
          { stage_id: 'disaster_recovery', status: 'PASSED' },
        ],
        databaseTelemetryBaseline: {
          status: 'verified',
          postgresExporter: { up: 1, lastScrapeError: 0 },
          postgresServer: { pgUp: 1 },
        },
        disasterRecoveryBaseline: {
          status: 'verified',
          restoreDrill: {
            rtoSeconds: 2.1,
            rtoTargetSeconds: 300,
            rtoCompliant: true,
            tablesSource: 46,
            tablesRestored: 46,
            migrationsSource: 17,
            migrationsRestored: 17,
            postgisVerified: true,
            foreignKeysVerified: true,
            recordParityVerified: true,
          },
          storageReconciliation: {
            totalDatabaseObjects: 10,
            totalBucketObjects: 10,
            matchedObjects: 10,
            missingObjects: 0,
            orphanObjects: 0,
            mismatchedObjects: 0,
            status: 'clean',
          },
        },
        summary: {
          staticIntegrity: 'passed',
          supplyChainSecurity: 'passed',
          ingressDeployment: 'passed',
          volumeEncryption: 'passed',
          secretRotation: 'passed',
          capacityAlerting: 'passed',
          disasterRecovery: 'passed',
          sloCompliance: 'capacity_alerts_verified',
          recoveryCompliance: 'restore_reconcile_verified',
          alertVerification: 'passed',
          dosResilience: 'passed',
          databaseBaselineCompliance: 'passed',
          restoreCompliance: 'passed',
          reconcileCompliance: 'passed',
          noAiPosture: 'preview_excluded_from_launch',
        },
      }),
      'utf8'
    );
    const rec = buildValidApprovedRecord();
    rec.sections.backup_and_disaster_recovery.evidence = [restoreFixturePath, passedDossierPath];
    const res = validateApprovedRecord(rec);
    assert.strictEqual(res.categoryBlockers.backup_and_disaster_recovery, undefined);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('validateReadiness blocks approval when deployment drill evidence reports failure, non-backward-compatible schema, or rollback verification failure', () => {
  const os = require('node:os');
  const tmpDir = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'readiness-dep-drill-'));
  try {
    const depFailPath = path.join(tmpDir, 'deployment-drill-evidence-fail.json');
    fs.writeFileSync(
      depFailPath,
      JSON.stringify({
        status: 'failed',
        schema_backward_compatible: false,
        rollback_procedure_verified: false,
        caddy_routing_verified: false,
        network_isolation_verified: false,
      }),
      'utf8'
    );
    const rec = buildValidApprovedRecord();
    rec.sections.deployment_and_rollback.evidence = [depFailPath];
    rec.sections.deployment_and_rollback.release.live_drill_evidence = depFailPath;
    const res = validateApprovedRecord(rec);
    const b = res.categoryBlockers.deployment_and_rollback || [];
    assert.ok(b.some((msg) => msg.includes('reports deployment drill failure (status: "failed")')));
    assert.ok(b.some((msg) => msg.includes('reports schema backward compatibility failure (schema_backward_compatible: false)')));
    assert.ok(b.some((msg) => msg.includes('reports rollback procedure verification failure (rollback_procedure_verified: false)')));
    assert.ok(b.some((msg) => msg.includes('reports Caddy routing verification failure (caddy_routing_verified: false)')));
    assert.ok(b.some((msg) => msg.includes('reports network isolation verification failure (network_isolation_verified: false)')));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('validateReadiness blocks approval when secret rotation evidence reports failure, errors, step failure, or secret leakage', () => {
  const os = require('node:os');
  const tmpDir = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'readiness-sec-drill-'));
  try {
    const secFailPath = path.join(tmpDir, 'secret-rotation-evidence-fail.json');
    fs.writeFileSync(
      secFailPath,
      JSON.stringify({
        drill_type: 'zero_downtime_secret_rotation_and_compromise_response',
        status: 'failed',
        errors: ['database credential rotation error'],
        steps: {
          session_rollover: { status: 'passed' },
          csrf_rollover: { status: 'failed' },
          database_rotation: { status: 'failed' },
          valkey_rotation: { status: 'passed' },
          storage_rotation: { status: 'passed' },
          compromise_response: { status: 'passed' },
          redaction_audit: {
            status: 'failed',
            raw_secrets_masked: false,
            zero_dev_passwords_detected: false,
          },
        },
      }),
      'utf8'
    );
    const rec = buildValidApprovedRecord();
    rec.sections.secrets_management.evidence = [secFailPath];
    const res = validateApprovedRecord(rec);
    const b = res.categoryBlockers.secrets_management || [];
    assert.ok(b.some((msg) => msg.includes('reports secret rotation drill failure (status: "failed")')));
    assert.ok(b.some((msg) => msg.includes('reports secret rotation drill error(s): database credential rotation error')));
    assert.ok(b.some((msg) => msg.includes("reports secret rotation step 'csrf_rollover' failure (status: \"failed\")")));
    assert.ok(b.some((msg) => msg.includes("reports secret rotation step 'database_rotation' failure (status: \"failed\")")));
    assert.ok(b.some((msg) => msg.includes('reports secret redaction or leak audit failure')));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('validateReadiness blocks approval when evidence dossier reports deployment or secret rotation baseline breach or compliance failure', () => {
  const os = require('node:os');
  const tmpDir = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'readiness-dossier-dep-sec-'));
  try {
    const breachDossierPath = path.join(tmpDir, 'launch-evidence-dossier-breached.json');
    fs.writeFileSync(
      breachDossierPath,
      JSON.stringify({
        version: '1.0.0',
        environment: 'drill',
        overall_status: 'PASSED',
        total_stages: 7,
        stages: [],
        deploymentBaseline: {
          status: 'breached',
          error_message: 'deployment drill failed',
        },
        secretRotationBaseline: {
          status: 'breached',
          error_message: 'secret rotation drill failed',
        },
        summary: {
          deploymentCompliance: 'failed',
          rollbackCompliance: 'failed',
          secretRotationCompliance: 'failed',
        },
      }),
      'utf8'
    );
    const rec1 = buildValidApprovedRecord();
    rec1.sections.deployment_and_rollback.evidence = [breachDossierPath];
    rec1.sections.deployment_and_rollback.release.live_drill_evidence = breachDossierPath;
    const res1 = validateApprovedRecord(rec1);
    const b1 = res1.categoryBlockers.deployment_and_rollback || [];
    assert.ok(b1.some((msg) => msg.includes('reports deployment baseline breach (deploymentBaseline.status: "breached")')));
    assert.ok(b1.some((msg) => msg.includes('reports deployment compliance failure (summary.deploymentCompliance: "failed")')));
    assert.ok(b1.some((msg) => msg.includes('reports rollback compliance failure (summary.rollbackCompliance: "failed")')));

    const rec2 = buildValidApprovedRecord();
    rec2.sections.secrets_management.evidence = [breachDossierPath];
    const res2 = validateApprovedRecord(rec2);
    const b2 = res2.categoryBlockers.secrets_management || [];
    assert.ok(b2.some((msg) => msg.includes('reports secret rotation baseline breach (secretRotationBaseline.status: "breached")')));
    assert.ok(b2.some((msg) => msg.includes('reports secret rotation compliance failure (summary.secretRotationCompliance: "failed")')));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('validateReadiness accepts valid passed deployment & secret rotation evidence and compliant dossier', () => {
  const os = require('node:os');
  const tmpDir = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'readiness-dep-sec-pass-'));
  try {
    const passedDepPath = path.join(tmpDir, 'deployment-drill-evidence-pass.json');
    fs.writeFileSync(
      passedDepPath,
      JSON.stringify({
        status: 'success',
        schema_backward_compatible: true,
        rollback_procedure_verified: true,
        caddy_routing_verified: true,
        network_isolation_verified: true,
        migration_count: 23,
        caddy_routes_tested: 12,
      }),
      'utf8'
    );
    const passedSecPath = path.join(tmpDir, 'secret-rotation-evidence-pass.json');
    fs.writeFileSync(
      passedSecPath,
      JSON.stringify({
        drill_type: 'zero_downtime_secret_rotation_and_compromise_response',
        status: 'success',
        errors: [],
        steps: {
          session_rollover: { status: 'passed' },
          csrf_rollover: { status: 'passed' },
          database_rotation: { status: 'passed' },
          valkey_rotation: { status: 'passed' },
          storage_rotation: { status: 'passed' },
          compromise_response: { status: 'passed' },
          redaction_audit: {
            status: 'passed',
            raw_secrets_masked: true,
            zero_dev_passwords_detected: true,
          },
        },
      }),
      'utf8'
    );
    const passedDossierPath = path.join(tmpDir, 'launch-evidence-dossier-pass.json');
    fs.writeFileSync(
      passedDossierPath,
      JSON.stringify({
        version: '1.0.0',
        environment: 'drill',
        overall_status: 'PASSED',
        total_stages: 7,
        passed_stages: 7,
        failed_stages: 0,
        stages: [
          { stage_id: 'static_templates', status: 'PASSED' },
          { stage_id: 'supply_chain_sast', status: 'PASSED' },
          { stage_id: 'ingress_deployment', status: 'PASSED' },
          { stage_id: 'volume_encryption', status: 'PASSED' },
          { stage_id: 'secret_rotation', status: 'PASSED' },
          { stage_id: 'capacity_alerting', status: 'PASSED' },
          { stage_id: 'disaster_recovery', status: 'PASSED' },
        ],
        databaseTelemetryBaseline: {
          status: 'verified',
        },
        disasterRecoveryBaseline: {
          status: 'verified',
        },
        deploymentBaseline: {
          status: 'verified',
          schemaBackwardCompatible: true,
          caddyRoutingVerified: true,
          rollbackProcedureVerified: true,
          networkIsolationVerified: true,
        },
        secretRotationBaseline: {
          status: 'verified',
          steps: {
            sessionRollover: 'passed',
            csrfRollover: 'passed',
            databaseRotation: 'passed',
            valkeyRotation: 'passed',
            storageRotation: 'passed',
            compromiseResponse: 'passed',
            redactionAudit: 'passed',
          },
        },
        summary: {
          staticIntegrity: 'passed',
          supplyChainSecurity: 'passed',
          ingressDeployment: 'passed',
          volumeEncryption: 'passed',
          secretRotation: 'passed',
          capacityAlerting: 'passed',
          disasterRecovery: 'passed',
          sloCompliance: 'capacity_alerts_verified',
          recoveryCompliance: 'restore_reconcile_verified',
          alertVerification: 'passed',
          dosResilience: 'passed',
          databaseBaselineCompliance: 'passed',
          restoreCompliance: 'passed',
          reconcileCompliance: 'passed',
          deploymentCompliance: 'passed',
          rollbackCompliance: 'passed',
          secretRotationCompliance: 'passed',
          noAiPosture: 'preview_excluded_from_launch',
        },
      }),
      'utf8'
    );

    const rec = buildValidApprovedRecord();
    rec.sections.deployment_and_rollback.evidence = [passedDepPath, passedDossierPath];
    rec.sections.deployment_and_rollback.release.live_drill_evidence = passedDepPath;
    rec.sections.secrets_management.evidence = [passedSecPath, passedDossierPath];

    const res = validateApprovedRecord(rec);
    assert.strictEqual(res.categoryBlockers.deployment_and_rollback, undefined);
    assert.strictEqual(res.categoryBlockers.secrets_management, undefined);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('validateReadiness blocks approval when volume encryption evidence reports failure, invalid config, errors, key separation violation, detected keyfile, or mount failure', () => {
  const os = require('node:os');
  const tmpDir = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'readiness-evidence-vol-'));
  try {
    const failedStatusPath = path.join(tmpDir, 'volume-encryption-evidence-fail.json');
    fs.writeFileSync(
      failedStatusPath,
      JSON.stringify({
        drill_type: 'production_volume_encryption_and_key_separation',
        status: 'failed',
        valid: false,
        errors: ['Mount missing'],
        evaluatedMounts: [{ service: 'postgres', containerPath: '/var/lib/postgresql', passed: false }],
        keySeparation: { verified: false, detectedViolations: [{ path: '/var/lib/postgresql/server.key' }] },
      }),
      'utf8'
    );

    const rec = buildValidApprovedRecord();
    rec.sections.volume_encryption.evidence = [failedStatusPath];
    const res = validateApprovedRecord(rec);
    const blockers = res.categoryBlockers.volume_encryption || [];

    assert.ok(
      blockers.some((b) => b.includes('reports volume encryption verification failure (status: "failed")')),
      `Expected status blocker, got: ${JSON.stringify(blockers)}`
    );
    assert.ok(
      blockers.some((b) => b.includes('reports invalid volume encryption configuration (valid: false)')),
      `Expected valid: false blocker, got: ${JSON.stringify(blockers)}`
    );
    assert.ok(
      blockers.some((b) => b.includes('reports volume encryption error(s): Mount missing')),
      `Expected error message blocker, got: ${JSON.stringify(blockers)}`
    );
    assert.ok(
      blockers.some((b) => b.includes('reports Key Separation Invariant violation (keySeparation.verified: false)')),
      `Expected key separation verified blocker, got: ${JSON.stringify(blockers)}`
    );
    assert.ok(
      blockers.some((b) => b.includes('reports 1 detected keyfile violation(s) in volume mounts or repository')),
      `Expected detected keyfile blocker, got: ${JSON.stringify(blockers)}`
    );
    assert.ok(
      blockers.some((b) => b.includes('reports 1 failed stateful storage mount(s): postgres:/var/lib/postgresql')),
      `Expected failed mount blocker, got: ${JSON.stringify(blockers)}`
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('validateReadiness blocks approval when evidence dossier reports volume encryption baseline breach or compliance failure', () => {
  const os = require('node:os');
  const tmpDir = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'readiness-evidence-vol-dossier-'));
  try {
    const breachedDossierPath = path.join(tmpDir, 'launch-evidence-dossier-breached.json');
    fs.writeFileSync(
      breachedDossierPath,
      JSON.stringify({
        version: '1.0.0',
        environment: 'drill',
        overall_status: 'PASSED',
        total_stages: 7,
        passed_stages: 7,
        failed_stages: 0,
        stages: [],
        volumeEncryptionBaseline: { status: 'breached' },
        summary: { volumeEncryptionCompliance: 'failed' },
      }),
      'utf8'
    );

    const rec = buildValidApprovedRecord();
    rec.sections.volume_encryption.evidence = [breachedDossierPath];
    const res = validateApprovedRecord(rec);
    const blockers = res.categoryBlockers.volume_encryption || [];

    assert.ok(
      blockers.some((b) => b.includes('reports volume encryption baseline breach (volumeEncryptionBaseline.status: "breached")')),
      `Expected baseline breach blocker, got: ${JSON.stringify(blockers)}`
    );
    assert.ok(
      blockers.some((b) => b.includes('reports volume encryption compliance failure (summary.volumeEncryptionCompliance: "failed")')),
      `Expected compliance failure blocker, got: ${JSON.stringify(blockers)}`
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('validateReadiness accepts valid passed volume encryption evidence and compliant dossier', () => {
  const os = require('node:os');
  const tmpDir = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'readiness-evidence-vol-pass-'));
  try {
    const passedVolPath = path.join(tmpDir, 'volume-encryption-evidence-pass.json');
    fs.writeFileSync(
      passedVolPath,
      JSON.stringify({
        drill_type: 'production_volume_encryption_and_key_separation',
        status: 'success',
        valid: true,
        errors: [],
        warnings: [],
        totalRequiredMounts: 9,
        validMountsCount: 9,
        evaluatedMounts: [
          { service: 'postgres', containerPath: '/var/lib/postgresql', passed: true },
          { service: 'valkey', containerPath: '/data', passed: true },
          { service: 'garage', containerPath: '/var/lib/garage/meta', passed: true },
          { service: 'garage', containerPath: '/var/lib/garage/data', passed: true },
          { service: 'clamav', containerPath: '/var/lib/clamav', passed: true },
          { service: 'caddy', containerPath: '/data', passed: true },
          { service: 'caddy', containerPath: '/config', passed: true },
          { service: 'prometheus', containerPath: '/prometheus', passed: true },
          { service: 'grafana', containerPath: '/var/lib/grafana', passed: true },
        ],
        keySeparation: {
          verified: true,
          scannedPaths: ['/backups'],
          detectedViolations: [],
        },
      }),
      'utf8'
    );
    const passedDossierPath = path.join(tmpDir, 'launch-evidence-dossier-pass.json');
    fs.writeFileSync(
      passedDossierPath,
      JSON.stringify({
        version: '1.0.0',
        environment: 'drill',
        overall_status: 'PASSED',
        total_stages: 7,
        passed_stages: 7,
        failed_stages: 0,
        stages: [
          { stage_id: 'volume_encryption', status: 'PASSED' },
        ],
        volumeEncryptionBaseline: {
          status: 'verified',
          totalRequiredMounts: 9,
          validMountsCount: 9,
          keySeparationVerified: true,
          violationsDetected: 0,
        },
        summary: {
          volumeEncryptionCompliance: 'passed',
        },
      }),
      'utf8'
    );

    const rec = buildValidApprovedRecord();
    rec.sections.volume_encryption.evidence = [passedVolPath, passedDossierPath];

    const res = validateApprovedRecord(rec);
    assert.strictEqual(res.categoryBlockers.volume_encryption, undefined);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('validateReadiness blocks approval when SAST drill evidence reports failure, unreviewed blockers, or expired suppressions', () => {
  const os = require('node:os');
  const tmpDir = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'readiness-evidence-sast-fail-'));
  try {
    const failedSastPath = path.join(tmpDir, 'sast-scan-evidence-fail.json');
    fs.writeFileSync(
      failedSastPath,
      JSON.stringify({
        drill_type: 'sast_security_scan',
        status: 'failed',
        passed: false,
        scannedFilesCount: 300,
        totalFindingsCount: 2,
        blockingActiveFindings: [
          { ruleId: 'SAST-01', severity: 'BLOCKER', file: 'server/src/leak.ts', line: 10 }
        ],
        expiredFindings: [
          { finding: { ruleId: 'SAST-04' }, expiredAt: '2025-01-01' }
        ],
      }),
      'utf8'
    );

    const rec = buildValidApprovedRecord();
    rec.sections.secrets_management.evidence = [failedSastPath];
    const res = validateApprovedRecord(rec);
    const blockers = res.categoryBlockers.secrets_management || [];

    assert.ok(
      blockers.some((b) => b.includes('reports SAST scan verification failure (status: "failed")')),
      `Expected status blocker, got: ${JSON.stringify(blockers)}`
    );
    assert.ok(
      blockers.some((b) => b.includes('reports SAST scan failure (passed: false)')),
      `Expected passed: false blocker, got: ${JSON.stringify(blockers)}`
    );
    assert.ok(
      blockers.some((b) => b.includes('reports 1 active unreviewed SAST blocker finding(s)')),
      `Expected active blockers finding, got: ${JSON.stringify(blockers)}`
    );
    assert.ok(
      blockers.some((b) => b.includes('reports 1 expired SAST suppression(s) (fail-closed)')),
      `Expected expired suppression blocker, got: ${JSON.stringify(blockers)}`
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('validateReadiness blocks approval when SBOM drill evidence reports license compliance failure or unapproved copyleft licenses', () => {
  const os = require('node:os');
  const tmpDir = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'readiness-evidence-sbom-fail-'));
  try {
    const failedSbomPath = path.join(tmpDir, 'sbom-inventory-fail.json');
    fs.writeFileSync(
      failedSbomPath,
      JSON.stringify({
        bomFormat: 'CycloneDX',
        specVersion: '1.5',
        components: [{ name: 'viral-pkg', version: '1.0.0' }],
        licenseCompliance: {
          compliant: false,
          violations: [
            { component: 'viral-pkg@1.0.0', license: 'AGPL-3.0-only', reason: 'banned' },
          ],
          totalComponents: 1,
        },
        licenseViolations: ['viral-pkg@1.0.0 (AGPL-3.0-only)'],
      }),
      'utf8'
    );

    const rec = buildValidApprovedRecord();
    rec.sections.secrets_management.evidence = [failedSbomPath];
    const res = validateApprovedRecord(rec);
    const blockers = res.categoryBlockers.secrets_management || [];

    assert.ok(
      blockers.some((b) => b.includes('reports SBOM license compliance failure (licenseCompliance.compliant: false)')),
      `Expected compliant: false blocker, got: ${JSON.stringify(blockers)}`
    );
    assert.ok(
      blockers.some((b) => b.includes('reports 1 SBOM license compliance violation(s): viral-pkg@1.0.0 (AGPL-3.0-only)')),
      `Expected license violation details blocker, got: ${JSON.stringify(blockers)}`
    );
    assert.ok(
      blockers.some((b) => b.includes('reports 1 SBOM license violation(s)')),
      `Expected licenseViolations count blocker, got: ${JSON.stringify(blockers)}`
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('validateReadiness blocks approval when SBOM drill evidence is missing license compliance verification', () => {
  const os = require('node:os');
  const tmpDir = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'readiness-evidence-sbom-nolic-'));
  try {
    const noLicSbomPath = path.join(tmpDir, 'sbom-inventory-unverified.json');
    fs.writeFileSync(
      noLicSbomPath,
      JSON.stringify({
        bomFormat: 'CycloneDX',
        specVersion: '1.5',
        components: [{ name: 'unverified-pkg', version: '1.0.0' }],
      }),
      'utf8'
    );

    const rec = buildValidApprovedRecord();
    rec.sections.secrets_management.evidence = [noLicSbomPath];
    const res = validateApprovedRecord(rec);
    const blockers = res.categoryBlockers.secrets_management || [];

    assert.ok(
      blockers.some((b) => b.includes('missing license compliance verification (licenseCompliance object required)')),
      `Expected missing license compliance blocker, got: ${JSON.stringify(blockers)}`
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('validateReadiness blocks approval when container security drill evidence reports failure, errors, or failed security checks', () => {
  const os = require('node:os');
  const tmpDir = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'readiness-evidence-container-fail-'));
  try {
    const failedContainerPath = path.join(tmpDir, 'container-security-evidence-fail.json');
    fs.writeFileSync(
      failedContainerPath,
      JSON.stringify({
        drill_type: 'container_security_verification',
        status: 'failed',
        valid: false,
        errors: ['[Dockerfile] non-root-runtime-user: root user detected'],
        checks: [
          { target: 'Dockerfile', check: 'non-root-runtime-user', passed: false },
        ],
      }),
      'utf8'
    );

    const rec = buildValidApprovedRecord();
    rec.sections.secrets_management.evidence = [failedContainerPath];
    const res = validateApprovedRecord(rec);
    const blockers = res.categoryBlockers.secrets_management || [];

    assert.ok(
      blockers.some((b) => b.includes('reports container security verification failure (status: "failed")')),
      `Expected status blocker, got: ${JSON.stringify(blockers)}`
    );
    assert.ok(
      blockers.some((b) => b.includes('reports invalid container security configuration (valid: false)')),
      `Expected valid: false blocker, got: ${JSON.stringify(blockers)}`
    );
    assert.ok(
      blockers.some((b) => b.includes('reports container security error(s): [Dockerfile] non-root-runtime-user: root user detected')),
      `Expected errors blocker, got: ${JSON.stringify(blockers)}`
    );
    assert.ok(
      blockers.some((b) => b.includes('reports 1 failed container security check(s): [Dockerfile] non-root-runtime-user')),
      `Expected failed check blocker, got: ${JSON.stringify(blockers)}`
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('validateReadiness blocks approval when evidence dossier reports supplyChainBaseline breach or compliance failure', () => {
  const os = require('node:os');
  const tmpDir = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'readiness-evidence-sc-dossier-'));
  try {
    const breachedDossierPath = path.join(tmpDir, 'launch-evidence-dossier-sc-breached.json');
    fs.writeFileSync(
      breachedDossierPath,
      JSON.stringify({
        version: '1.0.0',
        environment: 'drill',
        overall_status: 'PASSED',
        total_stages: 7,
        passed_stages: 7,
        failed_stages: 0,
        stages: [],
        supplyChainBaseline: { status: 'breached' },
        summary: {
          supplyChainCompliance: 'failed',
          sastCompliance: 'failed',
          containerSecurityCompliance: 'failed',
        },
      }),
      'utf8'
    );

    const rec = buildValidApprovedRecord();
    rec.sections.secrets_management.evidence = [breachedDossierPath];
    const res = validateApprovedRecord(rec);
    const blockers = res.categoryBlockers.secrets_management || [];

    assert.ok(
      blockers.some((b) => b.includes('reports supply chain security baseline breach (supplyChainBaseline.status: "breached")')),
      `Expected supplyChainBaseline breach blocker, got: ${JSON.stringify(blockers)}`
    );
    assert.ok(
      blockers.some((b) => b.includes('reports supply chain security compliance failure (summary.supplyChainCompliance: "failed")')),
      `Expected supplyChainCompliance failure blocker, got: ${JSON.stringify(blockers)}`
    );
    assert.ok(
      blockers.some((b) => b.includes('reports SAST scan compliance failure (summary.sastCompliance: "failed")')),
      `Expected sastCompliance failure blocker, got: ${JSON.stringify(blockers)}`
    );
    assert.ok(
      blockers.some((b) => b.includes('reports container security compliance failure (summary.containerSecurityCompliance: "failed")')),
      `Expected containerSecurityCompliance failure blocker, got: ${JSON.stringify(blockers)}`
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('validateReadiness accepts valid passed SAST, SBOM, container security child evidence, and compliant dossier', () => {
  const os = require('node:os');
  const tmpDir = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'readiness-evidence-sc-pass-'));
  try {
    const passedSbomPath = path.join(tmpDir, 'sbom-inventory-pass.json');
    fs.writeFileSync(
      passedSbomPath,
      JSON.stringify({
        bomFormat: 'CycloneDX',
        specVersion: '1.5',
        components: [{ name: 'safe-pkg', version: '1.0.0' }],
        licenseCompliance: {
          compliant: true,
          violations: [],
          totalComponents: 1,
        },
      }),
      'utf8'
    );
    const passedSastPath = path.join(tmpDir, 'sast-scan-evidence-pass.json');
    fs.writeFileSync(
      passedSastPath,
      JSON.stringify({
        drill_type: 'sast_security_scan',
        status: 'success',
        passed: true,
        scannedFilesCount: 300,
        totalFindingsCount: 0,
        blockingActiveFindings: [],
        expiredFindings: [],
      }),
      'utf8'
    );
    const passedContainerPath = path.join(tmpDir, 'container-security-evidence-pass.json');
    fs.writeFileSync(
      passedContainerPath,
      JSON.stringify({
        drill_type: 'container_security_verification',
        status: 'success',
        valid: true,
        errors: [],
        checks: [{ target: 'server/Dockerfile', check: 'non-root-runtime-user', passed: true }],
      }),
      'utf8'
    );
    const passedDossierPath = path.join(tmpDir, 'launch-evidence-dossier-pass.json');
    fs.writeFileSync(
      passedDossierPath,
      JSON.stringify({
        version: '1.0.0',
        environment: 'drill',
        overall_status: 'PASSED',
        total_stages: 7,
        passed_stages: 7,
        failed_stages: 0,
        stages: [{ stage_id: 'supply_chain_sast', status: 'PASSED' }],
        supplyChainBaseline: {
          status: 'verified',
          sbom: { packagesCount: 1, licenseComplianceVerified: true, violationsCount: 0 },
          sast: { filesScanned: 300, totalFindingsCount: 0, blockingActiveFindingsCount: 0, expiredFindingsCount: 0, passed: true },
          containerSecurity: { valid: true, totalChecks: 1, passedChecks: 1, errorsCount: 0 },
        },
        summary: {
          supplyChainCompliance: 'passed',
          sastCompliance: 'passed',
          containerSecurityCompliance: 'passed',
        },
      }),
      'utf8'
    );

    const rec = buildValidApprovedRecord();
    rec.sections.secrets_management.evidence = [passedSbomPath, passedSastPath, passedContainerPath, passedDossierPath];

    const res = validateApprovedRecord(rec);
    assert.strictEqual(res.categoryBlockers.secrets_management, undefined);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('the checked-in template readiness.example.json fails closed with unresolved blockers', () => {
  const templatePath = path.resolve(__dirname, '../../infra/launch/readiness.example.json');
  const raw = fs.readFileSync(templatePath, 'utf8');
  const templateRecord = JSON.parse(raw);

  const result = validateReadiness(templateRecord, templatePath);
  const categories = Object.keys(result.categoryBlockers);

  assert.ok(categories.length > 0, 'Expected checked-in template to have unresolved blockers');
  assert.strictEqual(result.totalApproved, 0, 'Expected 0 approved categories in checked-in template');
  assert.ok(
    (result.categoryBlockers.deployment_and_rollback || []).every((message) => !message.includes('ACRES_CLIENT_IMAGE') && !message.includes('ACRES_SERVER_IMAGE')),
    'Unapproved template must not require image exports'
  );

  // Verify that optional_ai_posture in template fails because status is unresolved and evidence is empty
  const aiBlockers = result.categoryBlockers.optional_ai_posture || [];
  assert.ok(
    aiBlockers.some((b) => b.includes("Section status is 'unresolved'")),
    `Expected unresolved status blocker for optional_ai_posture, got: ${JSON.stringify(aiBlockers)}`
  );
  assert.ok(
    aiBlockers.some((b) => b.includes('Evidence array is empty or missing')),
    `Expected empty evidence blocker for optional_ai_posture, got: ${JSON.stringify(aiBlockers)}`
  );
});

test('static integrity child evidence accepts exact success and rejects contradictory checks', () => {
  const os = require('node:os');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'readiness-static-'));
  try {
    const file = path.join(dir, 'static-integrity-evidence-test.json');
    const good = runChecks(() => ({ status: 0 }));
    const record = buildValidApprovedRecord();
    record.sections.secret_references.evidence = [file];
    fs.writeFileSync(file, JSON.stringify(good));
    assert.strictEqual(validateApprovedRecord(record).categoryBlockers.secret_references, undefined);

    const mutations = [
      (value) => { value.checks[0].passed = false; },
      (value) => { value.checks[1].exitCode = 2; },
      (value) => { value.checks[2].exitCode = null; },
      (value) => { value.checks[1].id = value.checks[0].id; },
      (value) => { value.checks.pop(); },
      (value) => { value.passedChecks = 2; },
      (value) => { value.valid = false; },
      (value) => { value.status = 'failed'; },
    ];
    for (const mutate of mutations) {
      const changed = structuredClone(good);
      mutate(changed);
      fs.writeFileSync(file, JSON.stringify(changed));
      const blockers = validateApprovedRecord(record).categoryBlockers.secret_references || [];
      assert.ok(blockers.some((blocker) => blocker.includes('invalid static integrity evidence')), JSON.stringify(blockers));
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('static integrity dossier baseline and compliance must agree with approval', () => {
  const os = require('node:os');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'readiness-static-dossier-'));
  try {
    const file = path.join(dir, 'launch-evidence-dossier-static.json');
    const record = buildValidApprovedRecord();
    record.sections.secret_references.evidence = [file];
    const good = { overall_status: 'PASSED', staticIntegrityBaseline: { status: 'verified' },
      summary: { staticIntegrity: 'passed', staticIntegrityCompliance: 'passed' } };
    fs.writeFileSync(file, JSON.stringify(good));
    assert.strictEqual(validateApprovedRecord(record).categoryBlockers.secret_references, undefined);
    for (const changed of [
      { ...good, staticIntegrityBaseline: { status: 'breached' } },
      { ...good, summary: { ...good.summary, staticIntegrityCompliance: 'failed' } },
      { ...good, staticIntegrityBaseline: {} },
    ]) {
      fs.writeFileSync(file, JSON.stringify(changed));
      assert.ok(validateApprovedRecord(record).categoryBlockers.secret_references?.length);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
