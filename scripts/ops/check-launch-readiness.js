#!/usr/bin/env node

/**
 * scripts/ops/check-launch-readiness.js
 *
 * Deterministic, fail-closed validator for Acres production launch readiness records.
 * Validates that all operator-owned production decisions, secret sources, SLOs,
 * backup/restore drills, volume encryption, and no-AI postures are explicitly approved
 * with auditable evidence, without containing raw secrets or unresolved placeholders.
 */

const fs = require('fs');
const path = require('path');

const REQUIRED_SECTIONS = [
  'production_domain_tls',
  'smtp_delivery',
  'secrets_management',
  'secret_references',
  'slo_and_alerting',
  'backup_and_disaster_recovery',
  'data_retention_policy',
  'volume_encryption',
  'graphql_introspection',
  'deployment_and_rollback',
  'optional_ai_posture',
];

const REQUIRED_SECRET_KEYS = [
  'session_secret_source',
  'csrf_secret_source',
  'db_migrator_secret_source',
  'db_app_secret_source',
  'valkey_secret_source',
  'garage_rpc_secret_source',
  'garage_admin_secret_source',
  'garage_metrics_secret_source',
  'garage_s3_secret_source',
  'smtp_secret_source',
  'grafana_admin_secret_source',
];

const DEV_PASSWORDS = [
  'acres_superuser_dev_password',
  'acres_migrator_dev_password',
  'acres_app_dev_password',
  'acres_test_dev_password',
  'acres_valkey_dev_password',
];

function checkPlaceholdersAndSecrets(obj, currentPath, blockers) {
  if (obj === null || obj === undefined) return;

  if (typeof obj === 'string') {
    if (obj.includes('__REQUIRED_') || obj.includes('<REQUIRED_') || obj.includes('change-me')) {
      blockers.push(`Field '${currentPath}' contains unresolved placeholder: "${obj}"`);
    }
    if (/NEXT_PUBLIC_.*(SECRET|PASSWORD|TOKEN|KEY)/i.test(obj)) {
      blockers.push(`Field '${currentPath}' contains client-exposed secret pattern: "${obj}"`);
    }
    for (const devPass of DEV_PASSWORDS) {
      if (obj.includes(devPass)) {
        blockers.push(`Field '${currentPath}' references local dev password: "${devPass}"`);
      }
    }
  } else if (Array.isArray(obj)) {
    obj.forEach((item, index) => {
      checkPlaceholdersAndSecrets(item, `${currentPath}[${index}]`, blockers);
    });
  } else if (typeof obj === 'object') {
    for (const [key, val] of Object.entries(obj)) {
      checkPlaceholdersAndSecrets(val, currentPath ? `${currentPath}.${key}` : key, blockers);
    }
  }
}

