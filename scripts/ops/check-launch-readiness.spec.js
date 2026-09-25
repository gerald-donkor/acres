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
  isSecretRotationCandidate,
  validateSecretRotationReport,
  isDeploymentDrillCandidate,
  validateDeploymentDrillReport,
  DEPLOYMENT_DRAIN_PERIODS,
  isCapacityAlertingCandidate,
  validateCapacityAlertingReport,
  parseCapacityAlertingTimestamp,
  isCaddyRoutingCandidate,
  parseCaddyRoutingTimestamp,
  validateCaddyRoutingReport,
  isSmtpDeliveryCandidate,
  validateSmtpDeliveryReport,
  isSecretReferencePolicyCandidate,
  validateSecretReferencePolicyReport,
} = require('./check-launch-readiness');
const { runChecks } = require('./run-static-integrity-checks');

const fixedNow = new Date('2026-09-25T12:00:00Z');
const restoreFixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'readiness-restore-fixture-'));
const restoreFixturePath = path.join(restoreFixtureDir, 'restore-drill-evidence-valid.json');
const reconciliationFixturePath = path.join(restoreFixtureDir, 'reconcile-report-valid.json');
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
const validReconciliationReport = {
  timestamp: '2026-08-28T12:00:00.000Z',
  summary: {
    totalDatabaseObjects: 1,
    activeDatabaseObjects: 1,
    pendingOrDeletedExcluded: 0,
    totalBucketObjects: 1,
    matchedObjects: 1,
    missingObjects: 0,
    orphanObjects: 0,
    mismatchedObjects: 0,
    status: 'clean',
    exitCode: 0,
  },
  matched: [{}], missing: [], orphans: [], mismatches: [],
};
fs.writeFileSync(reconciliationFixturePath, JSON.stringify(validReconciliationReport));
const volumeEncryptionFixturePath = path.join(restoreFixtureDir, 'volume-encryption-evidence-valid.json');
const validVolumeEncryptionReport = {
  drill_type: 'production_volume_encryption_and_key_separation',
  timestamp: '2026-08-28T12:00:00.000Z',
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
    scannedPaths: ['/mnt/encrypted'],
    detectedViolations: [],
  },
  readinessEvaluated: null,
};
fs.writeFileSync(volumeEncryptionFixturePath, JSON.stringify(validVolumeEncryptionReport));
const secretRotationFixturePath = path.join(restoreFixtureDir, 'secret-rotation-evidence-valid.json');
const validSecretRotationReport = {
  drill_type: 'zero_downtime_secret_rotation_and_compromise_response',
  timestamp: '20260828T120000Z',
  dry_run: true,
  status: 'success',
  errors: [],
  environment_topology: {
    live_postgres: false,
    live_valkey: false,
    live_api: false,
  },
  tested_secret_classes: [
    'session_secret',
    'csrf_secret',
    'postgres_passwords',
    'valkey_password',
    'storage_s3_keys',
    'smtp_credentials',
    'grafana_admin_password',
  ],
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
};
fs.writeFileSync(secretRotationFixturePath, JSON.stringify(validSecretRotationReport));
const deploymentDrillFixturePath = path.join(restoreFixtureDir, 'deployment-drill-evidence-valid.json');
const validDeploymentDrillReport = {
  drill_timestamp: '20260828T120000Z',
  duration_ms: 1200,
  duration_seconds: 1,
  caddyfile: 'infra/caddy/Caddyfile.example',
  compose_file: 'infra/compose/docker-compose.production.example.yml',
  dry_run: true,
  caddy_routing_verified: true,
  caddy_routes_tested: 12,
  security_headers_verified: true,
  s3_sigv4_host_preserved: true,
  migrations_verified: true,
  migration_count: 5,
  schema_backward_compatible: true,
  operational_templates_verified: true,
  secrets_scan_verified: true,
  readiness_probes_verified: true,
  probe_live_tested: false,
  graceful_drain_periods_verified: {
    caddy: '30s',
    next: '30s',
    api: '45s',
    worker: '60s',
  },
  network_isolation_verified: true,
  rollback_procedure_verified: true,
  status: 'success',
};
fs.writeFileSync(deploymentDrillFixturePath, JSON.stringify(validDeploymentDrillReport));
const capacityAlertingFixturePath = path.join(restoreFixtureDir, 'capacity-alerting-drill-evidence-valid.json');
const validCapacityAlertingReport = {
  timestamp: '20260828T120000Z',
  durationMs: 4500,
  status: 'success',
  summary: {
    alertVerification: 'passed',
    capacitySloCompliance: 'passed',
    dosResilience: 'passed',
    databaseBaselineCompliance: 'passed',
  },
  alerts: {
    valid: true,
    ruleCount: 11,
    errors: [],
    rules: Array.from({ length: 11 }, (_, i) => ({ alert: `Rule${i + 1}`, expr: 'up == 1' })),
    simulations: Array.from({ length: 11 }, (_, i) => ({ rule: `Rule${i + 1}`, passed: true })),
  },
  capacity: {
    status: 'passed',
    compliance: {
      availabilityPassed: true,
      latencyPassed: true,
      throughputPassed: true,
      databaseAcquisitionLatencyPassed: true,
      databaseQueryLatencyPassed: true,
      monotonicDbAcquisition: true,
      monotonicDbQuery: true,
      overallPassed: true,
    },
    sloTargets: {
      availabilityTargetPercent: 99.9,
      maxP95LatencyMs: 500,
      capacityTargetRps: 100,
      maxDatabaseAcquisitionP95LatencyMs: 50,
      maxDatabaseQueryP95LatencyMs: 100,
    },
  },
  databaseTelemetryBaseline: {
    status: 'verified',
    postgresExporter: {
      up: 1,
      lastScrapeError: 0,
    },
    postgresServer: {
      pgUp: 1,
    },
    connectionPool: {
      api: { requestsWaiting: 0 },
      worker: { requestsWaiting: 0 },
    },
    poolAcquisitionLatency: {
      api: { p95Ms: 1.8 },
      worker: { p95Ms: 1.8 },
    },
    queryExecutionDuration: {
      api: { p95Ms: 24.1 },
      worker: { p95Ms: 24.1 },
    },
    serverActivity: {
      lockWaits: 0,
    },
  },
  dosResilience: {
    status: 'success',
  },
  failures: [],
};
fs.writeFileSync(capacityAlertingFixturePath, JSON.stringify(validCapacityAlertingReport));
const caddyRoutingFixturePath = path.join(restoreFixtureDir, 'caddy-routing-evidence-valid.json');
const validCaddyRoutingReport = {
  drill_type: 'caddy_routing_and_tls_verification',
  timestamp: '2026-08-28T12:00:00.000Z',
  status: 'success',
  valid: true,
  targetPath: 'infra/caddy/Caddyfile.production',
  domain: 'acres.example.com',
  hstsApproved: true,
  securityHeadersVerified: true,
  s3SigV4HostPreserved: true,
  proxyHeadersVerified: true,
  routesEvaluated: 12,
  routesPassed: 12,
  evaluatedRoutes: Array.from({ length: 12 }, (_, i) => ({
    requestPath: `/test-route-${i}`,
    upstream: 'api:3001',
    passed: true,
  })),
  errors: [],
  warnings: [],
};
fs.writeFileSync(caddyRoutingFixturePath, JSON.stringify(validCaddyRoutingReport));
const smtpFixturePath = path.join(restoreFixtureDir, 'smtp-delivery-evidence-valid.json');
const validSmtpReport = {
  drill_type: 'smtp_delivery_verification',
  timestamp: '2026-08-28T12:00:00.000Z',
  status: 'success',
  provider: 'resend',
  host: 'smtp.resend.com',
  port: 587,
  tls_mode: 'STARTTLS',
  from_address: 'notifications@acres.example.com',
  delivery: {
    status: 'delivered',
    receipt_id: 'provider-receipt-123',
    timestamp: '2026-08-28T12:01:00.000Z',
  },
  dns: {
    checked_at: '2026-08-28T12:00:00.000Z',
    spf: { passed: true, record: 'dns-printout-spf' },
    dkim: { passed: true, record: 'dns-printout-dkim' },
    dmarc: { passed: true, record: 'dns-printout-dmarc' },
  },
  errors: [],
};
fs.writeFileSync(smtpFixturePath, JSON.stringify(validSmtpReport));
const secretReferences = {
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
};
const secretPolicyFixturePath = path.join(restoreFixtureDir, 'secret-reference-policy-valid.json');
const validSecretPolicyReport = {
  drill_type: 'secret_reference_policy_verification',
  timestamp: '2026-08-28T12:00:00.000Z',
  status: 'success',
  errors: [],
  policy_reference: 'vault-policy-printout-123',
  references: Object.fromEntries(Object.entries(secretReferences).map(([key, source]) =>
    [key, { source, access_verified: true, plaintext_exposed: false }])),
};
fs.writeFileSync(secretPolicyFixturePath, JSON.stringify(validSecretPolicyReport));
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
        evidence: [caddyRoutingFixturePath, 'DNS A record points to host', 'Caddyfile HSTS verified'],
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
        evidence: [smtpFixturePath],
        notes: 'Verified SMTP delivery',
      },
      secrets_management: {
        status: 'approved',
        injection_mechanism: 'vault-agent',
        masking_policy: 'All credentials masked in logs and telemetry',
        rotation_cadence_days: 90,
        compromise_response_plan: 'docs/runbooks/compromise-response.md',
        approver: 'security-lead',
        evidence: [secretRotationFixturePath],
        notes: 'Verified secrets management',
      },
      secret_references: {
        status: 'approved',
        ...secretReferences,
        approver: 'security-lead',
        evidence: [secretPolicyFixturePath],
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
        evidence: [capacityAlertingFixturePath],
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
        evidence: [restoreFixturePath, reconciliationFixturePath],
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
        evidence: [volumeEncryptionFixturePath],
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
          live_drill_evidence: deploymentDrillFixturePath,
        },
        live_readiness_drill_completed: true,
        approver: 'release-manager',
        evidence: [deploymentDrillFixturePath],
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
    record.sections.backup_and_disaster_recovery.evidence = [file, reconciliationFixturePath];
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
    record.sections.backup_and_disaster_recovery.evidence = [latest, older, reconciliationFixturePath];
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

