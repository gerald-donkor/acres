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
const { validateImageReference } = require('./check-release-images');

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
  'db_monitor_secret_source',
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
      blockers.push(`Field '${currentPath}' contains unresolved placeholder`);
    }
    if (/NEXT_PUBLIC_.*(SECRET|PASSWORD|TOKEN|KEY)/i.test(obj)) {
      blockers.push(`Field '${currentPath}' contains client-exposed secret pattern`);
    }
    if (
      /AIza[0-9A-Za-z-_]{30,}/.test(obj) ||
      /sk-[a-zA-Z0-9]{20,}/.test(obj) ||
      /ghp_[a-zA-Z0-9]{20,}/.test(obj) ||
      /BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY/.test(obj)
    ) {
      blockers.push(`Field '${currentPath}' appears to contain a literal secret value; secret values must never be stored in readiness records`);
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

function isEvidenceFileReference(ev) {
  if (typeof ev !== 'string') return false;
  const trimmed = ev.trim();
  return trimmed.endsWith('.json') || (trimmed.includes('*') && trimmed.includes('.json'));
}

function expandEvidenceGlob(ref, baseDirs) {
  const matches = [];
  for (const baseDir of baseDirs) {
    if (!ref.includes('*')) {
      const abs = path.resolve(baseDir, ref);
      let isFile = false;
      try {
        isFile = fs.existsSync(abs) && fs.statSync(abs).isFile();
      } catch {
        isFile = false;
      }
      if (isFile && !matches.includes(abs)) matches.push(abs);
      continue;
    }
    const abs = path.resolve(baseDir, ref);
    const dir = path.dirname(abs);
    const base = path.basename(abs);
    // Only single-`*` basenames are supported; anything else cannot match.
    if (base.split('*').length !== 2) continue;
    const [prefix, suffix] = base.split('*');
    let names = [];
    try {
      if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) continue;
      names = fs.readdirSync(dir);
    } catch {
      continue;
    }
    for (const f of names) {
      if (f.startsWith(prefix) && f.endsWith(suffix)) {
        const full = path.join(dir, f);
        if (!matches.includes(full)) matches.push(full);
      }
    }
  }
  return matches;
}