function validateReadiness(record, filePath) {
  const categoryBlockers = {};
  let totalApproved = 0;

  function addBlocker(category, message) {
    if (!categoryBlockers[category]) {
      categoryBlockers[category] = [];
    }
    categoryBlockers[category].push(message);
  }

  if (!record || typeof record !== 'object') {
    addBlocker('root', 'Invalid readiness document: root must be an object');
    return { categoryBlockers, totalApproved: 0, totalSections: REQUIRED_SECTIONS.length };
  }

  const sections = record.sections;
  if (!sections || typeof sections !== 'object') {
    addBlocker('root', "Missing required top-level 'sections' object");
    return { categoryBlockers, totalApproved: 0, totalSections: REQUIRED_SECTIONS.length };
  }

  // 1. Generic placeholder & dev secret scan across entire document
  const rawScanBlockers = [];
  checkPlaceholdersAndSecrets(record, '', rawScanBlockers);
  for (const b of rawScanBlockers) {
    const sectionMatch = b.match(/Field 'sections\.([a-z_]+)/);
    const category = sectionMatch ? sectionMatch[1] : 'general';
    addBlocker(category, b);
  }

  // 2. Validate each required section
  for (const sectionName of REQUIRED_SECTIONS) {
    const sec = sections[sectionName];
    if (!sec || typeof sec !== 'object') {
      addBlocker(sectionName, `Missing required section '${sectionName}'`);
      continue;
    }

    const status = sec.status;
    if (status !== 'approved') {
      addBlocker(
        sectionName,
        `Section status is '${status || 'missing'}'; must be 'approved' with verified evidence for launch readiness`
      );
    } else {
      totalApproved += 1;
    }

    const evidence = sec.evidence;
    if (!Array.isArray(evidence) || evidence.length === 0) {
      addBlocker(sectionName, 'Evidence array is empty or missing; launch approval requires auditable evidence items');
    } else {
      evidence.forEach((ev, idx) => {
        if (typeof ev !== 'string' || ev.trim() === '') {
          addBlocker(sectionName, `Evidence item [${idx}] is empty or not a valid string`);
        }
      });
    }
  }

  // 3. Category-specific validations

  // 3.1 production_domain_tls
  const domainSec = sections.production_domain_tls;
  if (domainSec && domainSec.status === 'approved') {
    if (!domainSec.domain || typeof domainSec.domain !== 'string' || domainSec.domain.includes('localhost') || domainSec.domain.includes('127.0.0.1')) {
      addBlocker('production_domain_tls', `Production domain is invalid or localhost: "${domainSec.domain}"`);
    }
    if (!domainSec.tls_contact_email || typeof domainSec.tls_contact_email !== 'string' || !domainSec.tls_contact_email.includes('@')) {
      addBlocker('production_domain_tls', `TLS contact email is missing or invalid: "${domainSec.tls_contact_email}"`);
    }
    if (domainSec.hsts_approved !== true) {
      addBlocker('production_domain_tls', 'HSTS approval must be explicitly confirmed (hsts_approved: true)');
    }
  }

  // 3.2 smtp_delivery
  const smtpSec = sections.smtp_delivery;
  if (smtpSec && smtpSec.status === 'approved') {
    if (!smtpSec.provider || typeof smtpSec.provider !== 'string') {
      addBlocker('smtp_delivery', 'SMTP provider is required');
    }
    if (!smtpSec.host || typeof smtpSec.host !== 'string') {
      addBlocker('smtp_delivery', 'SMTP host is required');
    }
    if (!smtpSec.port || typeof smtpSec.port !== 'number' || smtpSec.port <= 0 || smtpSec.port > 65535) {
      addBlocker('smtp_delivery', `SMTP port must be a valid port number (received: ${smtpSec.port})`);
    }
    if (!smtpSec.from_address || typeof smtpSec.from_address !== 'string' || !smtpSec.from_address.includes('@')) {
      addBlocker('smtp_delivery', `SMTP from_address is invalid: "${smtpSec.from_address}"`);
    }
    if (!smtpSec.credentials_source_reference || typeof smtpSec.credentials_source_reference !== 'string') {
      addBlocker('smtp_delivery', 'SMTP credentials source reference is required');
    }
    if (!smtpSec.delivery_policy || typeof smtpSec.delivery_policy !== 'string') {
      addBlocker('smtp_delivery', 'SMTP delivery policy description is required');
    }
    if (!smtpSec.bounce_abuse_handling || typeof smtpSec.bounce_abuse_handling !== 'string') {
      addBlocker('smtp_delivery', 'SMTP bounce/abuse handling procedure reference is required');
    }
  }

  // 3.3 secrets_management
  const secMgmt = sections.secrets_management;
  if (secMgmt && secMgmt.status === 'approved') {
    if (!secMgmt.injection_mechanism || typeof secMgmt.injection_mechanism !== 'string') {
      addBlocker('secrets_management', 'Secret injection mechanism is required');
    }
    if (!secMgmt.masking_policy || typeof secMgmt.masking_policy !== 'string') {
      addBlocker('secrets_management', 'Secret masking policy is required');
    }
    if (!secMgmt.rotation_cadence_days || typeof secMgmt.rotation_cadence_days !== 'number' || secMgmt.rotation_cadence_days <= 0) {
      addBlocker('secrets_management', 'Rotation cadence (in days) must be a positive number');
    }
    if (!secMgmt.compromise_response_plan || typeof secMgmt.compromise_response_plan !== 'string') {
      addBlocker('secrets_management', 'Compromise response runbook reference is required');
    }
  }

  // 3.4 secret_references
  const secRefs = sections.secret_references;
  if (secRefs) {
    for (const key of REQUIRED_SECRET_KEYS) {
      const val = secRefs[key];
      if (!val || typeof val !== 'string') {
        addBlocker('secret_references', `Missing secret source reference for '${key}'`);
      } else if (secRefs.status === 'approved') {
        // Must be a reference (e.g. vault:path#key, aws-sm:name, env:VAR, file:path)
        // Must NOT look like a raw secret (e.g., raw password string, base64 blob, postgres/redis/valkey URL with plaintext password)
        if (/^[a-zA-Z0-9+.-]+:\/\/[^:]+:[^@]+@/i.test(val)) {
          addBlocker('secret_references', `Field '${key}' contains raw connection string with credentials instead of a secret reference`);
        }
      }
    }
  }

  // 3.5 slo_and_alerting
  const sloSec = sections.slo_and_alerting;
  if (sloSec && sloSec.status === 'approved') {
    if (typeof sloSec.availability_target_percent !== 'number' || sloSec.availability_target_percent < 99.0 || sloSec.availability_target_percent > 100.0) {
      addBlocker('slo_and_alerting', `Availability target percent must be between 99.0 and 100.0 (received: ${sloSec.availability_target_percent})`);
    }
    if (typeof sloSec.max_p95_latency_ms !== 'number' || sloSec.max_p95_latency_ms <= 0) {
      addBlocker('slo_and_alerting', `Max p95 latency must be a positive number (received: ${sloSec.max_p95_latency_ms})`);
    }
    if (typeof sloSec.capacity_target_rps !== 'number' || sloSec.capacity_target_rps <= 0) {
      addBlocker('slo_and_alerting', `Capacity target RPS must be a positive number (received: ${sloSec.capacity_target_rps})`);
    }
    if (!Array.isArray(sloSec.alert_recipients) || sloSec.alert_recipients.length === 0) {
      addBlocker('slo_and_alerting', 'Alert recipients list must contain at least one contact/destination');
    }
    if (sloSec.alert_thresholds_defined !== true) {
      addBlocker('slo_and_alerting', 'Alert thresholds must be explicitly defined and confirmed (alert_thresholds_defined: true)');
    }
    if (!sloSec.escalation_runbook_ref || typeof sloSec.escalation_runbook_ref !== 'string') {
      addBlocker('slo_and_alerting', 'Escalation runbook reference is required');
    }
  }

  // 3.6 backup_and_disaster_recovery
  const bdrSec = sections.backup_and_disaster_recovery;
  if (bdrSec && bdrSec.status === 'approved') {
    if (typeof bdrSec.rpo_hours !== 'number' || bdrSec.rpo_hours <= 0) {
      addBlocker('backup_and_disaster_recovery', `RPO hours must be a positive number (received: ${bdrSec.rpo_hours})`);
    }
    if (typeof bdrSec.rto_hours !== 'number' || bdrSec.rto_hours <= 0) {
      addBlocker('backup_and_disaster_recovery', `RTO hours must be a positive number (received: ${bdrSec.rto_hours})`);
    }
    if (!bdrSec.backup_destination || typeof bdrSec.backup_destination !== 'string') {
      addBlocker('backup_and_disaster_recovery', 'Off-host backup destination is required');
    }
    if (!bdrSec.backup_schedule_cron || typeof bdrSec.backup_schedule_cron !== 'string') {
      addBlocker('backup_and_disaster_recovery', 'Backup schedule cron expression is required');
    }
    if (bdrSec.restore_drill_completed !== true) {
      addBlocker('backup_and_disaster_recovery', 'Restore drill must be verified and completed (restore_drill_completed: true)');
    }
    if (!bdrSec.restore_drill_date || typeof bdrSec.restore_drill_date !== 'string') {
      addBlocker('backup_and_disaster_recovery', 'Restore drill date is required for approved recovery posture');
    }
    if (bdrSec.db_object_reconciliation_tested !== true) {
      addBlocker('backup_and_disaster_recovery', 'PostgreSQL and Garage object storage reconciliation drill must be verified (db_object_reconciliation_tested: true)');
    }
  }

  // 3.7 data_retention_policy
  const retSec = sections.data_retention_policy;
  if (retSec && retSec.status === 'approved') {
    const requiredPolicies = [
      'account_retention_policy',
      'audit_retention_policy',
      'upload_quarantine_retention_policy',
      'rejected_object_retention_policy',
      'export_retention_policy',
      'report_retention_policy',
      'telemetry_retention_policy',
      'backup_retention_policy',
    ];
    for (const p of requiredPolicies) {
      if (!retSec[p] || typeof retSec[p] !== 'string') {
        addBlocker('data_retention_policy', `Retention policy definition for '${p}' is required`);
      }
    }
  }

  // 3.8 volume_encryption
  const encSec = sections.volume_encryption;
  if (encSec && encSec.status === 'approved') {
    if (!encSec.encryption_mechanism || typeof encSec.encryption_mechanism !== 'string') {
      addBlocker('volume_encryption', 'Production volume encryption mechanism is required');
    }
    if (!Array.isArray(encSec.encrypted_mount_paths) || encSec.encrypted_mount_paths.length < 3) {
      addBlocker('volume_encryption', 'Encrypted mount paths must include at least 3 stateful mounts (PostgreSQL, Valkey, Garage)');
    }
    if (encSec.key_separation_confirmed !== true) {
      addBlocker('volume_encryption', 'Key separation from data/backups must be explicitly confirmed (key_separation_confirmed: true)');
    }
    if (!encSec.key_recovery_owner || typeof encSec.key_recovery_owner !== 'string') {
      addBlocker('volume_encryption', 'Key recovery owner must be designated');
    }
  }

  // 3.9 graphql_introspection
  const gqlSec = sections.graphql_introspection;
  if (gqlSec && gqlSec.status === 'approved') {
    if (typeof gqlSec.production_introspection_enabled !== 'boolean') {
      addBlocker('graphql_introspection', 'production_introspection_enabled must be a boolean');
    }
    if (gqlSec.production_introspection_enabled === true && (!gqlSec.justification || typeof gqlSec.justification !== 'string')) {
      addBlocker('graphql_introspection', 'Production GraphQL introspection enabled requires justification');
    }
  }

  // 3.10 deployment_and_rollback
  const depSec = sections.deployment_and_rollback;
  if (depSec && depSec.status === 'approved') {
    if (!depSec.target_host_profile || typeof depSec.target_host_profile !== 'string') {
      addBlocker('deployment_and_rollback', 'Target host profile / spec is required');
    }
    if (!depSec.image_registry_path || typeof depSec.image_registry_path !== 'string') {
      addBlocker('deployment_and_rollback', 'OCI image registry path is required');
    }
    if (!depSec.deployment_approver || typeof depSec.deployment_approver !== 'string') {
      addBlocker('deployment_and_rollback', 'Deployment approver is required');
    }
    if (!depSec.rollback_authority || typeof depSec.rollback_authority !== 'string') {
      addBlocker('deployment_and_rollback', 'Rollback authority is required');
    }
    if (!depSec.image_provenance_policy || typeof depSec.image_provenance_policy !== 'string') {
      addBlocker('deployment_and_rollback', 'Image provenance policy is required');
    }
    if (depSec.live_readiness_drill_completed !== true) {
      addBlocker('deployment_and_rollback', 'Live deployment & Caddy routing drill must be completed (live_readiness_drill_completed: true)');
    }
  }

  // 3.11 optional_ai_posture - FAIL-CLOSED on AI enablement
  const aiSec = sections.optional_ai_posture;
  if (aiSec) {
    if (aiSec.ai_enabled === true) {
      addBlocker('optional_ai_posture', 'FATAL: Optional AI is marked enabled, but Phase 11 is blocked and not approved/implemented');
    }
    if (aiSec.status === 'approved') {
      if (aiSec.ai_enabled !== false) {
        addBlocker('optional_ai_posture', 'AI posture approval requires ai_enabled: false until Phase 11 is approved');
      }
      if (aiSec.no_ai_path_verified !== true) {
        addBlocker('optional_ai_posture', 'Deterministic no-AI product path must be verified (no_ai_path_verified: true)');
      }
    }
  }

  return {
    categoryBlockers,
    totalApproved,
    totalSections: REQUIRED_SECTIONS.length,
  };
}

function main() {
  const targetPath = process.argv[2]
    ? path.resolve(process.cwd(), process.argv[2])
    : path.resolve(process.cwd(), 'infra/launch/readiness.example.json');

  const relativePath = path.relative(process.cwd(), targetPath);

  console.log('================================================================================');
  console.log('ACRES LAUNCH READINESS EVALUATION');
  console.log(`Target: ${relativePath}`);
  console.log('================================================================================\n');

  if (!fs.existsSync(targetPath)) {
    console.error(`ERROR: Readiness record file not found at: ${targetPath}\n`);
    process.exit(1);
  }

  let record;
  try {
    const raw = fs.readFileSync(targetPath, 'utf8');
    record = JSON.parse(raw);
  } catch (err) {
    console.error(`ERROR: Failed to parse readiness JSON file (${targetPath}): ${err.message}\n`);
    process.exit(1);
  }

  const { categoryBlockers, totalApproved, totalSections } = validateReadiness(record, targetPath);

  const categoriesWithBlockers = Object.keys(categoryBlockers);
  let totalBlockersCount = 0;

  if (categoriesWithBlockers.length > 0) {
    console.log('Unresolved Launch Blockers by Category:\n');
    for (const cat of categoriesWithBlockers) {
      const blockers = categoryBlockers[cat];
      totalBlockersCount += blockers.length;
      console.log(`[${cat.toUpperCase()}]`);
      for (const b of blockers) {
        console.log(`  - ${b}`);
      }
      console.log('');
    }
  }

  const unapprovedCount = totalSections - totalApproved;

  console.log('--------------------------------------------------------------------------------');
  console.log('SUMMARY:');
  console.log(`  Total Required Categories: ${totalSections}`);
  console.log(`  Approved Categories:       ${totalApproved}`);
  console.log(`  Unresolved / Blocked:      ${unapprovedCount}`);
  console.log(`  Total Blockers Detected:   ${totalBlockersCount}`);
  console.log('================================================================================');

  if (totalBlockersCount > 0 || unapprovedCount > 0) {
    console.log('\nResult: FAIL-CLOSED. Launch readiness check failed: unresolved blockers remain.');
    console.log('This repository intentionally fails closed until real operator decisions and live drills are recorded.\n');
    process.exit(1);
  }

  console.log('\nResult: PASSED. All launch criteria approved with verified evidence.\n');
  process.exit(0);
}

main();
