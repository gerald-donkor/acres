const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const {
  validateReadiness,
  checkPlaceholdersAndSecrets,
  REQUIRED_SECTIONS,
  REQUIRED_SECRET_KEYS,
} = require('./check-launch-readiness');

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
        backup_schedule_cron: '0 2 * * *',
        restore_drill_completed: true,
        restore_drill_date: '2026-08-28T12:00:00Z',
        db_object_reconciliation_tested: true,
        approver: 'sre-lead',
        evidence: ['Automated restore drill executed with PostgreSQL and Garage data'],
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

test('validateReadiness passes for a fully approved record with no-AI assertions', () => {
  const record = buildValidApprovedRecord();
  const result = validateReadiness(record, 'test.json');

  assert.strictEqual(Object.keys(result.categoryBlockers).length, 0);
  assert.strictEqual(result.totalApproved, REQUIRED_SECTIONS.length);
  assert.strictEqual(result.totalSections, REQUIRED_SECTIONS.length);
});

test('validateReadiness rejects ai_enabled: true with the launch-exclusion fatal blocker', () => {
  const record = buildValidApprovedRecord();
  record.sections.optional_ai_posture.ai_enabled = true;

  const result = validateReadiness(record, 'test.json');
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

  const result = validateReadiness(record, 'test.json');
  const aiBlockers = result.categoryBlockers.optional_ai_posture || [];

  assert.ok(
    aiBlockers.some((msg) => msg.includes('Deterministic no-AI product journeys must be verified')),
    `Expected no-AI path verification blocker, got: ${JSON.stringify(aiBlockers)}`
  );
});

test('validateReadiness fails closed when server_ai_draft_enabled_false is not asserted', () => {
  const record = buildValidApprovedRecord();
  record.sections.optional_ai_posture.server_ai_draft_enabled_false = false;

  const result = validateReadiness(record, 'test.json');
  const aiBlockers = result.categoryBlockers.optional_ai_posture || [];

  assert.ok(
    aiBlockers.some((msg) => msg.includes('Server configuration must explicitly assert AI_DRAFT_ENABLED=false')),
    `Expected AI_DRAFT_ENABLED=false assertion blocker, got: ${JSON.stringify(aiBlockers)}`
  );
});

test('validateReadiness fails closed when no_gemini_api_key_provisioned is not asserted', () => {
  const record = buildValidApprovedRecord();
  record.sections.optional_ai_posture.no_gemini_api_key_provisioned = false;

  const result = validateReadiness(record, 'test.json');
  const aiBlockers = result.categoryBlockers.optional_ai_posture || [];

  assert.ok(
    aiBlockers.some((msg) => msg.includes('Absence of GEMINI_API_KEY in production API/worker runtime secrets must be confirmed')),
    `Expected absence of GEMINI_API_KEY blocker, got: ${JSON.stringify(aiBlockers)}`
  );
});

test('validateReadiness fails closed when unpaid_provider_excluded is not asserted', () => {
  const record = buildValidApprovedRecord();
  record.sections.optional_ai_posture.unpaid_provider_excluded = false;

  const result = validateReadiness(record, 'test.json');
  const aiBlockers = result.categoryBlockers.optional_ai_posture || [];

  assert.ok(
    aiBlockers.some((msg) => msg.includes('Exclusion of unpaid Gemini Developer API provider from production launch must be confirmed')),
    `Expected unpaid provider exclusion blocker, got: ${JSON.stringify(aiBlockers)}`
  );
});

test('validateReadiness fails closed when phase11_status is missing or empty', () => {
  const record = buildValidApprovedRecord();
  record.sections.optional_ai_posture.phase11_status = '';

  const result = validateReadiness(record, 'test.json');
  const aiBlockers = result.categoryBlockers.optional_ai_posture || [];

  assert.ok(
    aiBlockers.some((msg) => msg.includes("Field 'phase11_status' is required")),
    `Expected phase11_status blocker, got: ${JSON.stringify(aiBlockers)}`
  );
});

test('validateReadiness fails closed when ai_enabled is non-boolean or null', () => {
  const record = buildValidApprovedRecord();
  record.sections.optional_ai_posture.ai_enabled = null;

  const result = validateReadiness(record, 'test.json');
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

  const result = validateReadiness(record, 'test.json');
  const aiBlockers = result.categoryBlockers.optional_ai_posture || [];

  assert.ok(
    aiBlockers.some((msg) => msg.includes('declares an AI/Gemini secret source when AI is excluded from launch')),
    `Expected secret_references contradiction blocker, got: ${JSON.stringify(aiBlockers)}`
  );
});

test('validateReadiness rejects Gemini key in optional_ai_posture as a contradiction', () => {
  const record = buildValidApprovedRecord();
  record.sections.optional_ai_posture.gemini_api_key = 'vault:acres/prod#gemini';

  const result = validateReadiness(record, 'test.json');
  const aiBlockers = result.categoryBlockers.optional_ai_posture || [];

  assert.ok(
    aiBlockers.some((msg) => msg.includes('optional_ai_posture must not contain a Gemini API key or key reference')),
    `Expected optional_ai_posture contradiction blocker, got: ${JSON.stringify(aiBlockers)}`
  );
});

test('the checked-in template readiness.example.json fails closed with unresolved blockers', () => {
  const templatePath = path.resolve(__dirname, '../../infra/launch/readiness.example.json');
  const raw = fs.readFileSync(templatePath, 'utf8');
  const templateRecord = JSON.parse(raw);

  const result = validateReadiness(templateRecord, templatePath);
  const categories = Object.keys(result.categoryBlockers);

  assert.ok(categories.length > 0, 'Expected checked-in template to have unresolved blockers');
  assert.strictEqual(result.totalApproved, 0, 'Expected 0 approved categories in checked-in template');

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