function checkEvidenceFile(ref, category, addBlocker, baseDirs) {
  const matches = expandEvidenceGlob(ref, baseDirs);
  if (matches.length === 0) {
    addBlocker(category, `Approved evidence references file '${ref}' but no matching file exists on disk`);
    return;
  }
  for (const file of matches) {
    let parsed;
    try {
      parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (err) {
      addBlocker(category, `Approved evidence file '${ref}' is not valid JSON (${err.message})`);
      continue;
    }
    const status = typeof parsed.status === 'string' ? parsed.status.toLowerCase() : null;
    const overall = typeof parsed.overall_status === 'string' ? parsed.overall_status.toLowerCase() : null;
    if (status === 'failed' || status === 'failure' || status === 'error') {
      addBlocker(category, `Approved evidence file '${ref}' reports drill failure (status: "${parsed.status}")`);
    }
    if (overall === 'failed') {
      addBlocker(category, `Approved evidence file '${ref}' reports drill failure (overall_status: "${parsed.overall_status}")`);
    }
    if (parsed.success === false) {
      addBlocker(category, `Approved evidence file '${ref}' reports drill failure (success: false)`);
    }
    if (
      parsed.summary &&
      typeof parsed.summary === 'object' &&
      typeof parsed.summary.exitCode === 'number' &&
      parsed.summary.exitCode !== 0
    ) {
      addBlocker(category, `Approved evidence file '${ref}' reports drill failure (summary.exitCode: ${parsed.summary.exitCode})`);
    }
    if (typeof parsed.failed_stages === 'number' && parsed.failed_stages > 0) {
      addBlocker(category, `Approved evidence file '${ref}' reports ${parsed.failed_stages} failed drill stage(s)`);
    }
    if (Array.isArray(parsed.stages)) {
      for (const stage of parsed.stages) {
        if (stage && typeof stage === 'object' && typeof stage.status === 'string' && stage.status.toUpperCase() === 'FAILED') {
          addBlocker(category, `Approved evidence file '${ref}' reports stage '${stage.stage_id}' failed: ${stage.error_message || 'unspecified error'}`);
        }
      }
    }
    const sloCompliance = typeof parsed.summary?.sloCompliance === 'string'
      ? parsed.summary.sloCompliance.toLowerCase()
      : null;
    if (sloCompliance === 'capacity_alerts_failed' || sloCompliance === 'failed') {
      addBlocker(category, `Approved evidence file '${ref}' reports SLO compliance failure (summary.sloCompliance: "${parsed.summary.sloCompliance}")`);
    }
    const recoveryCompliance = typeof parsed.summary?.recoveryCompliance === 'string'
      ? parsed.summary.recoveryCompliance.toLowerCase()
      : null;
    if (recoveryCompliance === 'restore_reconcile_failed' || recoveryCompliance === 'failed') {
      addBlocker(category, `Approved evidence file '${ref}' reports recovery compliance failure (summary.recoveryCompliance: "${parsed.summary.recoveryCompliance}")`);
    }
    const summaryStageFlags = [
      'staticIntegrity',
      'supplyChainSecurity',
      'ingressDeployment',
      'volumeEncryption',
      'secretRotation',
      'capacityAlerting',
      'disasterRecovery',
      'alertVerification',
      'dosResilience',
    ];
    for (const flag of summaryStageFlags) {
      const val = typeof parsed.summary?.[flag] === 'string' ? parsed.summary[flag].toLowerCase() : null;
      if (val === 'failed' || val === 'failure') {
        addBlocker(category, `Approved evidence file '${ref}' reports stage summary failure (summary.${flag}: "${parsed.summary[flag]}")`);
      }
    }
    const dbCompliance = typeof parsed.summary?.databaseBaselineCompliance === 'string'
      ? parsed.summary.databaseBaselineCompliance.toLowerCase()
      : null;
    if (dbCompliance === 'failed' || dbCompliance === 'failure') {
      addBlocker(category, `Approved evidence file '${ref}' reports database baseline failure (summary.databaseBaselineCompliance: "${parsed.summary.databaseBaselineCompliance}")`);
    }
    const dbStatus = typeof parsed.databaseTelemetryBaseline?.status === 'string'
      ? parsed.databaseTelemetryBaseline.status.toLowerCase()
      : null;
    if (dbStatus === 'breached' || dbStatus === 'failed') {
      addBlocker(category, `Approved evidence file '${ref}' reports database baseline breach (databaseTelemetryBaseline.status: "${parsed.databaseTelemetryBaseline.status}")`);
    }

    // Restore drill child evidence checks
    if (
      file.includes('restore-drill-evidence-') ||
      typeof parsed.rto_target_seconds === 'number' ||
      typeof parsed.tables_source === 'number' ||
      typeof parsed.rto_compliant === 'boolean'
    ) {
      if (parsed.rto_compliant === false) {
        addBlocker(category, `Approved evidence file '${ref}' reports RTO breach (rto_compliant: false)`);
      }
      if (parsed.record_parity_verified === false) {
        addBlocker(category, `Approved evidence file '${ref}' reports record parity verification failure (record_parity_verified: false)`);
      }
      if (parsed.postgis_verified === false) {
        addBlocker(category, `Approved evidence file '${ref}' reports PostGIS extension verification failure (postgis_verified: false)`);
      }
      if (parsed.foreign_keys_verified === false) {
        addBlocker(category, `Approved evidence file '${ref}' reports foreign key constraint verification failure (foreign_keys_verified: false)`);
      }
      if (
        typeof parsed.tables_source === 'number' &&
        typeof parsed.tables_restored === 'number' &&
        parsed.tables_source !== parsed.tables_restored
      ) {
        addBlocker(category, `Approved evidence file '${ref}' reports table count discrepancy (source: ${parsed.tables_source}, restored: ${parsed.tables_restored})`);
      }
      if (
        typeof parsed.migrations_source === 'number' &&
        typeof parsed.migrations_restored === 'number' &&
        parsed.migrations_source !== parsed.migrations_restored
      ) {
        addBlocker(category, `Approved evidence file '${ref}' reports migration count discrepancy (source: ${parsed.migrations_source}, restored: ${parsed.migrations_restored})`);
      }
    }

    // Storage reconciliation child report checks
    if (
      file.includes('reconcile-report-') ||
      file.includes('reconciliation-report') ||
      (parsed.summary && typeof parsed.summary === 'object' && typeof parsed.summary.totalDatabaseObjects === 'number')
    ) {
      if (parsed.summary && typeof parsed.summary === 'object') {
        const rStatus = typeof parsed.summary.status === 'string' ? parsed.summary.status.toLowerCase() : null;
        if (rStatus === 'error' || rStatus === 'failed') {
          addBlocker(category, `Approved evidence file '${ref}' reports storage reconciliation failure (summary.status: "${parsed.summary.status}")`);
        }
        if (typeof parsed.summary.missingObjects === 'number' && parsed.summary.missingObjects > 0) {
          addBlocker(category, `Approved evidence file '${ref}' reports missing storage object(s) (${parsed.summary.missingObjects} missing)`);
        }
        if (typeof parsed.summary.mismatchedObjects === 'number' && parsed.summary.mismatchedObjects > 0) {
          addBlocker(category, `Approved evidence file '${ref}' reports storage object checksum or size mismatch(es) (${parsed.summary.mismatchedObjects} mismatched)`);
        }
      }
    }

    // Unified Launch Evidence Dossier disaster recovery baseline checks
    const drStatus = typeof parsed.disasterRecoveryBaseline?.status === 'string'
      ? parsed.disasterRecoveryBaseline.status.toLowerCase()
      : null;
    if (drStatus === 'breached' || drStatus === 'failed') {
      addBlocker(category, `Approved evidence file '${ref}' reports disaster recovery baseline breach (disasterRecoveryBaseline.status: "${parsed.disasterRecoveryBaseline.status}")`);
    }
    const restoreCompliance = typeof parsed.summary?.restoreCompliance === 'string'
      ? parsed.summary.restoreCompliance.toLowerCase()
      : null;
    if (restoreCompliance === 'failed' || restoreCompliance === 'failure') {
      addBlocker(category, `Approved evidence file '${ref}' reports restore drill compliance failure (summary.restoreCompliance: "${parsed.summary.restoreCompliance}")`);
    }
    const reconcileCompliance = typeof parsed.summary?.reconcileCompliance === 'string'
      ? parsed.summary.reconcileCompliance.toLowerCase()
      : null;
    if (reconcileCompliance === 'failed' || reconcileCompliance === 'failure') {
      addBlocker(category, `Approved evidence file '${ref}' reports storage reconciliation compliance failure (summary.reconcileCompliance: "${parsed.summary.reconcileCompliance}")`);
    }
  }
}

function validateReadiness(record, _filePath, options = {}) {
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
      // Cross-validation: approved sections referencing evidence JSON files on
      // disk must point at files that exist, parse as JSON, and do not report
      // drill failure. Relative paths resolve against the current working
      // directory first (the documented `backups/…` form) and then against
      // the readiness file's own directory, so records kept next to the
      // template (e.g. infra/launch/operator.json) still validate.
      if (status === 'approved') {
        const baseDirs = [process.cwd()];
        if (typeof _filePath === 'string' && _filePath.length > 0) {
          const fileDir = path.dirname(path.resolve(process.cwd(), _filePath));
          if (!baseDirs.includes(fileDir)) baseDirs.push(fileDir);
        }
        evidence.forEach((ev) => {
          if (isEvidenceFileReference(ev)) {
            checkEvidenceFile(ev.trim(), sectionName, addBlocker, baseDirs);
          }
        });
      }
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
    for (const key of Object.keys(secRefs)) {
      if (
        key.toLowerCase().includes('gemini') ||
        key.toLowerCase().includes('ai_draft') ||
        key.toLowerCase().includes('ai_key')
      ) {
        addBlocker(
          'optional_ai_posture',
          `Contradiction: field 'sections.secret_references.${key}' declares an AI/Gemini secret source when AI is excluded from launch`
        );
      }
    }
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
    if (
      typeof sloSec.availability_target_percent !== 'number' ||
      !Number.isFinite(sloSec.availability_target_percent) ||
      sloSec.availability_target_percent < 99.9 ||
      sloSec.availability_target_percent > 100.0
    ) {
      addBlocker('slo_and_alerting', `Availability target percent must be between 99.9 and 100.0 (received: ${sloSec.availability_target_percent})`);
    }
    if (
      typeof sloSec.max_p95_latency_ms !== 'number' ||
      !Number.isFinite(sloSec.max_p95_latency_ms) ||
      sloSec.max_p95_latency_ms <= 0 ||
      sloSec.max_p95_latency_ms > 500
    ) {
      addBlocker('slo_and_alerting', `Max p95 latency ceiling must be a positive number <= 500ms (received: ${sloSec.max_p95_latency_ms})`);
    }
    if (
      typeof sloSec.capacity_target_rps !== 'number' ||
      !Number.isFinite(sloSec.capacity_target_rps) ||
      sloSec.capacity_target_rps < 100
    ) {
      addBlocker('slo_and_alerting', `Capacity target RPS must be a positive number >= 100 RPS (received: ${sloSec.capacity_target_rps})`);
    }
    if (
      typeof sloSec.max_database_acquisition_p95_latency_ms !== 'number' ||
      !Number.isFinite(sloSec.max_database_acquisition_p95_latency_ms) ||
      sloSec.max_database_acquisition_p95_latency_ms <= 0 ||
      sloSec.max_database_acquisition_p95_latency_ms > 50
    ) {
      addBlocker(
        'slo_and_alerting',
        `Max database pool acquisition p95 latency ceiling must be a positive number <= 50ms (received: ${sloSec.max_database_acquisition_p95_latency_ms})`
      );
    }
    if (
      typeof sloSec.max_database_query_p95_latency_ms !== 'number' ||
      !Number.isFinite(sloSec.max_database_query_p95_latency_ms) ||
      sloSec.max_database_query_p95_latency_ms <= 0 ||
      sloSec.max_database_query_p95_latency_ms > 100
    ) {
      addBlocker(
        'slo_and_alerting',
        `Max database query execution p95 latency ceiling must be a positive number <= 100ms (received: ${sloSec.max_database_query_p95_latency_ms})`
      );
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
    if (
      typeof bdrSec.rpo_hours !== 'number' ||
      !Number.isFinite(bdrSec.rpo_hours) ||
      bdrSec.rpo_hours <= 0 ||
      bdrSec.rpo_hours > 1
    ) {
      addBlocker('backup_and_disaster_recovery', `RPO hours must be a positive number <= 1 hour (received: ${bdrSec.rpo_hours})`);
    }
    if (
      typeof bdrSec.rto_hours !== 'number' ||
      !Number.isFinite(bdrSec.rto_hours) ||
      bdrSec.rto_hours <= 0 ||
      bdrSec.rto_hours > 4
    ) {
      addBlocker('backup_and_disaster_recovery', `RTO hours must be a positive number <= 4 hours (received: ${bdrSec.rto_hours})`);
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
    const category = 'deployment_and_rollback';
    const release = depSec.release;
    if (!release || typeof release !== 'object' || Array.isArray(release)) {
      addBlocker(category, 'Release record is required');
    } else {
      if (typeof release.reviewed_source_commit !== 'string' || !/^[a-fA-F0-9]{40}$/.test(release.reviewed_source_commit)) {
        addBlocker(category, 'release.reviewed_source_commit must be exactly 40 ASCII hex characters');
      }
      const images = {};
      for (const pair of ['current', 'previous']) {
        images[pair] = {};
        for (const role of ['client_image', 'server_image']) {
          const value = release[pair]?.[role];
          try {
            validateImageReference(value, `release.${pair}.${role}`);
            images[pair][role] = value;
          } catch {
            addBlocker(category, `release.${pair}.${role} must be a valid immutable image reference`);
          }
        }
        if (images[pair].client_image && images[pair].client_image === images[pair].server_image) {
          addBlocker(category, `release.${pair} must use distinct client and server images`);
        }
      }
      if (images.current.client_image && images.current.server_image &&
          images.current.client_image === images.previous.client_image &&
          images.current.server_image === images.previous.server_image) {
        addBlocker(category, 'release.current and release.previous must differ');
      }
      const prefix = depSec.image_registry_path;
      const validPrefix = typeof prefix === 'string' && !prefix.includes('@') &&
        !prefix.endsWith('/') && (() => {
          try {
            validateImageReference(`${prefix}/probe@sha256:${'a'.repeat(64)}`, 'image_registry_path');
            return true;
          } catch { return false; }
        })();
      if (!validPrefix) {
        addBlocker(category, 'image_registry_path must be a registry host or repository prefix');
      } else {
        for (const role of ['client_image', 'server_image']) {
          if (images.current[role] && !images.current[role].startsWith(`${prefix}/`)) {
            addBlocker(category, `release.current.${role} is outside image_registry_path`);
          }
        }
      }
      const refs = [];
      const baseDirs = [process.cwd()];
      if (typeof _filePath === 'string' && _filePath.length > 0) {
        const fileDir = path.dirname(path.resolve(process.cwd(), _filePath));
        if (!baseDirs.includes(fileDir)) baseDirs.push(fileDir);
      }
      for (const field of ['client_provenance_evidence', 'server_provenance_evidence', 'live_drill_evidence']) {
        const ref = release[field];
        const external = typeof ref === 'string' && /^[a-z][a-z0-9+.-]*:[^\s]+$/i.test(ref);
        if (typeof ref !== 'string' || !ref.trim() || ref !== ref.trim() ||
            ref.includes('__REQUIRED_') || ref.includes('*') ||
            (!ref.endsWith('.json') && !external)) {
          addBlocker(category, `release.${field} must be a local JSON path or stable external identifier`);
          continue;
        }
        refs.push(ref);
        if (!external) checkEvidenceFile(ref, category, addBlocker, baseDirs);
      }
      if (new Set(refs).size !== refs.length) {
        addBlocker(category, 'Release evidence references must be distinct');
      }
      for (const [role, envName] of [['client_image', 'ACRES_CLIENT_IMAGE'], ['server_image', 'ACRES_SERVER_IMAGE']]) {
        if (typeof options.env?.[envName] !== 'string' || !options.env[envName]) {
          addBlocker(category, `${envName} is required for approved deployment`);
        } else if (options.env[envName] !== release.current?.[role]) {
          addBlocker(category, `${envName} does not match release.current.${role}`);
        }
      }
    }
  }

  // 3.11 optional_ai_posture - FAIL-CLOSED on AI enablement
  const aiSec = sections.optional_ai_posture;
  if (aiSec) {
    if (aiSec.ai_enabled === true) {
      addBlocker(
        'optional_ai_posture',
        'FATAL: Optional AI is marked enabled (ai_enabled: true), but the Phase 11A unpaid Gemini Developer API preview is excluded from production launch'
      );
    }
    if (typeof aiSec.ai_enabled !== 'boolean') {
      addBlocker(
        'optional_ai_posture',
        "Field 'ai_enabled' is required and must be a boolean (false)"
      );
    }
    if (aiSec.gemini_api_key || aiSec.gemini_key || aiSec.api_key) {
      addBlocker(
        'optional_ai_posture',
        'Contradiction: optional_ai_posture must not contain a Gemini API key or key reference'
      );
    }
    if (aiSec.status === 'approved') {
      if (aiSec.ai_enabled !== false) {
        addBlocker(
          'optional_ai_posture',
          'Launch approval requires ai_enabled: false because the unpaid Gemini Developer API preview is excluded from production launch'
        );
      }
      if (aiSec.no_ai_path_verified !== true) {
        addBlocker(
          'optional_ai_posture',
          'Deterministic no-AI product journeys must be verified (no_ai_path_verified: true)'
        );
      }
      if (aiSec.server_ai_draft_enabled_false !== true) {
        addBlocker(
          'optional_ai_posture',
          'Server configuration must explicitly assert AI_DRAFT_ENABLED=false (server_ai_draft_enabled_false: true)'
        );
      }
      if (aiSec.no_gemini_api_key_provisioned !== true) {
        addBlocker(
          'optional_ai_posture',
          'Absence of GEMINI_API_KEY in production API/worker runtime secrets must be confirmed (no_gemini_api_key_provisioned: true)'
        );
      }
      if (aiSec.unpaid_provider_excluded !== true) {
        addBlocker(
          'optional_ai_posture',
          'Exclusion of unpaid Gemini Developer API provider from production launch must be confirmed (unpaid_provider_excluded: true)'
        );
      }
      if (typeof aiSec.phase11_status !== 'string' || !aiSec.phase11_status.trim()) {
        addBlocker(
          'optional_ai_posture',
          "Field 'phase11_status' is required and must be a non-empty string"
        );
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
  const args = process.argv.slice(2);
  if (args.length > 1 || args.some((arg) => arg.startsWith('--'))) {
    console.error('Usage: check-launch-readiness.js [readiness.json]');
    process.exit(1);
  }
  const targetPath = args[0]
    ? path.resolve(process.cwd(), args[0])
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

  const { categoryBlockers, totalApproved, totalSections } = validateReadiness(record, targetPath, { env: process.env });

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

if (require.main === module) {
  main();
}

module.exports = {
  validateReadiness,
  checkPlaceholdersAndSecrets,
  REQUIRED_SECTIONS,
  REQUIRED_SECRET_KEYS,
  DEV_PASSWORDS,
};