test('approved recovery requires a reconciliation child report beyond declaration, prose, or dossier', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'readiness-reconcile-required-'));
  try {
    const dossier = path.join(dir, 'launch-evidence-dossier.json');
    const fake = path.join(dir, 'reconcile-report-fake.json');
    fs.writeFileSync(dossier, JSON.stringify({ overall_status: 'PASSED' }));
    fs.writeFileSync(fake, JSON.stringify({ status: 'success' }));
    for (const evidence of [
      [], [restoreFixturePath, 'Reconciliation completed'],
      [restoreFixturePath, dossier], [restoreFixturePath, fake],
    ]) {
      const record = buildValidApprovedRecord();
      record.sections.backup_and_disaster_recovery.evidence = evidence;
      const blockers = validateApprovedRecord(record).categoryBlockers.backup_and_disaster_recovery || [];
      assert.ok(blockers.some((item) => item.includes('storage reconciliation child JSON report is required') ||
        item.includes('storage reconciliation report is invalid or failed')), JSON.stringify(blockers));
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('reconciliation child report validates producer fields, dates, and result consistency', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'readiness-reconcile-fields-'));
  try {
    const file = path.join(dir, 'custom-evidence.json');
    const record = buildValidApprovedRecord();
    record.sections.backup_and_disaster_recovery.evidence = [restoreFixturePath, file];
    fs.writeFileSync(file, JSON.stringify(validReconciliationReport));
    assert.strictEqual(validateApprovedRecord(record).categoryBlockers.backup_and_disaster_recovery, undefined);
    const mutations = [
      (r) => { delete r.timestamp; },
      (r) => { r.timestamp = '2026-02-30T12:00:00.000Z'; },
      (r) => { r.timestamp = '2026-09-26T12:00:00.000Z'; },
      (r) => { r.timestamp = '2026-08-28T12:00:00+00:00'; },
      (r) => { delete r.summary.activeDatabaseObjects; },
      (r) => { r.summary.totalDatabaseObjects = -1; },
      (r) => { r.summary.totalBucketObjects = 1.5; },
      (r) => { r.summary.matchedObjects = Number.MAX_SAFE_INTEGER + 1; },
      (r) => { r.summary.orphanObjects = '0'; },
      (r) => { r.matched = null; },
      (r) => { r.missing = undefined; },
      (r) => { r.orphans = {}; },
      (r) => { r.mismatches = null; },
      (r) => { r.summary.matchedObjects = 0; },
      (r) => { r.summary.missingObjects = 0; r.missing = [{}]; },
      (r) => { r.summary.missingObjects = 1; r.missing = [{}]; r.summary.status = 'clean'; },
      (r) => { r.summary.mismatchedObjects = 1; r.mismatches = [{}]; r.summary.status = 'clean'; },
      (r) => { r.summary.exitCode = 1; },
      (r) => { r.summary.status = 'error'; },
      (r) => { r.summary.status = 'failed'; },
    ];
    for (const mutate of mutations) {
      const report = structuredClone(validReconciliationReport);
      mutate(report);
      fs.writeFileSync(file, JSON.stringify(report));
      const blockers = validateApprovedRecord(record).categoryBlockers.backup_and_disaster_recovery || [];
      assert.ok(blockers.some((item) => item.includes('storage reconciliation report is invalid or failed')),
        JSON.stringify(report));
      assert.ok(blockers.includes('A referenced storage reconciliation report is invalid or failed'));
    }
    const warning = structuredClone(validReconciliationReport);
    warning.summary.totalBucketObjects = 2;
    warning.summary.orphanObjects = 1;
    warning.summary.status = 'warning';
    warning.orphans = [{}];
    fs.writeFileSync(file, JSON.stringify(warning));
    assert.strictEqual(validateApprovedRecord(record).categoryBlockers.backup_and_disaster_recovery, undefined);
    warning.summary.orphanObjects = 0;
    fs.writeFileSync(file, JSON.stringify(warning));
    assert.ok(validateApprovedRecord(record).categoryBlockers.backup_and_disaster_recovery?.some(
      (item) => item.includes('storage reconciliation report is invalid or failed')));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('wildcard reconciliation evidence rejects a failed child alongside a valid child', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'readiness-reconcile-glob-'));
  try {
    fs.writeFileSync(path.join(dir, 'reconcile-report-good.json'), JSON.stringify(validReconciliationReport));
    fs.writeFileSync(path.join(dir, 'reconcile-report-bad.json'), JSON.stringify({ summary: { status: 'clean' } }));
    const record = buildValidApprovedRecord();
    record.sections.backup_and_disaster_recovery.evidence = [restoreFixturePath, path.join(dir, 'reconcile-report-*.json')];
    const blockers = validateApprovedRecord(record).categoryBlockers.backup_and_disaster_recovery || [];
    assert.ok(blockers.some((item) => item.includes('storage reconciliation report is invalid or failed')));
    assert.strictEqual(validateApprovedRecord(record).categoryBlockers.production_domain_tls, undefined);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a real-shaped unified dossier is not mistaken for reconciliation child evidence', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'readiness-reconcile-dossier-'));
  try {
    const dossier = path.join(dir, 'launch-evidence-dossier.json');
    fs.writeFileSync(dossier, JSON.stringify({
      version: '1.0.0',
      timestamp: '2026-08-28T12:00:00.000Z',
      environment: 'production',
      overall_status: 'PASSED',
      total_stages: 7,
      passed_stages: 7,
      failed_stages: 0,
      stages: [],
      disasterRecoveryBaseline: { status: 'verified' },
      summary: { restoreCompliance: 'passed', reconcileCompliance: 'passed' },
    }));
    const record = buildValidApprovedRecord();
    record.sections.backup_and_disaster_recovery.evidence = [
      restoreFixturePath, reconciliationFixturePath, dossier,
    ];
    assert.strictEqual(validateApprovedRecord(record).categoryBlockers.backup_and_disaster_recovery, undefined);
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
    record.sections.backup_and_disaster_recovery.evidence = [restoreFixturePath, reconciliationFixturePath, dossierPath];

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
    rec.sections.slo_and_alerting.evidence = [capacityAlertingFixturePath, passedDossierPath];
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
    rec.sections.backup_and_disaster_recovery.evidence = [restoreFixturePath, reconciliationFixturePath, passedDossierPath];
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
        drill_timestamp: '20260828T120000Z',
        duration_ms: 1200,
        duration_seconds: 1,
        status: 'success',
        schema_backward_compatible: true,
        rollback_procedure_verified: true,
        caddy_routing_verified: true,
        network_isolation_verified: true,
        migration_count: 23,
        caddy_routes_tested: 12,
        security_headers_verified: true,
        s3_sigv4_host_preserved: true,
        migrations_verified: true,
        operational_templates_verified: true,
        secrets_scan_verified: true,
        readiness_probes_verified: true,
        graceful_drain_periods_verified: {
          caddy: '30s',
          next: '30s',
          api: '45s',
          worker: '60s',
        },
      }),
      'utf8'
    );
    const passedSecPath = path.join(tmpDir, 'secret-rotation-evidence-pass.json');
    fs.writeFileSync(
      passedSecPath,
      JSON.stringify({
        drill_type: 'zero_downtime_secret_rotation_and_compromise_response',
        timestamp: '2026-08-28T12:00:00.000Z',
        status: 'success',
        errors: [],
        tested_secret_classes: [
          'session_secret',
          'csrf_secret',
          'postgres_passwords',
          'valkey_password',
          'storage_s3_keys',
          'smtp_credentials',
          'grafana_admin_password',
        ],
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
        timestamp: '2026-08-28T12:00:00.000Z',
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
    rec.sections.secrets_management.evidence = [secretRotationFixturePath, passedSbomPath, passedSastPath, passedContainerPath, passedDossierPath];

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
    record.sections.data_retention_policy.evidence = [file];
    fs.writeFileSync(file, JSON.stringify(good));
    assert.strictEqual(validateApprovedRecord(record).categoryBlockers.data_retention_policy, undefined);

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
      const blockers = validateApprovedRecord(record).categoryBlockers.data_retention_policy || [];
      assert.ok(blockers.some((blocker) => blocker.includes('invalid static integrity evidence')), JSON.stringify(blockers));
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('approved secret references require a matching policy child, not prose or a dossier', () => {
  const record = buildValidApprovedRecord();
  assert.strictEqual(validateApprovedRecord(record).categoryBlockers.secret_references, undefined);
  record.sections.secret_references.evidence = ['All secret references verified against Vault policy'];
  assert.match((validateApprovedRecord(record).categoryBlockers.secret_references || []).join(' '), /policy child JSON report is required/);
  record.sections.secret_references.evidence = [secretPolicyFixturePath];
  assert.strictEqual(validateApprovedRecord(record).categoryBlockers.secret_references, undefined);
  assert.equal(isSecretReferencePolicyCandidate({ parsed: {} }), true);
  assert.equal(isSecretReferencePolicyCandidate({ parsed: [] }), false);
});

test('secret-reference policy validation rejects malformed and contradictory reports', () => {
  const approved = buildValidApprovedRecord().sections.secret_references;
  assert.equal(validateSecretReferencePolicyReport(validSecretPolicyReport, fixedNow, approved), true);
  const mutations = [
    (r) => { r.timestamp = '2026-02-30T12:00:00.000Z'; },
    (r) => { r.timestamp = '2027-01-01T00:00:00.000Z'; },
    (r) => { r.status = 'failed'; },
    (r) => { r.errors = ['policy denied']; },
    (r) => { r.policy_reference = ''; },
    (r) => { delete r.references.session_secret_source; },
    (r) => { r.references.gemini_api_key_source = { source: 'env:GEMINI_API_KEY', access_verified: true, plaintext_exposed: false }; },
    (r) => { r.references.session_secret_source.source = 'vault:other/session#secret'; },
    (r) => { r.references.session_secret_source.access_verified = false; },
    (r) => { r.references.session_secret_source.plaintext_exposed = true; },
    (r) => { r.references.session_secret_source.value = 'unexpected'; },
  ];
  for (const mutate of mutations) {
    const report = structuredClone(validSecretPolicyReport);
    mutate(report);
    assert.equal(validateSecretReferencePolicyReport(report, fixedNow, approved), false);
  }
  approved.session_secret_source = 'plainpassword123';
  assert.equal(validateSecretReferencePolicyReport(validSecretPolicyReport, fixedNow, approved), false);
  approved.session_secret_source = 'vault:postgres://alice:password@db.example/acres#secret';
  assert.equal(validateSecretReferencePolicyReport(validSecretPolicyReport, fixedNow, approved), false);
  approved.session_secret_source = approved.csrf_secret_source;
  assert.equal(validateSecretReferencePolicyReport(validSecretPolicyReport, fixedNow, approved), false);
});

test('secret-reference approval rejects custom-path failures and mixed wildcard evidence', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'readiness-policy-'));
  try {
    const good = path.join(dir, 'custom.json');
    const bad = path.join(dir, 'other.json');
    fs.writeFileSync(good, JSON.stringify(validSecretPolicyReport));
    const record = buildValidApprovedRecord();
    record.sections.secret_references.evidence = [good];
    assert.strictEqual(validateApprovedRecord(record).categoryBlockers.secret_references, undefined);
    fs.writeFileSync(bad, JSON.stringify({ overall_status: 'PASSED' }));
    record.sections.secret_references.evidence = [path.join(dir, '*.json')];
    assert.match((validateApprovedRecord(record).categoryBlockers.secret_references || []).join(' '), /invalid or failed/);
    fs.writeFileSync(bad, JSON.stringify({ ...validSecretPolicyReport, status: 'failed' }));
    assert.match((validateApprovedRecord(record).categoryBlockers.secret_references || []).join(' '), /invalid or failed/);
    const uppercase = path.join(dir, 'failed.JSON');
    fs.writeFileSync(uppercase, JSON.stringify({ ...validSecretPolicyReport, status: 'failed' }));
    record.sections.secret_references.evidence = [good, uppercase];
    assert.match((validateApprovedRecord(record).categoryBlockers.secret_references || []).join(' '), /invalid or failed/);
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
    record.sections.data_retention_policy.evidence = [file];
    const good = { overall_status: 'PASSED', staticIntegrityBaseline: { status: 'verified' },
      summary: { staticIntegrity: 'passed', staticIntegrityCompliance: 'passed' } };
    fs.writeFileSync(file, JSON.stringify(good));
    assert.strictEqual(validateApprovedRecord(record).categoryBlockers.data_retention_policy, undefined);
    for (const changed of [
      { ...good, staticIntegrityBaseline: { status: 'breached' } },
      { ...good, summary: { ...good.summary, staticIntegrityCompliance: 'failed' } },
      { ...good, staticIntegrityBaseline: {} },
    ]) {
      fs.writeFileSync(file, JSON.stringify(changed));
      assert.ok(validateApprovedRecord(record).categoryBlockers.data_retention_policy?.length);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('approved volume encryption requires a child report beyond declaration, prose, or dossier', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'readiness-vol-report-'));
  try {
    const record = buildValidApprovedRecord();

    // 1. Prose only
    record.sections.volume_encryption.evidence = ['LUKS2 block device encryption verified'];
    let blockers = validateApprovedRecord(record).categoryBlockers.volume_encryption || [];
    assert.ok(blockers.some((b) => b.includes('A successful volume encryption child JSON report is required')));

    // 2. Dossier only
    const dossierPath = path.join(dir, 'launch-evidence-dossier-only.json');
    fs.writeFileSync(
      dossierPath,
      JSON.stringify({
        overall_status: 'PASSED',
        total_stages: 7,
        passed_stages: 7,
        failed_stages: 0,
        stages: [{ stage_id: 'volume_encryption', status: 'PASSED' }],
        volumeEncryptionBaseline: { status: 'verified', totalRequiredMounts: 9, validMountsCount: 9, keySeparationVerified: true, violationsDetected: 0 },
        summary: { volumeEncryptionCompliance: 'passed' },
      })
    );
    record.sections.volume_encryption.evidence = [dossierPath];
    blockers = validateApprovedRecord(record).categoryBlockers.volume_encryption || [];
    assert.ok(blockers.some((b) => b.includes('A successful volume encryption child JSON report is required')));

    // 3. Arbitrary JSON with plausible name
    const arbitraryPath = path.join(dir, 'volume-encryption-evidence-fake.json');
    fs.writeFileSync(arbitraryPath, JSON.stringify({ message: 'not a volume encryption report' }));
    record.sections.volume_encryption.evidence = [arbitraryPath];
    blockers = validateApprovedRecord(record).categoryBlockers.volume_encryption || [];
    assert.ok(blockers.some((b) => b.includes('A referenced volume encryption report is invalid or failed')));

    // 4. Valid report at custom path passes
    const customPath = path.join(dir, 'custom-mount-audit.json');
    fs.writeFileSync(customPath, JSON.stringify(validVolumeEncryptionReport));
    record.sections.volume_encryption.evidence = [customPath];
    blockers = validateApprovedRecord(record).categoryBlockers.volume_encryption;
    assert.strictEqual(blockers, undefined);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('volume encryption child report validates producer fields, timestamps, mount counts, and key separation', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'readiness-vol-fields-'));
  try {
    const file = path.join(dir, 'volume-encryption-evidence-test.json');
    const record = buildValidApprovedRecord();
    record.sections.volume_encryption.evidence = [file];

    const mutations = [
      (v) => { v.status = 'failed'; },
      (v) => { v.valid = false; },
      (v) => { v.errors = ['Disk error']; },
      (v) => { v.errors = 'not an array'; },
      (v) => { v.keySeparation = null; },
      (v) => { v.keySeparation.verified = false; },
      (v) => { v.keySeparation.detectedViolations = ['/var/lib/postgresql/key.pem']; },
      (v) => { v.keySeparation.detectedViolations = 'not an array'; },
      (v) => { v.evaluatedMounts = []; },
      (v) => { v.evaluatedMounts = [{ service: 'postgres', containerPath: '/var/lib/postgresql', passed: true }]; },
      (v) => { v.evaluatedMounts[0].passed = false; },
      (v) => { v.totalRequiredMounts = 10; v.validMountsCount = 9; },
      (v) => { v.totalRequiredMounts = '10'; v.validMountsCount = '10'; },
      (v) => { v.totalRequiredMounts = null; },
      (v) => { v.timestamp = 'invalid-timestamp'; },
      (v) => { v.timestamp = new Date(fixedNow.getTime() + 60000).toISOString(); },
      (v) => { delete v.timestamp; },
    ];

    for (const mutate of mutations) {
      const copy = structuredClone(validVolumeEncryptionReport);
      mutate(copy);
      fs.writeFileSync(file, JSON.stringify(copy));
      const blockers = validateApprovedRecord(record).categoryBlockers.volume_encryption || [];
      assert.ok(
        blockers.some((b) => b.includes('A referenced volume encryption report is invalid or failed')),
        `Expected invalid report blocker, got: ${JSON.stringify(blockers)}`
      );
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('wildcard volume encryption evidence rejects a failed child alongside a valid child', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'readiness-vol-wildcard-'));
  try {
    const goodPath = path.join(dir, 'volume-encryption-evidence-1.json');
    const badPath = path.join(dir, 'volume-encryption-evidence-2.json');
    fs.writeFileSync(goodPath, JSON.stringify(validVolumeEncryptionReport));
    fs.writeFileSync(badPath, JSON.stringify({ ...validVolumeEncryptionReport, status: 'failed', valid: false }));

    const record = buildValidApprovedRecord();
    record.sections.volume_encryption.evidence = [path.join(dir, 'volume-encryption-evidence-*.json')];
    const blockers = validateApprovedRecord(record).categoryBlockers.volume_encryption || [];
    assert.ok(
      blockers.some((b) => b.includes('A referenced volume encryption report is invalid or failed')),
      `Expected blocker for bad report alongside good report, got: ${JSON.stringify(blockers)}`
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('volume encryption helper functions handle edge cases and missing parameters safely', () => {
  const { isVolumeEncryptionCandidate, validateVolumeEncryptionReport } = require('./check-launch-readiness');
  assert.strictEqual(isVolumeEncryptionCandidate(), false);
  assert.strictEqual(isVolumeEncryptionCandidate({ parsed: null }), false);
  assert.strictEqual(isVolumeEncryptionCandidate({ parsed: { drill_type: 'production_volume_encryption_and_key_separation' } }), true);
  assert.strictEqual(validateVolumeEncryptionReport(null), false);
  assert.strictEqual(validateVolumeEncryptionReport(validVolumeEncryptionReport), true);
});

test('approved secrets_management requires a child report beyond prose, declaration, or dossier', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'readiness-sec-report-'));
  try {
    const record = buildValidApprovedRecord();
    record.sections.secrets_management.evidence = ['Vault agent runtime injection drill completed'];
    const b1 = validateApprovedRecord(record).categoryBlockers.secrets_management || [];
    assert.ok(
      b1.some((b) => b.includes('A successful secret rotation child JSON report is required')),
      `Expected child report requirement blocker, got: ${JSON.stringify(b1)}`
    );

    const fakeDossier = path.join(dir, 'launch-evidence-dossier-sec.json');
    fs.writeFileSync(fakeDossier, JSON.stringify({
      version: '1.0.0',
      overall_status: 'PASSED',
      secretRotationBaseline: { status: 'verified' },
      summary: { secretRotationCompliance: 'passed' },
    }));
    record.sections.secrets_management.evidence = [fakeDossier];
    const b2 = validateApprovedRecord(record).categoryBlockers.secrets_management || [];
    assert.ok(
      b2.some((b) => b.includes('A successful secret rotation child JSON report is required')),
      `Expected child report blocker when only dossier referenced, got: ${JSON.stringify(b2)}`
    );

    const nonCandidate = path.join(dir, 'secret-notes.json');
    fs.writeFileSync(nonCandidate, JSON.stringify({ notes: 'drill run successfully' }));
    record.sections.secrets_management.evidence = [nonCandidate];
    const b3 = validateApprovedRecord(record).categoryBlockers.secrets_management || [];
    assert.ok(
      b3.some((b) => b.includes('A successful secret rotation child JSON report is required')),
      `Expected child report blocker for non-candidate JSON, got: ${JSON.stringify(b3)}`
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('secret rotation child report validates producer fields, timestamps, secret classes, steps, and redaction audit', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'readiness-sec-validate-'));
  try {
    const file = path.join(dir, 'secret-rotation-evidence-drill.json');
    const record = buildValidApprovedRecord();
    record.sections.secrets_management.evidence = [file];

    const mutations = [
      (s) => { s.status = 'failed'; },
      (s) => { s.errors = ['rotation timeout on valkey']; },
      (s) => { s.timestamp = 'invalid-timestamp'; },
      (s) => { s.timestamp = new Date(fixedNow.getTime() + 60000).toISOString(); },
      (s) => { delete s.timestamp; },
      (s) => { s.tested_secret_classes = ['session_secret']; },
      (s) => { delete s.steps.session_rollover; },
      (s) => { s.steps.session_rollover.status = 'failed'; },
      (s) => { delete s.steps.redaction_audit; },
      (s) => { s.steps.redaction_audit.raw_secrets_masked = false; },
      (s) => { s.steps.redaction_audit.zero_dev_passwords_detected = false; },
    ];

    for (const mutate of mutations) {
      const copy = structuredClone(validSecretRotationReport);
      mutate(copy);
      fs.writeFileSync(file, JSON.stringify(copy));
      const blockers = validateApprovedRecord(record).categoryBlockers.secrets_management || [];
      assert.ok(
        blockers.some((b) => b.includes('A referenced secret rotation report is invalid or failed')),
        `Expected invalid report blocker, got: ${JSON.stringify(blockers)}`
      );
    }

    for (const validTs of ['20260828T120000Z', '2026-08-28T12:00:00.000Z', '2026-08-28T12:00:00Z']) {
      const copy = structuredClone(validSecretRotationReport);
      copy.timestamp = validTs;
      fs.writeFileSync(file, JSON.stringify(copy));
      const blockers = validateApprovedRecord(record).categoryBlockers.secrets_management;
      assert.strictEqual(blockers, undefined, `Expected timestamp ${validTs} to pass validation`);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('approved secrets_management rejects rotation cadence exceeding 90 days or non-positive', () => {
  const record = buildValidApprovedRecord();

  const invalidCadences = [91, 100, 365, 0, -1, '90', null, undefined, NaN];
  for (const cadence of invalidCadences) {
    record.sections.secrets_management.rotation_cadence_days = cadence;
    const blockers = validateApprovedRecord(record).categoryBlockers.secrets_management || [];
    assert.ok(
      blockers.some((b) => b.includes('Rotation cadence (in days) must be a positive number <= 90 days')),
      `Expected cadence blocker for cadence=${cadence}, got: ${JSON.stringify(blockers)}`
    );
  }

  record.sections.secrets_management.rotation_cadence_days = 90;
  assert.strictEqual(validateApprovedRecord(record).categoryBlockers.secrets_management, undefined);

  record.sections.secrets_management.rotation_cadence_days = 30;
  assert.strictEqual(validateApprovedRecord(record).categoryBlockers.secrets_management, undefined);
});

test('wildcard secret rotation evidence rejects a failed child alongside a valid child', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'readiness-sec-wildcard-'));
  try {
    const goodPath = path.join(dir, 'secret-rotation-evidence-1.json');
    const badPath = path.join(dir, 'secret-rotation-evidence-2.json');
    fs.writeFileSync(goodPath, JSON.stringify(validSecretRotationReport));
    fs.writeFileSync(badPath, JSON.stringify({ ...validSecretRotationReport, status: 'failed', errors: ['boom'] }));

    const record = buildValidApprovedRecord();
    record.sections.secrets_management.evidence = [path.join(dir, 'secret-rotation-evidence-*.json')];
    const blockers = validateApprovedRecord(record).categoryBlockers.secrets_management || [];
    assert.ok(
      blockers.some((b) => b.includes('A referenced secret rotation report is invalid or failed')),
      `Expected blocker for bad report alongside good report, got: ${JSON.stringify(blockers)}`
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('secret rotation helper functions handle edge cases and missing parameters safely', () => {
  const { isSecretRotationCandidate, validateSecretRotationReport } = require('./check-launch-readiness');
  assert.strictEqual(isSecretRotationCandidate(), false);
  assert.strictEqual(isSecretRotationCandidate({ parsed: null }), false);
  assert.strictEqual(isSecretRotationCandidate({ parsed: { drill_type: 'zero_downtime_secret_rotation_and_compromise_response' } }), true);
  assert.strictEqual(validateSecretRotationReport(null), false);
  assert.strictEqual(validateSecretRotationReport(validSecretRotationReport), true);
});

test('approved deployment_and_rollback requires a child report beyond prose, declaration, or dossier', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'readiness-dep-child-req-'));
  try {
    const record = buildValidApprovedRecord();
    record.sections.deployment_and_rollback.evidence = ['Staging deployment and rollback drill executed successfully'];
    record.sections.deployment_and_rollback.release.live_drill_evidence = 'artifact:live-drill-1';
    const b1 = validateApprovedRecord(record).categoryBlockers.deployment_and_rollback || [];
    assert.ok(
      b1.some((b) => b.includes('A successful deployment drill child JSON report is required')),
      `Expected child report blocker for prose evidence, got: ${JSON.stringify(b1)}`
    );

    const fakeDossier = path.join(dir, 'launch-evidence-dossier-20260828T120000Z.json');
    fs.writeFileSync(fakeDossier, JSON.stringify({
      version: '1.0.0',
      overall_status: 'PASSED',
      deploymentBaseline: { status: 'verified' },
      summary: { deploymentCompliance: 'passed', rollbackCompliance: 'passed' },
    }));
    record.sections.deployment_and_rollback.evidence = [fakeDossier];
    const b2 = validateApprovedRecord(record).categoryBlockers.deployment_and_rollback || [];
    assert.ok(
      b2.some((b) => b.includes('A successful deployment drill child JSON report is required')),
      `Expected child report blocker when only dossier referenced, got: ${JSON.stringify(b2)}`
    );

    const nonCandidate = path.join(dir, 'deployment-notes.json');
    fs.writeFileSync(nonCandidate, JSON.stringify({ notes: 'drill run successfully' }));
    record.sections.deployment_and_rollback.evidence = [nonCandidate];
    const b3 = validateApprovedRecord(record).categoryBlockers.deployment_and_rollback || [];
    assert.ok(
      b3.some((b) => b.includes('A successful deployment drill child JSON report is required')),
      `Expected child report blocker for non-candidate JSON, got: ${JSON.stringify(b3)}`
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('deployment drill child report validates producer fields, timestamps, routes, migrations, and drain periods', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'readiness-dep-validate-'));
  try {
    const file = path.join(dir, 'deployment-drill-evidence-drill.json');
    const record = buildValidApprovedRecord();
    record.sections.deployment_and_rollback.evidence = [file];
    record.sections.deployment_and_rollback.release.live_drill_evidence = file;

    const mutations = [
      (s) => { s.status = 'failed'; },
      (s) => { s.schema_backward_compatible = false; },
      (s) => { s.rollback_procedure_verified = false; },
      (s) => { s.caddy_routing_verified = false; },
      (s) => { s.caddy_routes_tested = 11; },
      (s) => { s.caddy_routes_tested = '12'; },
      (s) => { s.network_isolation_verified = false; },
      (s) => { s.security_headers_verified = false; },
      (s) => { s.s3_sigv4_host_preserved = false; },
      (s) => { s.migrations_verified = false; },
      (s) => { s.migration_count = -1; },
      (s) => { s.migration_count = '5'; },
      (s) => { s.operational_templates_verified = false; },
      (s) => { s.secrets_scan_verified = false; },
      (s) => { s.readiness_probes_verified = false; },
      (s) => { s.graceful_drain_periods_verified.caddy = '10s'; },
      (s) => { s.graceful_drain_periods_verified.worker = '30s'; },
      (s) => { delete s.graceful_drain_periods_verified.api; },
      (s) => { s.drill_timestamp = 'invalid-timestamp'; },
      (s) => { s.drill_timestamp = new Date(fixedNow.getTime() + 60000).toISOString(); },
      (s) => { delete s.drill_timestamp; },
      (s) => { s.duration_ms = -5; },
    ];

    for (const mutate of mutations) {
      const copy = structuredClone(validDeploymentDrillReport);
      mutate(copy);
      fs.writeFileSync(file, JSON.stringify(copy));
      const blockers = validateApprovedRecord(record).categoryBlockers.deployment_and_rollback || [];
      assert.ok(
        blockers.some((b) => b.includes('A referenced deployment drill report is invalid or failed') || b.includes('reports deployment drill failure')),
        `Expected invalid report blocker, got: ${JSON.stringify(blockers)}`
      );
    }

    for (const validTs of ['20260828T120000Z', '2026-08-28T12:00:00.000Z', '2026-08-28T12:00:00Z']) {
      const copy = structuredClone(validDeploymentDrillReport);
      copy.drill_timestamp = validTs;
      fs.writeFileSync(file, JSON.stringify(copy));
      const blockers = validateApprovedRecord(record).categoryBlockers.deployment_and_rollback;
      assert.strictEqual(blockers, undefined, `Expected timestamp ${validTs} to pass validation`);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('wildcard deployment drill evidence rejects a failed child alongside a valid child', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'readiness-dep-wildcard-'));
  try {
    const goodPath = path.join(dir, 'deployment-drill-evidence-1.json');
    const badPath = path.join(dir, 'deployment-drill-evidence-2.json');
    fs.writeFileSync(goodPath, JSON.stringify(validDeploymentDrillReport));
    fs.writeFileSync(badPath, JSON.stringify({ ...validDeploymentDrillReport, status: 'failed', schema_backward_compatible: false }));

    const record = buildValidApprovedRecord();
    record.sections.deployment_and_rollback.evidence = [path.join(dir, 'deployment-drill-evidence-*.json')];
    record.sections.deployment_and_rollback.release.live_drill_evidence = goodPath;
    const blockers = validateApprovedRecord(record).categoryBlockers.deployment_and_rollback || [];
    assert.ok(
      blockers.some((b) => b.includes('A referenced deployment drill report is invalid or failed')),
      `Expected blocker for bad report alongside good report, got: ${JSON.stringify(blockers)}`
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('deployment drill helper functions handle edge cases and missing parameters safely', () => {
  assert.strictEqual(isDeploymentDrillCandidate(), false);
  assert.strictEqual(isDeploymentDrillCandidate({ parsed: null }), false);
  assert.strictEqual(isDeploymentDrillCandidate({ file: 'deployment-drill-evidence-test.json', parsed: {} }), true);
  assert.strictEqual(isDeploymentDrillCandidate({ parsed: { schema_backward_compatible: true, caddy_routing_verified: true, rollback_procedure_verified: true } }), true);
  assert.strictEqual(validateDeploymentDrillReport(null), false);
  assert.strictEqual(validateDeploymentDrillReport(validDeploymentDrillReport), true);
  assert.deepStrictEqual(DEPLOYMENT_DRAIN_PERIODS, {
    caddy: '30s',
    next: '30s',
    api: '45s',
    worker: '60s',
  });
});

test('approved slo_and_alerting requires a child report beyond prose, declaration, or dossier', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'readiness-cap-child-'));
  try {
    const proseRecord = buildValidApprovedRecord();
    proseRecord.sections.slo_and_alerting.evidence = ['All capacity targets confirmed in staging'];
    const b1 = validateApprovedRecord(proseRecord).categoryBlockers.slo_and_alerting || [];
    assert.ok(
      b1.some((b) => b.includes('A successful capacity and alerting drill child JSON report is required')),
      `Expected child report blocker for prose, got: ${JSON.stringify(b1)}`
    );

    const dossierPath = path.join(dir, 'launch-evidence-dossier-test.json');
    fs.writeFileSync(dossierPath, JSON.stringify({
      version: '1.0.0',
      overall_status: 'PASSED',
      stages: [{ stage_id: 'capacity_alerting', status: 'PASSED' }],
      dossier_version: '1.0.0',
    }));
    const dossierRecord = buildValidApprovedRecord();
    dossierRecord.sections.slo_and_alerting.evidence = [dossierPath];
    const b2 = validateApprovedRecord(dossierRecord).categoryBlockers.slo_and_alerting || [];
    assert.ok(
      b2.some((b) => b.includes('A successful capacity and alerting drill child JSON report is required')),
      `Expected child report blocker for dossier alone, got: ${JSON.stringify(b2)}`
    );

    const badNamePath = path.join(dir, 'capacity-alerting-drill-evidence-empty.json');
    fs.writeFileSync(badNamePath, JSON.stringify({ notes: 'not a capacity drill report' }));
    const badNameRecord = buildValidApprovedRecord();
    badNameRecord.sections.slo_and_alerting.evidence = [badNamePath];
    const b3 = validateApprovedRecord(badNameRecord).categoryBlockers.slo_and_alerting || [];
    assert.ok(
      b3.some((b) => b.includes('A referenced capacity and alerting report is invalid or failed')),
      `Expected child report blocker for non-candidate JSON, got: ${JSON.stringify(b3)}`
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('capacity alerting child report validates producer fields, timestamps, alerts, capacity, telemetry, and DoS resilience', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'readiness-cap-validate-'));
  try {
    const file = path.join(dir, 'capacity-alerting-drill-evidence-drill.json');
    const record = buildValidApprovedRecord();
    record.sections.slo_and_alerting.evidence = [file];

    const mutations = [
      (s) => { s.status = 'failed'; },
      (s) => { s.summary.alertVerification = 'failed'; },
      (s) => { s.summary.capacitySloCompliance = 'failed'; },
      (s) => { s.summary.dosResilience = 'failed'; },
      (s) => { s.summary.databaseBaselineCompliance = 'failed'; },
      (s) => { s.alerts.valid = false; },
      (s) => { s.alerts.ruleCount = 10; },
      (s) => { s.alerts.errors = ['rule error']; },
      (s) => { s.alerts.simulations[0].passed = false; },
      (s) => { s.capacity.status = 'failed'; },
      (s) => { s.capacity.compliance.overallPassed = false; },
      (s) => { s.capacity.compliance.availabilityPassed = false; },
      (s) => { s.capacity.compliance.latencyPassed = false; },
      (s) => { s.capacity.compliance.throughputPassed = false; },
      (s) => { s.capacity.compliance.databaseAcquisitionLatencyPassed = false; },
      (s) => { s.capacity.compliance.databaseQueryLatencyPassed = false; },
      (s) => { s.capacity.compliance.monotonicDbAcquisition = false; },
      (s) => { s.capacity.compliance.monotonicDbQuery = false; },
      (s) => { s.databaseTelemetryBaseline.status = 'breached'; },
      (s) => { s.databaseTelemetryBaseline.postgresExporter.up = 0; },
      (s) => { s.databaseTelemetryBaseline.postgresExporter.lastScrapeError = 1; },
      (s) => { s.databaseTelemetryBaseline.postgresServer.pgUp = 0; },
      (s) => { s.databaseTelemetryBaseline.connectionPool.api.requestsWaiting = 1; },
      (s) => { s.databaseTelemetryBaseline.connectionPool.worker.requestsWaiting = 1; },
      (s) => { s.databaseTelemetryBaseline.poolAcquisitionLatency.api.p95Ms = 60; },
      (s) => { s.databaseTelemetryBaseline.queryExecutionDuration.api.p95Ms = 120; },
      (s) => { s.databaseTelemetryBaseline.serverActivity.lockWaits = 1; },
      (s) => { s.dosResilience.status = 'failed'; },
      (s) => { s.failures = ['simulated failure']; },
      (s) => { s.timestamp = 'invalid-timestamp'; },
      (s) => { s.timestamp = new Date(fixedNow.getTime() + 60000).toISOString(); },
      (s) => { delete s.timestamp; },
      (s) => { s.durationMs = -5; },
    ];

    for (const mutate of mutations) {
      const copy = structuredClone(validCapacityAlertingReport);
      mutate(copy);
      fs.writeFileSync(file, JSON.stringify(copy));
      const blockers = validateApprovedRecord(record).categoryBlockers.slo_and_alerting || [];
      assert.ok(
        blockers.some((b) => b.includes('A referenced capacity and alerting report is invalid or failed') || b.includes('reports capacity and alerting drill failure')),
        `Expected invalid report blocker, got: ${JSON.stringify(blockers)}`
      );
    }

    for (const validTs of ['20260828T120000Z', '2026-08-28T12:00:00.000Z', '2026-08-28T12:00:00Z']) {
      const copy = structuredClone(validCapacityAlertingReport);
      copy.timestamp = validTs;
      fs.writeFileSync(file, JSON.stringify(copy));
      const blockers = validateApprovedRecord(record).categoryBlockers.slo_and_alerting;
      assert.strictEqual(blockers, undefined, `Expected timestamp ${validTs} to pass validation`);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('wildcard capacity alerting evidence rejects a failed child alongside a valid child', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'readiness-cap-wildcard-'));
  try {
    const goodPath = path.join(dir, 'capacity-alerting-drill-evidence-1.json');
    const badPath = path.join(dir, 'capacity-alerting-drill-evidence-2.json');
    fs.writeFileSync(goodPath, JSON.stringify(validCapacityAlertingReport));
    fs.writeFileSync(badPath, JSON.stringify({ ...validCapacityAlertingReport, status: 'failed' }));

    const record = buildValidApprovedRecord();
    record.sections.slo_and_alerting.evidence = [path.join(dir, 'capacity-alerting-drill-evidence-*.json')];
    const blockers = validateApprovedRecord(record).categoryBlockers.slo_and_alerting || [];
    assert.ok(
      blockers.some((b) => b.includes('A referenced capacity and alerting report is invalid or failed')),
      `Expected blocker for bad report alongside good report, got: ${JSON.stringify(blockers)}`
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('capacity alerting helper functions handle edge cases and missing parameters safely', () => {
  assert.strictEqual(isCapacityAlertingCandidate(), false);
  assert.strictEqual(isCapacityAlertingCandidate({ parsed: null }), false);
  assert.strictEqual(isCapacityAlertingCandidate({ file: 'capacity-alerting-drill-evidence-test.json' }), false);
  assert.strictEqual(isCapacityAlertingCandidate({ file: 'capacity-alerting-drill-evidence-test.json', parsed: null }), false);
  assert.strictEqual(isCapacityAlertingCandidate({ file: 'capacity-alerting-drill-evidence-test.json', parsed: [1, 2, 3] }), false);
  assert.strictEqual(isCapacityAlertingCandidate({ file: 'capacity-alerting-drill-evidence-test.json', parsed: { stages: [] } }), false);
  assert.strictEqual(isCapacityAlertingCandidate({ file: 'capacity-alerting-drill-evidence-test.json', parsed: { dossier_version: '1.0' } }), false);
  assert.strictEqual(isCapacityAlertingCandidate({ file: 'capacity-alerting-drill-evidence-test.json', parsed: {} }), true);
  assert.strictEqual(isCapacityAlertingCandidate({ parsed: { drill_type: 'capacity_and_prometheus_alerting_drill' } }), true);
  assert.strictEqual(isCapacityAlertingCandidate({ file: 'launch-evidence-dossier.json', parsed: { stages: [] } }), false);
  assert.strictEqual(validateCapacityAlertingReport(null), false);
  assert.strictEqual(validateCapacityAlertingReport(validCapacityAlertingReport), true);
  assert.strictEqual(validateCapacityAlertingReport({ ...validCapacityAlertingReport, capacity: { ...validCapacityAlertingReport.capacity, sloTargets: ['invalid'] } }), false);
  assert.strictEqual(parseCapacityAlertingTimestamp('invalid-date'), null);
  assert.ok(parseCapacityAlertingTimestamp('20260828T120000Z') instanceof Date);
});

test('approved production_domain_tls requires a child report beyond prose, declaration, or dossier', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'readiness-caddy-isolation-'));
  try {
    const record = buildValidApprovedRecord();
    record.sections.production_domain_tls.evidence = ['DNS A record points to host', 'Caddyfile HSTS verified'];
    const blockers = validateApprovedRecord(record).categoryBlockers.production_domain_tls || [];
    assert.ok(
      blockers.includes('A successful Caddy routing and TLS verification child JSON report is required'),
      `Expected child report blocker, got: ${JSON.stringify(blockers)}`
    );

    // Unified dossier alone does not qualify
    const dossierPath = path.join(dir, 'launch-evidence-dossier-test.json');
    fs.writeFileSync(
      dossierPath,
      JSON.stringify({
        dossier_version: '1.0.0',
        timestamp: '2026-08-28T12:00:00.000Z',
        summary: { overallStatus: 'PASSED' },
        stages: [],
      })
    );
    record.sections.production_domain_tls.evidence = [dossierPath];
    const dossierBlockers = validateApprovedRecord(record).categoryBlockers.production_domain_tls || [];
    assert.ok(
      dossierBlockers.includes('A successful Caddy routing and TLS verification child JSON report is required'),
      `Expected child report blocker when only dossier is provided, got: ${JSON.stringify(dossierBlockers)}`
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('caddy routing child report validates producer fields, timestamps, routes, and security invariants', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'readiness-caddy-fields-'));
  try {
    const file = path.join(dir, 'caddy-routing-evidence-test.json');
    const record = buildValidApprovedRecord();
    record.sections.production_domain_tls.evidence = [file];

    const mutations = [
      (s) => { s.drill_type = 'unrelated_drill'; },
      (s) => { s.domain = '{$ACRES_PRODUCTION_DOMAIN}'; },
      (s) => { s.domain = 'other.example.com'; },
      (s) => { s.targetPath = 'infra/caddy/Caddyfile.example'; },
      (s) => { s.status = 'failed'; },
      (s) => { s.valid = false; },
      (s) => { s.errors = ['Caddy syntax error']; },
      (s) => { s.hstsApproved = false; },
      (s) => { s.securityHeadersVerified = false; },
      (s) => { s.s3SigV4HostPreserved = false; },
      (s) => { s.proxyHeadersVerified = false; },
      (s) => { s.routesEvaluated = 11; },
      (s) => { s.routesPassed = 11; },
      (s) => { s.routesPassed = 10; },
      (s) => { s.evaluatedRoutes = [{ requestPath: '/test', passed: false }]; },
      (s) => { s.evaluatedRoutes = s.evaluatedRoutes.slice(1); },
      (s) => { s.evaluatedRoutes[0].passed = false; },
      (s) => { s.timestamp = '2099-01-01T00:00:00.000Z'; },
      (s) => { s.timestamp = 'invalid-date'; },
      (s) => { delete s.timestamp; },
    ];

    for (const mutate of mutations) {
      const copy = structuredClone(validCaddyRoutingReport);
      mutate(copy);
      fs.writeFileSync(file, JSON.stringify(copy));
      const blockers = validateApprovedRecord(record).categoryBlockers.production_domain_tls || [];
      assert.ok(
        blockers.some((b) => b.includes('A referenced Caddy routing report is invalid or failed') || b.includes('reports Caddy routing verification failure')),
        `Expected invalid report blocker, got: ${JSON.stringify(blockers)}`
      );
    }

    for (const validTs of ['20260828T120000Z', '2026-08-28T12:00:00.000Z', '2026-08-28T12:00:00Z']) {
      const copy = structuredClone(validCaddyRoutingReport);
      copy.timestamp = validTs;
      fs.writeFileSync(file, JSON.stringify(copy));
      const blockers = validateApprovedRecord(record).categoryBlockers.production_domain_tls;
      assert.strictEqual(blockers, undefined, `Expected timestamp ${validTs} to pass validation`);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('approved production_domain_tls rejects malformed or invalid domains (IP, localhost, URI, protocol, bad FQDN)', () => {
  const invalidDomains = [
    'localhost',
    'http://localhost',
    '127.0.0.1',
    '192.168.1.100',
    'https://acres.example.com',
    'http://acres.example.com',
    'acres.example.com:443',
    'acres.example.com/app',
    'acres.example.com?query=1',
    'acres',
    '.example.com',
    'acres.example.c',
    'acres example.com',
    '',
    null,
  ];

  for (const domain of invalidDomains) {
    const record = buildValidApprovedRecord();
    record.sections.production_domain_tls.domain = domain;
    const blockers = validateApprovedRecord(record).categoryBlockers.production_domain_tls || [];
    assert.ok(
      blockers.some((b) => b.includes('Production domain must be a valid fully qualified domain name')),
      `Expected domain blocker for "${domain}", got: ${JSON.stringify(blockers)}`
    );
  }
});

test('approved production_domain_tls rejects invalid or placeholder TLS contact email', () => {
  const invalidEmails = [
    '__REQUIRED_OPERATOR_TLS_EMAIL__',
    'not-an-email',
    'ops@',
    '@example.com',
    'ops@example',
    'ops example.com',
    'ops..lead@example.com',
    '.ops@example.com',
    'ops.@example.com',
    'ops@example..com',
    'ops@-example.com',
    'ops@example-.com',
    '',
    null,
  ];

  for (const email of invalidEmails) {
    const record = buildValidApprovedRecord();
    record.sections.production_domain_tls.tls_contact_email = email;
    const blockers = validateApprovedRecord(record).categoryBlockers.production_domain_tls || [];
    assert.ok(
      blockers.some((b) => b.includes('TLS contact email is missing or invalid')),
      `Expected email blocker for "${email}", got: ${JSON.stringify(blockers)}`
    );
  }
});

test('approved production_domain_tls rejects non-boolean custom_certificates', () => {
  for (const val of [null, undefined, 'false', 'true', 0, 1]) {
    const record = buildValidApprovedRecord();
    record.sections.production_domain_tls.custom_certificates = val;
    const blockers = validateApprovedRecord(record).categoryBlockers.production_domain_tls || [];
    assert.ok(
      blockers.some((b) => b.includes('custom_certificates')),
      `Expected custom_certificates blocker for ${val}, got: ${JSON.stringify(blockers)}`
    );
  }
});

test('wildcard caddy routing evidence rejects a failed child alongside a valid child', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'readiness-caddy-wildcard-'));
  try {
    const goodPath = path.join(dir, 'caddy-routing-evidence-1.json');
    const badPath = path.join(dir, 'caddy-routing-evidence-2.json');
    fs.writeFileSync(goodPath, JSON.stringify(validCaddyRoutingReport));
    fs.writeFileSync(badPath, JSON.stringify({ ...validCaddyRoutingReport, status: 'failed' }));

    const record = buildValidApprovedRecord();
    record.sections.production_domain_tls.evidence = [path.join(dir, 'caddy-routing-evidence-*.json')];
    const blockers = validateApprovedRecord(record).categoryBlockers.production_domain_tls || [];
    assert.ok(
      blockers.some((b) => b.includes('A referenced Caddy routing report is invalid or failed')),
      `Expected blocker for bad report alongside good report, got: ${JSON.stringify(blockers)}`
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('caddy routing helper functions handle edge cases and missing parameters safely', () => {
  assert.strictEqual(isCaddyRoutingCandidate(), false);
  assert.strictEqual(isCaddyRoutingCandidate({ parsed: null }), false);
  assert.strictEqual(isCaddyRoutingCandidate({ file: 'caddy-routing-evidence-test.json' }), false);
  assert.strictEqual(isCaddyRoutingCandidate({ file: 'caddy-routing-evidence-test.json', parsed: null }), false);
  assert.strictEqual(isCaddyRoutingCandidate({ file: 'caddy-routing-evidence-test.json', parsed: [1, 2, 3] }), false);
  assert.strictEqual(isCaddyRoutingCandidate({ file: 'caddy-routing-evidence-test.json', parsed: { stages: [] } }), false);
  assert.strictEqual(isCaddyRoutingCandidate({ file: 'caddy-routing-evidence-test.json', parsed: { dossier_version: '1.0' } }), false);
  assert.strictEqual(isCaddyRoutingCandidate({ file: 'caddy-routing-evidence-test.json', parsed: {} }), true);
  assert.strictEqual(isCaddyRoutingCandidate({ parsed: { drill_type: 'caddy_routing_and_tls_verification' } }), true);
  assert.strictEqual(isCaddyRoutingCandidate({ file: 'launch-evidence-dossier.json', parsed: { stages: [] } }), false);
  assert.strictEqual(validateCaddyRoutingReport(null), false);
  assert.strictEqual(validateCaddyRoutingReport(validCaddyRoutingReport), true);
  assert.strictEqual(validateCaddyRoutingReport({ ...validCaddyRoutingReport, evaluatedRoutes: [{ passed: false }] }), false);
  assert.strictEqual(parseCaddyRoutingTimestamp('invalid-date'), null);
  assert.ok(parseCaddyRoutingTimestamp('20260828T120000Z') instanceof Date);
});

test('approved SMTP delivery requires matching delivered receipt and DNS child evidence', () => {
  const record = buildValidApprovedRecord();
  assert.deepStrictEqual(validateReadiness(record, null, { now: fixedNow }).categoryBlockers.smtp_delivery, undefined);
  record.sections.smtp_delivery.evidence = ['Test delivery succeeded', 'SPF and DKIM verified'];
  assert.match(validateReadiness(record, null, { now: fixedNow }).categoryBlockers.smtp_delivery.join(' '), /child JSON report is required/);
  record.sections.smtp_delivery.evidence = [smtpFixturePath];
  record.sections.smtp_delivery.credentials_source_reference = 'vault:other/smtp#password';
  assert.match(validateReadiness(record, null, { now: fixedNow }).categoryBlockers.smtp_delivery.join(' '), /must match/);
  record.sections.smtp_delivery.credentials_source_reference = 'plainpassword123';
  record.sections.secret_references.smtp_secret_source = 'plainpassword123';
  assert.match(validateReadiness(record, null, { now: fixedNow }).categoryBlockers.smtp_delivery.join(' '), /must match the approved secret reference/);
});

test('SMTP delivery report validation fails closed on invalid status, identity, timestamps, delivery, and DNS', () => {
  const approved = buildValidApprovedRecord().sections.smtp_delivery;
  assert.strictEqual(validateSmtpDeliveryReport(validSmtpReport, fixedNow, approved), true);
  assert.strictEqual(validateSmtpDeliveryReport({
    ...validSmtpReport,
    delivery: { ...validSmtpReport.delivery, timestamp: '2026-08-28T11:59:00.000Z' },
  }, fixedNow, approved), true);
  const mutations = [
    { status: 'failed' }, { provider: 'other' }, { host: 'other.example.com' },
    { port: 587.5 }, { tls_mode: 'NONE' }, { from_address: 'invalid' },
    { timestamp: '2026-09-26T12:00:00.000Z' }, { timestamp: '2026-02-30T12:00:00.000Z' },
    { timestamp: '20260828T120000Z' },
    { delivery: { ...validSmtpReport.delivery, status: 'accepted' } },
    { delivery: { ...validSmtpReport.delivery, receipt_id: '' } },
    { delivery: { ...validSmtpReport.delivery, timestamp: '2026-09-26T12:00:00.000Z' } },
    { dns: { ...validSmtpReport.dns, dkim: { passed: false, record: 'dns-printout-dkim' } } },
    { dns: { ...validSmtpReport.dns, spf: { passed: true, record: '' } } },
    { dns: { ...validSmtpReport.dns, checked_at: 'not-a-date' } },
    { errors: ['delivery rejected'] },
  ];
  for (const mutation of mutations) {
    assert.strictEqual(validateSmtpDeliveryReport({ ...validSmtpReport, ...mutation }, fixedNow, approved), false,
      `Expected rejection for ${JSON.stringify(mutation)}`);
  }
  assert.strictEqual(validateSmtpDeliveryReport(validSmtpReport, fixedNow, { ...approved, host: null }), false);
  assert.strictEqual(validateSmtpDeliveryReport(validSmtpReport, fixedNow, { ...approved, from_address: null }), false);
});

test('SMTP evidence accepts custom path and rejects failed child in wildcard', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'readiness-smtp-wildcard-'));
  try {
    const good = path.join(dir, 'report-a.json');
    const bad = path.join(dir, 'report-b.json');
    fs.writeFileSync(good, JSON.stringify(validSmtpReport));
    const record = buildValidApprovedRecord();
    record.sections.smtp_delivery.evidence = [good];
    assert.strictEqual(validateReadiness(record, null, { now: fixedNow }).categoryBlockers.smtp_delivery, undefined);
    fs.writeFileSync(bad, JSON.stringify({ ...validSmtpReport, delivery: { ...validSmtpReport.delivery, status: 'bounced' } }));
    record.sections.smtp_delivery.evidence = [path.join(dir, 'report-*.json')];
    assert.match(validateReadiness(record, null, { now: fixedNow }).categoryBlockers.smtp_delivery.join(' '), /invalid or failed/);
    fs.writeFileSync(bad, JSON.stringify({ delivery: validSmtpReport.delivery, status: 'success' }));
    assert.match(validateReadiness(record, null, { now: fixedNow }).categoryBlockers.smtp_delivery.join(' '), /invalid or failed/);
    fs.writeFileSync(bad, JSON.stringify({ ...validSmtpReport, stages: [], dossier_version: '1.0', status: 'failed' }));
    assert.match(validateReadiness(record, null, { now: fixedNow }).categoryBlockers.smtp_delivery.join(' '), /invalid or failed/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('SMTP evidence candidate includes dossiers and handles missing input', () => {
  assert.strictEqual(isSmtpDeliveryCandidate(), false);
  assert.strictEqual(isSmtpDeliveryCandidate({ parsed: [] }), false);
  assert.strictEqual(isSmtpDeliveryCandidate({ file: 'smtp-delivery-evidence-a.json', parsed: { stages: [] } }), true);
  assert.strictEqual(isSmtpDeliveryCandidate({ file: 'custom.json', parsed: validSmtpReport }), true);
  assert.strictEqual(isSmtpDeliveryCandidate({ file: 'custom.json', parsed: { delivery: {} } }), true);
  assert.strictEqual(validateSmtpDeliveryReport(null), false);
});
