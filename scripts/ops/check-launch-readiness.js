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
const { REQUIRED_STATEFUL_MOUNTS, isApprovedMechanism } = require('./verify-volume-encryption');
const { validateImageReference } = require('./check-release-images');
const { validateStaticEvidence } = require('./run-static-integrity-checks');

const { REQUIRED_ALERTS } = require('./verify-alert-rules');
const { DEFAULT_SLO_TARGETS, evaluateSloCompliance } = require('./verify-capacity-load');
const { validDatabaseTelemetry, validDosEvidence } = require('./launch-target-evidence');

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

const REQUIRED_RETENTION_KEYS = [
  'account_retention_policy',
  'audit_retention_policy',
  'upload_quarantine_retention_policy',
  'rejected_object_retention_policy',
  'export_retention_policy',
  'report_retention_policy',
  'telemetry_retention_policy',
  'backup_retention_policy',
];

const DEV_PASSWORDS = [
  'acres_superuser_dev_password',
  'acres_migrator_dev_password',
  'acres_app_dev_password',
  'acres_test_dev_password',
  'acres_valkey_dev_password',
];

// Only minute schedules that repeat every UTC hour have unambiguous gaps here.
function parseBackupScheduleCron(expression) {
  if (typeof expression !== 'string' || expression.length > 512 ||
      /[^\x20-\x7e\x09-\x0d]/.test(expression)) {
    return { valid: false, reason: 'unsupported schedule' };
  }
  const fields = expression.replace(/^[\x20\x09-\x0d]+|[\x20\x09-\x0d]+$/g, '')
    .split(/[\x20\x09-\x0d]+/);
  if (fields.length !== 5 || fields.slice(1).some((field) => field !== '*')) {
    return { valid: false, reason: 'unsupported schedule' };
  }
  const minute = fields[0];
  let minutes;
  if (minute === '*') {
    minutes = Array.from({ length: 60 }, (_, value) => value);
  } else if (/^\*\/[0-9]+$/.test(minute)) {
    const step = Number(minute.slice(2));
    if (!Number.isSafeInteger(step) || step < 1 || step > 60) {
      return { valid: false, reason: 'unsupported schedule' };
    }
    minutes = Array.from({ length: 60 }, (_, value) => value).filter((value) => value % step === 0);
  } else if (/^[0-9]+(?:,[0-9]+)*$/.test(minute)) {
    minutes = minute.split(',').map(Number);
    if (minutes.some((value) => !Number.isSafeInteger(value) || value > 59) ||
        new Set(minutes).size !== minutes.length) {
      return { valid: false, reason: 'unsupported schedule' };
    }
    minutes.sort((a, b) => a - b);
  } else {
    return { valid: false, reason: 'unsupported schedule' };
  }
  const gaps = minutes.slice(1).map((value, index) => value - minutes[index]);
  gaps.push(60 + minutes[0] - minutes.at(-1));
  return { valid: true, maxGapMinutes: Math.max(...gaps) };
}

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
  return trimmed.toLowerCase().endsWith('.json') ||
    (trimmed.includes('*') && trimmed.toLowerCase().includes('.json'));
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

function parseUtcDate(value, basicTimestamp = false) {
  const match = basicTimestamp
    ? /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(value)
    : /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}):(\d{2})Z)?$/.exec(value);
  if (!match) return null;
  const [, year, month, day, hour = '00', minute = '00', second = '00'] = match;
  const date = new Date(0);
  date.setUTCFullYear(Number(year), Number(month) - 1, Number(day));
  date.setUTCHours(Number(hour), Number(minute), Number(second), 0);
  if (date.getUTCFullYear() !== Number(year) || date.getUTCMonth() + 1 !== Number(month) ||
      date.getUTCDate() !== Number(day) || date.getUTCHours() !== Number(hour) ||
      date.getUTCMinutes() !== Number(minute) || date.getUTCSeconds() !== Number(second)) return null;
  return date;
}

function parseRestoreTimestamp(value) {
  if (typeof value !== 'string') return null;
  const basic = parseUtcDate(value, true);
  if (basic) return basic;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/.test(value)) {
    const d = new Date(value);
    if (Number.isFinite(d.getTime())) {
      const iso = d.toISOString();
      if (iso === value || iso.replace(/\.000Z$/, 'Z') === value) return d;
    }
  }
  return null;
}

function validRecoveryReference(value) {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value !== value.trim() ||
    /[\x00-\x1f\x7f-\x9f]/.test(value)
  )
    return false;
  const blockers = [];
  checkPlaceholdersAndSecrets(value, 'recovery_reference', blockers);
  return blockers.length === 0;
}

function isRestoreCandidate({ file, parsed } = {}) {
  if (
    parsed &&
    (Object.hasOwn(parsed, 'stages') ||
      parsed.dossier_version !== undefined ||
      parsed.disasterRecoveryBaseline !== undefined)
  )
    return false;
  const name = typeof file === 'string' ? path.basename(file) : '';
  if (name.includes('restore-drill-evidence') || name.startsWith('restore-drill-evidence-')) return true;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return false;
  return (
    parsed.drill_type === 'disaster_recovery_restore' ||
    ['drill_timestamp', 'source_db', 'drill_db', 'backup_file', 'backup_bytes',
      'duration_ms', 'duration_seconds', 'rto_target_seconds', 'rto_compliant',
      'tables_source', 'tables_restored', 'migrations_source', 'migrations_restored',
      'record_parity_verified', 'postgis_verified', 'foreign_keys_verified'].some((key) => key in parsed)
  );
}

function validateRestoreReport(report, now, context = {}) {
  if (!report || typeof report !== 'object' || Array.isArray(report)) return null;
  const mode = report.execution_mode;
  if (mode !== 'simulation' && mode !== 'live') return null;
  const requireLive = Boolean(context.requireLive);
  if (requireLive && mode !== 'live') return null;

  if (typeof report.drill_timestamp !== 'string') return null;
  const timestamp = parseRestoreTimestamp(report.drill_timestamp);
  const evalNow = now instanceof Date ? now : new Date();
  if (!timestamp || timestamp.getTime() > evalNow.getTime()) return null;

  if (report.status !== 'success' ||
      report.rto_compliant !== true ||
      report.record_parity_verified !== true ||
      report.postgis_verified !== true ||
      report.foreign_keys_verified !== true) return null;

  for (const key of ['tables_source', 'tables_restored', 'migrations_source', 'migrations_restored']) {
    if (!Number.isSafeInteger(report[key]) || report[key] < 0) return null;
  }
  if (report.tables_source !== report.tables_restored ||
      report.migrations_source !== report.migrations_restored ||
      !Number.isSafeInteger(report.backup_bytes) || report.backup_bytes <= 0 ||
      typeof report.duration_ms !== 'number' || !Number.isFinite(report.duration_ms) ||
      report.duration_ms < 0) return null;

  if (report.duration_seconds !== undefined) {
    if (typeof report.duration_seconds !== 'number' || !Number.isFinite(report.duration_seconds) || report.duration_seconds < 0) {
      return null;
    }
  }

  if (report.rto_target_seconds !== undefined) {
    if (!Number.isSafeInteger(report.rto_target_seconds) || report.rto_target_seconds <= 0) {
      return null;
    }
    const durSec = report.duration_seconds !== undefined ? report.duration_seconds : Math.floor(report.duration_ms / 1000);
    if (durSec > report.rto_target_seconds) return null;
  }

  if (mode === 'live') {
    if (report.environment !== 'production' ||
        !validRecoveryReference(report.operator_reference) ||
        !validRecoveryReference(report.authorization_reference) ||
        !validRecoveryReference(report.maintenance_window_reference)) {
      return null;
    }
    const expected = context.expectedSection;
    if (expected && typeof expected === 'object') {
      if (requireLive && typeof expected.restore_drill_date === 'string') {
        const expDate = parseUtcDate(expected.restore_drill_date);
        if (!expDate || expDate.toISOString().slice(0, 10) !== timestamp.toISOString().slice(0, 10)) {
          return null;
        }
      }
      if (typeof expected.rto_hours === 'number' && Number.isFinite(expected.rto_hours) && expected.rto_hours > 0) {
        const durSec = report.duration_seconds !== undefined ? report.duration_seconds : Math.floor(report.duration_ms / 1000);
        if (durSec > expected.rto_hours * 3600) return null;
      }
    }
  }

  return timestamp;
}

const RECONCILIATION_COUNTS = [
  'totalDatabaseObjects', 'activeDatabaseObjects', 'pendingOrDeletedExcluded',
  'totalBucketObjects', 'matchedObjects', 'missingObjects', 'orphanObjects',
  'mismatchedObjects',
];

function isReconciliationCandidate({ file, parsed } = {}) {
  if (
    parsed &&
    (Object.hasOwn(parsed, 'stages') ||
      parsed.dossier_version !== undefined ||
      parsed.disasterRecoveryBaseline !== undefined)
  )
    return false;
  const name = typeof file === 'string' ? path.basename(file) : '';
  if (name.includes('reconcile-report-') || name.includes('reconciliation-report')) return true;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return false;
  return (
    parsed.drill_type === 'storage_reconciliation' ||
    RECONCILIATION_COUNTS.some((key) =>
      parsed.summary && typeof parsed.summary === 'object' && key in parsed.summary) ||
    ['matched', 'missing', 'orphans', 'mismatches'].some((key) => key in parsed)
  );
}

function validRecoveryDossier(report) {
  if (!report || typeof report !== 'object' || Array.isArray(report)) return false;
  if (report.overall_status !== 'PASSED') return false;
  if (!Array.isArray(report.stages) && report.dossier_version === undefined && report.disasterRecoveryBaseline === undefined) {
    return false;
  }
  const baseline = report.disasterRecoveryBaseline;
  if (baseline !== undefined) {
    if (!baseline || typeof baseline !== 'object' || baseline.status !== 'verified') return false;
    if (baseline.restoreDrill?.rtoCompliant === false || baseline.storageReconciliation?.status === 'error') return false;
  }
  const summary = report.summary;
  if (summary && typeof summary === 'object') {
    if (summary.restoreCompliance === 'failed' || summary.reconcileCompliance === 'failed' || summary.recoveryCompliance === 'restore_reconcile_failed') {
      return false;
    }
  }
  return true;
}

function validCaddyDossier(report, file) {
  if (!report || typeof report !== 'object' || Array.isArray(report)) return false;
  const fileName = typeof file === 'string' ? path.basename(file) : '';
  if (fileName.startsWith('caddy-routing')) return false;

  if (report.overall_status !== 'PASSED') return false;
  if (
    !Array.isArray(report.stages) &&
    report.dossier_version === undefined &&
    report.staticIntegrityBaseline === undefined &&
    report.deploymentBaseline === undefined
  ) {
    return false;
  }
  if (Array.isArray(report.stages)) {
    if (report.stages.some((s) => s && s.status === 'FAILED')) return false;
  }
  if (report.summary && typeof report.summary === 'object') {
    if (
      report.summary.ingressDeployment === 'failed' ||
      report.summary.caddyRoutingPreflight === 'failed'
    ) {
      return false;
    }
  }
  if (report.deploymentBaseline && typeof report.deploymentBaseline === 'object') {
    if (report.deploymentBaseline.caddyRoutingPreflight === 'failed') {
      return false;
    }
  }
  if (
    report.staticIntegrityBaseline !== undefined &&
    report.staticIntegrityBaseline?.status !== 'verified'
  ) {
    return false;
  }
  return true;
}

function validCaddyStaticEvidence(report, file) {
  if (!report || typeof report !== 'object' || Array.isArray(report)) return false;
  const fileName = typeof file === 'string' ? path.basename(file) : '';
  if (fileName.startsWith('caddy-routing')) return false;
  if (
    report.drill_type === 'static_integrity_verification' ||
    fileName.startsWith('static-integrity-evidence-')
  ) {
    return validateStaticEvidence(report).valid === true;
  }
  return false;
}

function validateReconciliationReport(report, now, context = {}) {
  if (!report || typeof report !== 'object' || Array.isArray(report)) return false;
  const mode = report.execution_mode;
  if (mode !== 'simulation' && mode !== 'live') return false;
  const requireLive = Boolean(context.requireLive);
  if (requireLive && mode !== 'live') return false;

  if (typeof report.timestamp !== 'string') return false;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(report.timestamp)) return false;
  const timestamp = new Date(report.timestamp);
  const evalNow = now instanceof Date ? now : new Date();
  if (!Number.isFinite(timestamp.getTime()) ||
      (timestamp.toISOString() !== report.timestamp && timestamp.toISOString().replace(/\.000Z$/, 'Z') !== report.timestamp) ||
      timestamp.getTime() > evalNow.getTime()) {
    return false;
  }

  const summary = report.summary;
  if (!summary || typeof summary !== 'object' || Array.isArray(summary) ||
      RECONCILIATION_COUNTS.some((key) => !Number.isSafeInteger(summary[key]) || summary[key] < 0)) return false;
  for (const [count, collection] of [
    ['matchedObjects', 'matched'], ['missingObjects', 'missing'],
    ['orphanObjects', 'orphans'], ['mismatchedObjects', 'mismatches'],
  ]) {
    if (!Array.isArray(report[collection]) || summary[count] !== report[collection].length) return false;
  }
  if (summary.missingObjects !== 0 || summary.mismatchedObjects !== 0 ||
      summary.exitCode !== 0 ||
      (summary.orphanObjects === 0 ? summary.status !== 'clean' : summary.status !== 'warning')) {
    return false;
  }

  if (mode === 'live') {
    if (report.environment !== 'production' ||
        !validRecoveryReference(report.operator_reference) ||
        !validRecoveryReference(report.authorization_reference) ||
        !validRecoveryReference(report.storage_target_reference)) {
      return false;
    }
    const expected = context.expectedSection;
    if (expected && typeof expected === 'object') {
      if (typeof expected.backup_destination === 'string' &&
          validRecoveryReference(expected.backup_destination) &&
          report.storage_target_reference !== expected.backup_destination) {
        return false;
      }
    }
  }

  return true;
}

function isVolumeEncryptionCandidate({ file, parsed } = {}) {
  // A dossier cannot become a child through a plausible filename.
  if (
    parsed &&
    (Object.hasOwn(parsed, 'stages') ||
      parsed.dossier_version !== undefined ||
      parsed.volumeEncryptionBaseline !== undefined)
  )
    return false;
  const name = typeof file === 'string' ? path.basename(file) : '';
  if (name.includes('volume-encryption')) return true;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
    return false;
  return (
    parsed.drill_type === 'production_volume_encryption_and_key_separation' ||
    (parsed.keySeparation &&
      typeof parsed.keySeparation === 'object' &&
      Array.isArray(parsed.evaluatedMounts))
  );
}

// Only Category 8 uses this narrow dossier check; a dossier never supplies live acceptance.
function validVolumeDossier(report) {
  const baseline = report.volumeEncryptionBaseline;
  return (
    report.overall_status === 'PASSED' &&
    Number.isSafeInteger(report.total_stages) &&
    report.total_stages === 7 &&
    report.passed_stages === 7 &&
    report.failed_stages === 0 &&
    Array.isArray(report.stages) &&
    report.stages.length === 7 &&
    report.stages.every(
      (stage) =>
        stage &&
        typeof stage === 'object' &&
        !Array.isArray(stage) &&
        typeof stage.stage_id === 'string' &&
        stage.status === 'PASSED',
    ) &&
    new Set(report.stages.map((stage) => stage.stage_id)).size === 7 &&
    report.stages.some((stage) => stage.stage_id === 'volume_encryption') &&
    baseline &&
    typeof baseline === 'object' &&
    !Array.isArray(baseline) &&
    baseline.status === 'verified' &&
    baseline.totalRequiredMounts === REQUIRED_STATEFUL_MOUNTS.length &&
    baseline.validMountsCount === REQUIRED_STATEFUL_MOUNTS.length &&
    baseline.keySeparationVerified === true &&
    baseline.violationsDetected === 0 &&
    report.summary?.volumeEncryptionCompliance === 'passed'
  );
}

function validVolumeReference(value) {
  if (!isRotationReference(value)) return false;
  const blockers = [];
  checkPlaceholdersAndSecrets(value, 'volume_reference', blockers);
  return blockers.length === 0;
}

function validVolumePath(value) {
  return (
    validVolumeReference(value) &&
    value.startsWith('/') &&
    value !== '/' &&
    !value.includes('\\') &&
    value
      .slice(1)
      .split('/')
      .every((part) => part !== '' && part !== '.' && part !== '..')
  );
}

function validVolumePaths(paths) {
  return (
    Array.isArray(paths) &&
    paths.length >= 3 &&
    paths.every(validVolumePath) &&
    new Set(paths).size === paths.length
  );
}

function validVolumeSection(section) {
  return (
    section !== null &&
    typeof section === 'object' &&
    !Array.isArray(section) &&
    validVolumeReference(section.encryption_mechanism) &&
    isApprovedMechanism(section.encryption_mechanism) &&
    validVolumeReference(section.key_recovery_owner) &&
    validVolumePaths(section.encrypted_mount_paths)
  );
}

function validateVolumeEncryptionReport(report, now, context = {}) {
  const object = (value) =>
    value !== null && typeof value === 'object' && !Array.isArray(value);
  if (
    !object(context) ||
    !object(report) ||
    !['simulation', 'live'].includes(report.execution_mode) ||
    report.drill_type !== 'production_volume_encryption_and_key_separation' ||
    typeof report.timestamp !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/.test(report.timestamp)
  )
    return false;
  const timestamp = parseCaddyRoutingTimestamp(report.timestamp);
  const evalNow = now === undefined ? new Date() : now;
  if (
    !(evalNow instanceof Date) ||
    !Number.isFinite(evalNow.getTime()) ||
    !timestamp ||
    timestamp > evalNow
  )
    return false;
  if (
    Object.hasOwn(context, 'expectedSection') &&
    !validVolumeSection(context.expectedSection)
  )
    return false;
  if (
    report.status !== 'success' ||
    report.valid !== true ||
    !Array.isArray(report.errors) ||
    report.errors.length !== 0
  )
    return false;
  const keySep = report.keySeparation;
  if (
    !object(keySep) ||
    keySep.verified !== true ||
    !Array.isArray(keySep.detectedViolations) ||
    keySep.detectedViolations.length !== 0
  )
    return false;
  const mounts = report.evaluatedMounts;
  const count = REQUIRED_STATEFUL_MOUNTS.length;
  if (
    !Array.isArray(mounts) ||
    mounts.length !== count ||
    !Number.isSafeInteger(report.totalRequiredMounts) ||
    report.totalRequiredMounts !== count ||
    !Number.isSafeInteger(report.validMountsCount) ||
    report.validMountsCount !== count ||
    !mounts.every((mount) => object(mount) && mount.passed === true)
  )
    return false;
  if (
    !REQUIRED_STATEFUL_MOUNTS.every(
      (required) =>
        mounts.filter(
          (mount) =>
            mount.service === required.service &&
            mount.containerPath === required.containerPath,
        ).length === 1,
    )
  )
    return false;
  if (report.execution_mode === 'simulation')
    return context.requireLive !== true;

  // Live is a separately inspected operator assertion, never a CLI capability.
  if (
    report.environment !== 'production' ||
    ![
      'environment_reference',
      'authorization_reference',
      'operator_reference',
    ].every((key) => validVolumeReference(report[key])) ||
    !validVolumeSection(report)
  )
    return false;
  const paths = report.encrypted_mount_paths;
  const covers = (root, source) =>
    source === root || source.startsWith(root + '/');
  if (
    !mounts.every(
      (mount) =>
        validVolumePath(mount.host_path) &&
        validVolumeReference(mount.evidence_reference) &&
        paths.some((root) => covers(root, mount.host_path)),
    ) ||
    !paths.every((root) =>
      mounts.some((mount) => covers(root, mount.host_path)),
    )
  )
    return false;
  const verification = report.live_verification;
  const observations = [
    'host_encryption',
    'key_separation',
    'dual_custody',
    'recovery_procedure',
  ];
  if (
    !hasExactKeys(verification, observations) ||
    !observations.every((key) => {
      const entry = verification[key];
      return (
        hasExactKeys(entry, ['status', 'verified', 'evidence_reference']) &&
        entry.status === 'passed' &&
        entry.verified === true &&
        validVolumeReference(entry.evidence_reference)
      );
    })
  )
    return false;
  if (Object.hasOwn(context, 'expectedSection')) {
    const expected = context.expectedSection;
    if (
      report.encryption_mechanism !== expected.encryption_mechanism ||
      report.key_recovery_owner !== expected.key_recovery_owner ||
      paths.length !== expected.encrypted_mount_paths.length ||
      !paths.every((root) => expected.encrypted_mount_paths.includes(root))
    )
      return false;
  }
  return true;
}

const SECRET_ROTATION_STEPS = [
  'session_rollover',
  'csrf_rollover',
  'database_rotation',
  'valkey_rotation',
  'storage_rotation',
  'compromise_response',
  'redaction_audit',
];

const SECRET_ROTATION_CLASSES = [
  'session_secret',
  'csrf_secret',
  'postgres_passwords',
  'valkey_password',
  'storage_s3_keys',
  'smtp_credentials',
  'grafana_admin_password',
];

function isSecretRotationCandidate({ file, parsed } = {}) {
  const name = typeof file === 'string' ? path.basename(file) : '';
  if (name.includes('secret-rotation-evidence-') || name.includes('secret-rotation')) return true;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return false;
  return parsed.drill_type === 'zero_downtime_secret_rotation_and_compromise_response' ||
    (Array.isArray(parsed.tested_secret_classes) && parsed.steps && typeof parsed.steps === 'object');
}

function parseSecretRotationTimestamp(value) {
  if (typeof value !== 'string') return null;
  const basic = parseUtcDate(value, true);
  if (basic) return basic;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/.test(value)) {
    const d = new Date(value);
    if (Number.isFinite(d.getTime())) {
      const iso = d.toISOString();
      if (iso === value || iso.replace(/\.000Z$/, 'Z') === value) return d;
    }
  }
  return null;
}

// References are private source pointers, never paths to dereference or print.
function isRotationReference(value) {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value === value.trim() &&
    !/[\x00-\x1f\x7f-\x9f]/.test(value)
  );
}

function validateSecretRotationReport(
  report,
  now,
  { requireLive = false } = {}
) {
  const object = (value) =>
    value !== null && typeof value === 'object' && !Array.isArray(value);
  if (
    !object(report) ||
    !(now instanceof Date) ||
    !Number.isFinite(now.getTime())
  )
    return false;
  const timestamp = parseSecretRotationTimestamp(report.timestamp);
  if (!timestamp || timestamp.getTime() > now.getTime()) return false;
  if (
    report.drill_type !==
      'zero_downtime_secret_rotation_and_compromise_response' ||
    report.status !== 'success' ||
    typeof report.dry_run !== 'boolean' ||
    !['simulation', 'live'].includes(report.execution_mode)
  )
    return false;
  if (!Array.isArray(report.errors) || report.errors.length > 0) return false;
  if (
    !Array.isArray(report.tested_secret_classes) ||
    report.tested_secret_classes.length !== SECRET_ROTATION_CLASSES.length ||
    new Set(report.tested_secret_classes).size !==
      SECRET_ROTATION_CLASSES.length ||
    !SECRET_ROTATION_CLASSES.every((cls) =>
      report.tested_secret_classes.includes(cls)
    )
  )
    return false;
  if (!object(report.steps)) return false;
  for (const step of SECRET_ROTATION_STEPS) {
    if (!object(report.steps[step]) || report.steps[step].status !== 'passed')
      return false;
  }
  const redaction = report.steps.redaction_audit;
  if (
    redaction.raw_secrets_masked !== true ||
    redaction.zero_dev_passwords_detected !== true
  )
    return false;
  if (report.execution_mode === 'simulation') return !requireLive;

  // A live label always requires the full operator contract, even in structural mode.
  if (
    report.dry_run !== false ||
    report.environment !== 'production' ||
    ![
      'environment_reference',
      'authorization_reference',
      'operator_reference'
    ].every((key) => isRotationReference(report[key]))
  )
    return false;
  const verification = report.class_verification;
  if (
    !object(verification) ||
    Object.keys(verification).length !== SECRET_ROTATION_CLASSES.length
  )
    return false;
  for (const cls of SECRET_ROTATION_CLASSES) {
    const entry = verification[cls];
    if (
      !Object.hasOwn(verification, cls) ||
      !object(entry) ||
      entry.status !== 'passed' ||
      entry.rotation_verified !== true ||
      entry.stale_credential_rejected !== true ||
      entry.fresh_credential_accepted !== true ||
      !isRotationReference(entry.evidence_reference)
    )
      return false;
  }
  if (
    !SECRET_ROTATION_STEPS.every((step) =>
      isRotationReference(report.steps[step].evidence_reference)
    )
  )
    return false;
  const blockers = [];
  checkPlaceholdersAndSecrets(report, 'secret_rotation_report', blockers);
  return blockers.length === 0;
}

const DEPLOYMENT_DRAIN_PERIODS = {
  caddy: '30s',
  next: '30s',
  api: '45s',
  worker: '60s',
};

function isDeploymentDrillCandidate({ file, parsed } = {}) {
  const name = typeof file === "string" ? path.basename(file) : "";
  if (
    parsed &&
    (Array.isArray(parsed.stages) ||
      parsed.dossier_version !== undefined ||
      parsed.deploymentBaseline !== undefined)
  )
    return false;
  if (
    name.includes("deployment-drill-evidence-") ||
    name.includes("deployment-drill")
  )
    return true;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
    return false;
  return [
    "schema_backward_compatible",
    "caddy_routing_verified",
    "rollback_procedure_verified",
    "live_verification",
    "execution_mode",
    "dry_run",
    "probe_live_tested",
  ].some((key) => Object.hasOwn(parsed, key));
}

function parseDeploymentDrillTimestamp(value) {
  if (typeof value !== 'string') return null;
  const basic = parseUtcDate(value, true);
  if (basic) return basic;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/.test(value)) {
    const d = new Date(value);
    if (Number.isFinite(d.getTime())) {
      const iso = d.toISOString();
      if (iso === value || iso.replace(/\.000Z$/, 'Z') === value) return d;
    }
  }
  return null;
}

const DEPLOYMENT_OBSERVATIONS = [
  "promotion",
  "rollback",
  "ingress",
  "migration_compatibility",
  "readiness",
  "graceful_drain",
  "network_isolation",
  "image_provenance",
];

function validDeploymentRelease(release, exact = false) {
  if (
    !release ||
    typeof release !== "object" ||
    Array.isArray(release) ||
    (exact &&
      !hasExactKeys(release, [
        "reviewed_source_commit",
        "current",
        "previous",
      ])) ||
    typeof release.reviewed_source_commit !== "string" ||
    !/^[a-fA-F0-9]{40}$/.test(release.reviewed_source_commit)
  )
    return false;
  for (const pair of ["current", "previous"]) {
    if (!hasExactKeys(release[pair], ["client_image", "server_image"]))
      return false;
    for (const role of ["client_image", "server_image"]) {
      try {
        validateImageReference(release[pair][role], "image");
      } catch {
        return false;
      }
    }
    if (release[pair].client_image === release[pair].server_image) return false;
  }
  return (
    release.current.client_image !== release.previous.client_image ||
    release.current.server_image !== release.previous.server_image
  );
}

function validateDeploymentDrillReport(
  report,
  now = new Date(),
  { requireLive = false, expectedRelease } = {},
) {
  if (!report || typeof report !== "object" || Array.isArray(report))
    return false;
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) return false;
  const timestamps = ["drill_timestamp", "timestamp"]
    .filter((key) => Object.hasOwn(report, key))
    .map((key) => parseDeploymentDrillTimestamp(report[key]));
  if (
    !timestamps.length ||
    timestamps.some((date) => !date || date > now) ||
    timestamps.some((date) => date.getTime() !== timestamps[0].getTime())
  )
    return false;
  if (
    typeof report.dry_run !== "boolean" ||
    typeof report.probe_live_tested !== "boolean" ||
    !["simulation", "live"].includes(report.execution_mode)
  )
    return false;
  if (expectedRelease !== undefined && !validDeploymentRelease(expectedRelease))
    return false;
  if (report.status !== "success") return false;
  if (report.schema_backward_compatible !== true) return false;
  if (report.rollback_procedure_verified !== true) return false;
  if (report.caddy_routing_verified !== true) return false;
  if (
    typeof report.caddy_routes_tested !== "number" ||
    !Number.isSafeInteger(report.caddy_routes_tested) ||
    report.caddy_routes_tested < 12
  ) {
    return false;
  }
  if (report.security_headers_verified !== true) return false;
  if (report.s3_sigv4_host_preserved !== true) return false;
  if (report.migrations_verified !== true) return false;
  if (
    typeof report.migration_count !== "number" ||
    !Number.isSafeInteger(report.migration_count) ||
    report.migration_count < 0
  ) {
    return false;
  }
  if (report.operational_templates_verified !== true) return false;
  if (report.secrets_scan_verified !== true) return false;
  if (report.readiness_probes_verified !== true) return false;
  if (report.network_isolation_verified !== true) return false;
  if (
    !report.graceful_drain_periods_verified ||
    typeof report.graceful_drain_periods_verified !== "object" ||
    Array.isArray(report.graceful_drain_periods_verified)
  ) {
    return false;
  }
  for (const [svc, expected] of Object.entries(DEPLOYMENT_DRAIN_PERIODS)) {
    if (report.graceful_drain_periods_verified[svc] !== expected) return false;
  }
  if (report.duration_ms !== undefined) {
    if (
      typeof report.duration_ms !== "number" ||
      !Number.isFinite(report.duration_ms) ||
      report.duration_ms < 0
    ) {
      return false;
    }
  }
  if (
    report.duration_seconds !== undefined &&
    (typeof report.duration_seconds !== "number" ||
      !Number.isFinite(report.duration_seconds) ||
      report.duration_seconds < 0)
  )
    return false;
  if (report.execution_mode === "simulation") return !requireLive;
  if (
    report.dry_run !== false ||
    report.probe_live_tested !== true ||
    report.environment !== "production" ||
    ![
      "environment_reference",
      "authorization_reference",
      "operator_reference",
    ].every((key) => isRotationReference(report[key])) ||
    !validDeploymentRelease(report.release, true) ||
    !hasExactKeys(report.live_verification, DEPLOYMENT_OBSERVATIONS)
  )
    return false;
  for (const key of DEPLOYMENT_OBSERVATIONS) {
    const observation = report.live_verification[key];
    if (
      !hasExactKeys(observation, [
        "status",
        "verified",
        "evidence_reference",
      ]) ||
      observation.status !== "passed" ||
      observation.verified !== true ||
      !isRotationReference(observation.evidence_reference)
    )
      return false;
  }
  if (expectedRelease !== undefined) {
    if (
      report.release.reviewed_source_commit.toLowerCase() !==
      expectedRelease.reviewed_source_commit.toLowerCase()
    )
      return false;
    for (const pair of ["current", "previous"]) {
      for (const role of ["client_image", "server_image"]) {
        if (report.release[pair][role] !== expectedRelease[pair][role])
          return false;
      }
    }
  }
  const blockers = [];
  checkPlaceholdersAndSecrets(report, "deployment_report", blockers);
  return blockers.length === 0;
}

function isCapacityAlertingCandidate({ file, parsed } = {}) {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return false;
  if (Array.isArray(parsed.stages) || parsed.dossier_version !== undefined) return false;
  const name = typeof file === 'string' ? path.basename(file) : '';
  if (name.includes('capacity-alerting-drill-evidence-') || name.includes('capacity-alerting')) return true;
  return (
    parsed.drill_type === 'capacity_and_prometheus_alerting_drill' ||
    (parsed.summary &&
      typeof parsed.summary === 'object' &&
      typeof parsed.alerts === 'object' &&
      typeof parsed.capacity === 'object' &&
      typeof parsed.databaseTelemetryBaseline === 'object' &&
      typeof parsed.dosResilience === 'object')
  );
}

function parseCapacityAlertingTimestamp(value) {
  if (typeof value !== 'string') return null;
  const basic = parseUtcDate(value, true);
  if (basic) return basic;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/.test(value)) {
    const d = new Date(value);
    if (Number.isFinite(d.getTime())) {
      const iso = d.toISOString();
      if (iso === value || iso.replace(/\.000Z$/, 'Z') === value) return d;
    }
  }
  return null;
}

// Reports are retained evidence: validate their execution interval, not a new TTL.
function validateCapacityAlertingReport(report, now, context = {}) {
  const object = (v) =>
    v !== null && typeof v === 'object' && !Array.isArray(v);
  const empty = (v) => Array.isArray(v) && v.length === 0;
  const finite = (v, min = 0) =>
    typeof v === 'number' && Number.isFinite(v) && v >= min;
  const canonical = (v) => {
    if (
      typeof v !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v)
    )
      return null;
    const ms = Date.parse(v);
    return Number.isFinite(ms) && new Date(ms).toISOString() === v ? ms : null;
  };
  if (!object(report)) return false;
  const timestamp = parseCapacityAlertingTimestamp(report.timestamp);
  const evaluation = (now instanceof Date ? now : new Date()).getTime();
  const start = timestamp?.getTime();
  if (
    !timestamp ||
    !Number.isFinite(evaluation) ||
    start > evaluation ||
    report.status !== 'success' ||
    !empty(report.failures) ||
    !Number.isSafeInteger(report.durationMs) ||
    report.durationMs < 0
  )
    return false;
  // The parent records its start to seconds; its duration retains milliseconds.
  const end = start + report.durationMs + 999;
  if (
    !Number.isSafeInteger(end) ||
    !Number.isFinite(new Date(end).getTime()) ||
    start + report.durationMs > evaluation
  )
    return false;
  if (
    !['synthetic', 'live'].includes(report.mode) ||
    (context.requireLive === true && report.mode !== 'live')
  )
    return false;
  const synthetic = report.mode === 'synthetic';
  if (
    !object(report.summary) ||
    ![
      'alertVerification',
      'capacitySloCompliance',
      'dosResilience',
      'databaseBaselineCompliance',
    ].every((k) => report.summary[k] === 'passed')
  )
    return false;

  const alerts = report.alerts;
  if (
    !object(alerts) ||
    alerts.valid !== true ||
    !empty(alerts.errors) ||
    alerts.requiredRulesCount !== REQUIRED_ALERTS.length ||
    !Number.isSafeInteger(alerts.totalRulesCount) ||
    alerts.totalRulesCount < REQUIRED_ALERTS.length ||
    !Array.isArray(alerts.alerts) ||
    alerts.alerts.length !== REQUIRED_ALERTS.length ||
    !Array.isArray(alerts.simulations) ||
    alerts.simulations.length !== REQUIRED_ALERTS.length ||
    !Array.isArray(alerts.checks) ||
    !alerts.checks.length ||
    !alerts.checks.every((c) => object(c) && c.passed === true)
  )
    return false;
  // The producer evaluates the required set only; extra YAML rules affect totalRulesCount.
  for (const name of REQUIRED_ALERTS) {
    const rules = alerts.alerts.filter((r) => object(r) && r.alert === name);
    const sims = alerts.simulations.filter(
      (r) => object(r) && r.alert === name,
    );
    if (
      rules.length !== 1 ||
      rules[0].valid !== true ||
      !empty(rules[0].errors) ||
      sims.length !== 1 ||
      sims[0].passed !== true ||
      sims[0].firesOnBreach !== true ||
      sims[0].clearsOnNormal !== true ||
      (name === 'High429Rate' && sims[0].ignoresOther4xx !== true)
    )
      return false;
  }

  const validTargets = (t) =>
    object(t) &&
    Object.keys(DEFAULT_SLO_TARGETS).every((k) =>
      finite(t[k], Number.MIN_VALUE),
    ) &&
    t.availabilityTargetPercent >=
      DEFAULT_SLO_TARGETS.availabilityTargetPercent &&
    t.availabilityTargetPercent <= 100 &&
    t.maxP95LatencyMs <= DEFAULT_SLO_TARGETS.maxP95LatencyMs &&
    t.capacityTargetRps >= DEFAULT_SLO_TARGETS.capacityTargetRps &&
    t.maxDatabaseAcquisitionP95LatencyMs <=
      DEFAULT_SLO_TARGETS.maxDatabaseAcquisitionP95LatencyMs &&
    t.maxDatabaseQueryP95LatencyMs <=
      DEFAULT_SLO_TARGETS.maxDatabaseQueryP95LatencyMs;
  const latency = (v) =>
    object(v) &&
    ['min', 'p50', 'p90', 'p95', 'p99', 'max', 'mean', 'stddev'].every((k) =>
      finite(v[k]),
    ) &&
    ['min', 'p50', 'p90', 'p95', 'p99'].every(
      (k, i) => v[k] <= v[['p50', 'p90', 'p95', 'p99', 'max'][i]],
    ) &&
    v.mean >= v.min &&
    v.mean <= v.max;
  const capacity = report.capacity;
  if (
    !object(capacity) ||
    capacity.mode !== report.mode ||
    !validTargets(capacity.targets)
  )
    return false;
  const sampledAt = canonical(capacity.timestamp);
  if (
    sampledAt === null ||
    sampledAt < start ||
    sampledAt > end ||
    sampledAt > evaluation
  )
    return false;
  const d = capacity.distribution;
  if (
    !object(d) ||
    !Number.isSafeInteger(d.totalRequests) ||
    d.totalRequests <= 0 ||
    !Number.isSafeInteger(d.successfulRequests) ||
    d.successfulRequests < 0 ||
    !Number.isSafeInteger(d.failedRequests) ||
    d.failedRequests < 0 ||
    d.successfulRequests > d.totalRequests ||
    d.failedRequests !== d.totalRequests - d.successfulRequests ||
    !finite(d.availabilityPercent) ||
    d.availabilityPercent > 100 ||
    d.availabilityPercent !==
      Number(((d.successfulRequests / d.totalRequests) * 100).toFixed(3)) ||
    !finite(d.throughputRps, Number.MIN_VALUE) ||
    !latency(d.latencyMs)
  )
    return false;
  if (
    (synthetic || d.databaseLatency !== undefined) &&
    (!object(d.databaseLatency) ||
      !latency(d.databaseLatency.acquisitionLatencyMs) ||
      !latency(d.databaseLatency.queryLatencyMs))
  )
    return false;
  const computed = evaluateSloCompliance(d, capacity.targets);
  if (
    !object(capacity.compliance) ||
    !empty(capacity.compliance.violations) ||
    !Object.keys(computed)
      .filter((k) => typeof computed[k] === 'boolean')
      .every(
        (k) => computed[k] === true && capacity.compliance[k] === computed[k],
      )
  )
    return false;

  const section = context.section;
  const policy = section
    ? {
        availabilityTargetPercent: section.availability_target_percent,
        maxP95LatencyMs: section.max_p95_latency_ms,
        capacityTargetRps: section.capacity_target_rps,
        maxDatabaseAcquisitionP95LatencyMs:
          section.max_database_acquisition_p95_latency_ms,
        maxDatabaseQueryP95LatencyMs: section.max_database_query_p95_latency_ms,
      }
    : capacity.targets;
  if (!validTargets(policy) || !evaluateSloCompliance(d, policy).overallPassed)
    return false;
  const hash = (v) => typeof v === 'string' && /^sha256:[a-f0-9]{64}$/.test(v);
  if (
    synthetic
      ? report.targetId !== null ||
        report.apiTargetId !== null ||
        capacity.targetUrl !== 'synthetic://in-process-evaluation'
      : !hash(report.targetId) ||
        !hash(report.apiTargetId) ||
        capacity.targetUrl !== report.targetId
  )
    return false;
  const db = report.databaseTelemetryBaseline;
  if (
    !object(db) ||
    db.status !== 'verified' ||
    db.source !== (synthetic ? 'synthetic' : 'prometheus-live-scrape')
  )
    return false;
  // Adapt only a local rehearsal copy to the numeric checker; production cannot use this path.
  const telemetry = synthetic
    ? {
        ...db,
        source: 'prometheus-live-scrape',
        targetId: null,
        probeHealthy: true,
        timestamp: new Date(start).toISOString(),
      }
    : db;
  if (!validDatabaseTelemetry(telemetry, report.targetId, start, end))
    return false;
  if (
    !synthetic &&
    (canonical(db.timestamp) === null || Date.parse(db.timestamp) > evaluation)
  )
    return false;
  for (const role of ['api', 'worker']) {
    if (
      db.poolAcquisitionLatency[role].p95Ms >
        Math.min(
          policy.maxDatabaseAcquisitionP95LatencyMs,
          capacity.targets.maxDatabaseAcquisitionP95LatencyMs,
        ) ||
      db.queryExecutionDuration[role].p95Ms >
        Math.min(
          policy.maxDatabaseQueryP95LatencyMs,
          capacity.targets.maxDatabaseQueryP95LatencyMs,
        )
    )
      return false;
  }
  const dosTimestamp = canonical(report.dosResilience?.timestamp);
  return (
    dosTimestamp !== null &&
    dosTimestamp <= evaluation &&
    validDosEvidence(
      report.dosResilience,
      synthetic,
      report.apiTargetId,
      start,
      end,
    )
  );
}

function isCaddyRoutingCandidate({ file, parsed } = {}) {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return false;
  if (
    Object.hasOwn(parsed, 'stages') ||
    Array.isArray(parsed.stages) ||
    parsed.dossier_version !== undefined ||
    parsed.deploymentBaseline !== undefined
  ) {
    return false;
  }
  const fileName = typeof file === 'string' ? path.basename(file) : '';
  if (fileName.startsWith('caddy-routing-evidence-') || fileName.startsWith('caddy-routing')) return true;
  if (parsed.drill_type === 'caddy_routing_and_tls_verification') return true;
  return (
    typeof parsed.securityHeadersVerified === 'boolean' &&
    typeof parsed.s3SigV4HostPreserved === 'boolean' &&
    typeof parsed.proxyHeadersVerified === 'boolean' &&
    Array.isArray(parsed.evaluatedRoutes)
  );
}

function parseCaddyRoutingTimestamp(value) {
  if (typeof value !== 'string') return null;
  const basic = parseUtcDate(value, true);
  if (basic) return basic;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/.test(value)) {
    const d = new Date(value);
    if (Number.isFinite(d.getTime())) {
      const iso = d.toISOString();
      if (iso === value || iso.replace(/\.000Z$/, 'Z') === value) return d;
    }
  }
  return null;
}

function validDomainTlsReference(value) {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value !== value.trim() ||
    /[\x00-\x1f\x7f-\x9f]/.test(value)
  ) {
    return false;
  }
  const blockers = [];
  checkPlaceholdersAndSecrets(value, 'domain_tls_reference', blockers);
  return blockers.length === 0;
}

function validateCaddyRoutingReport(report, now, approvedDomain, context = {}) {
  try {
    let domain = approvedDomain;
    let ctx = context;
    if (
      approvedDomain &&
      typeof approvedDomain === 'object' &&
      !Array.isArray(approvedDomain) &&
      (approvedDomain.requireLive !== undefined || approvedDomain.expectedSection !== undefined)
    ) {
      ctx = approvedDomain;
      domain = undefined;
    }

    if (!report || typeof report !== 'object' || Array.isArray(report)) return false;
    if (!ctx || typeof ctx !== 'object' || Array.isArray(ctx)) return false;
    if (report.drill_type !== 'caddy_routing_and_tls_verification') return false;

    const mode = report.execution_mode;
    if (mode !== 'simulation' && mode !== 'live') return false;

    const evalNow = now instanceof Date ? now : new Date();
    if (!Number.isFinite(evalNow.getTime())) return false;
    const ts = parseCaddyRoutingTimestamp(report.timestamp);
    if (!ts || ts.getTime() > evalNow.getTime()) return false;

    if (report.status !== 'success') return false;
    if (report.valid !== true) return false;
    if (!Array.isArray(report.errors) || report.errors.length > 0) return false;
    if (report.securityHeadersVerified !== true) return false;
    if (report.s3SigV4HostPreserved !== true) return false;
    if (report.proxyHeadersVerified !== true) return false;
    if (
      typeof report.routesEvaluated !== 'number' ||
      !Number.isInteger(report.routesEvaluated) ||
      report.routesEvaluated < 12
    ) {
      return false;
    }
    if (
      typeof report.routesPassed !== 'number' ||
      !Number.isInteger(report.routesPassed) ||
      report.routesPassed !== report.routesEvaluated
    ) {
      return false;
    }
    if (!Array.isArray(report.evaluatedRoutes) || report.evaluatedRoutes.length !== report.routesEvaluated) return false;
    if (report.evaluatedRoutes.some((r) => !r || r.passed !== true)) return false;

    const requireLive = Boolean(ctx.requireLive);
    const expectedSection = ctx.expectedSection;

    if (mode === 'simulation') {
      if (requireLive) return false;

      if (typeof domain === 'string' && domain.trim() !== '') {
        if (typeof report.domain !== 'string' || report.domain.toLowerCase() !== domain.toLowerCase()) return false;
        if (
          typeof report.targetPath !== 'string' ||
          report.targetPath.trim() === '' ||
          path.basename(report.targetPath) === 'Caddyfile.example'
        ) {
          return false;
        }
        if (report.hstsApproved !== true) return false;
      }

      if (expectedSection && typeof expectedSection === 'object') {
        if (typeof expectedSection.domain === 'string' && expectedSection.domain.trim() !== '') {
          if (typeof report.domain !== 'string' || report.domain.toLowerCase() !== expectedSection.domain.toLowerCase()) {
            return false;
          }
        }
        if (expectedSection.hsts_approved === true && report.hstsApproved !== true) {
          return false;
        }
      }

      return true;
    }

    // Live mode
    if (report.environment !== 'production') return false;
    if (typeof report.domain !== 'string' || report.domain.trim() === '') return false;
    // In live mode, explicit rejection (hstsApproved === false) fails closed; live HSTS
    // verification is authoritatively evaluated via https_headers_verification below.
    if (report.hstsApproved === false) return false;
    if (typeof report.targetPath === 'string' && path.basename(report.targetPath) === 'Caddyfile.example') return false;
    if (
      !validDomainTlsReference(report.operator_reference) ||
      !validDomainTlsReference(report.authorization_reference) ||
      !validDomainTlsReference(report.domain_reference)
    ) {
      return false;
    }

    // dns_verification
    const dns = report.dns_verification;
    if (!dns || typeof dns !== 'object' || Array.isArray(dns)) return false;
    if (dns.status !== 'passed' || dns.verified !== true) return false;
    if (typeof dns.record_type !== 'string' || dns.record_type.trim() === '') return false;
    if (!validDomainTlsReference(dns.evidence_reference)) return false;

    // tls_handshake_verification
    const tls = report.tls_handshake_verification;
    if (!tls || typeof tls !== 'object' || Array.isArray(tls)) return false;
    if (tls.status !== 'passed' || tls.verified !== true || tls.certificate_valid !== true) return false;
    if (typeof tls.protocol !== 'string' || tls.protocol.trim() === '') return false;
    if (!validDomainTlsReference(tls.evidence_reference)) return false;

    // https_headers_verification
    const https = report.https_headers_verification;
    if (!https || typeof https !== 'object' || Array.isArray(https)) return false;
    if (https.status !== 'passed' || https.verified !== true || https.security_headers_verified !== true) return false;
    if (!validDomainTlsReference(https.evidence_reference)) return false;

    if (typeof domain === 'string' && domain.trim() !== '') {
      if (typeof report.domain !== 'string' || report.domain.toLowerCase() !== domain.toLowerCase()) return false;
    }

    if (expectedSection && typeof expectedSection === 'object') {
      if (typeof expectedSection.domain === 'string' && expectedSection.domain.trim() !== '') {
        if (typeof report.domain !== 'string' || report.domain.toLowerCase() !== expectedSection.domain.toLowerCase()) {
          return false;
        }
      }
      if (expectedSection.hsts_approved === true && https.hsts_verified !== true) {
        return false;
      }
    }

    return true;
  } catch {
    return false;
  }
}

function isSmtpDeliveryCandidate({ file, parsed } = {}) {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return false;
  if (
    Object.hasOwn(parsed, 'stages') ||
    Array.isArray(parsed.stages) ||
    parsed.dossier_version !== undefined ||
    parsed.deploymentBaseline !== undefined
  ) {
    return false;
  }
  const fileName = typeof file === 'string' ? path.basename(file) : '';
  if (fileName.startsWith('smtp-delivery-evidence-') || fileName.startsWith('smtp-delivery')) return true;
  if (parsed.drill_type === 'smtp_delivery_verification') return true;
  return (
    typeof parsed.provider === 'string' &&
    typeof parsed.host === 'string' &&
    typeof parsed.from_address === 'string'
  );
}

function validSmtpText(value) {
  return typeof value === 'string' && value.trim() !== '' &&
    !value.includes('__REQUIRED_') && !value.includes('<REQUIRED_') && !value.includes('change-me');
}

function validSmtpEmail(value) {
  if (!validSmtpText(value) || value.length > 254) return false;
  const parts = value.split('@');
  if (parts.length !== 2 || parts[0].length > 64 || parts[0].startsWith('.') || parts[0].endsWith('.')) return false;
  return !value.includes('..') &&
    /^[a-zA-Z0-9._%+-]+@([a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/.test(value);
}

function validSmtpSecretReference(value) {
  if (!validSmtpText(value)) return false;
  return /^(?:vault:[A-Za-z0-9_./-]+#[A-Za-z0-9_.-]+|aws-sm:[A-Za-z0-9_./-]+|env:[A-Z][A-Z0-9_]*|file:\/[A-Za-z0-9_./-]+)$/.test(value);
}

function validSmtpReference(value) {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value !== value.trim() ||
    /[\x00-\x1f\x7f-\x9f]/.test(value)
  ) {
    return false;
  }
  const blockers = [];
  checkPlaceholdersAndSecrets(value, 'smtp_reference', blockers);
  return blockers.length === 0;
}

function parseSmtpTimestamp(value) {
  if (typeof value !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/.test(value)) return null;
  return parseCaddyRoutingTimestamp(value);
}

function validateSmtpDeliveryReport(report, now, approvedOrContext, maybeContext) {
  try {
    if (!report || typeof report !== 'object' || Array.isArray(report)) return false;
    if (report.drill_type !== 'smtp_delivery_verification' || report.status !== 'success') return false;
    const mode = report.execution_mode;
    if (mode !== 'simulation' && mode !== 'live') return false;

    let approved = null;
    let context = {};
    if (approvedOrContext && typeof approvedOrContext === 'object') {
      if (approvedOrContext.requireLive !== undefined || approvedOrContext.expectedSection !== undefined) {
        context = approvedOrContext;
      } else {
        approved = approvedOrContext;
        if (maybeContext && typeof maybeContext === 'object') {
          context = maybeContext;
        }
      }
    }

    const evalNow = now instanceof Date ? now : new Date();
    if (!Number.isFinite(evalNow.getTime())) return false;
    const timestamp = parseSmtpTimestamp(report.timestamp);
    if (!timestamp || timestamp > evalNow) return false;
    if (!Array.isArray(report.errors) || report.errors.length !== 0) return false;
    if (!validSmtpText(report.provider) || !validSmtpText(report.host) || !validSmtpEmail(report.from_address)) return false;
    if (!Number.isInteger(report.port) || report.port < 1 || report.port > 65535) return false;
    if (!['STARTTLS', 'TLS'].includes(report.tls_mode)) return false;

    if (approved) {
      if (!validSmtpText(approved.provider) || !validSmtpText(approved.host) ||
          !validSmtpEmail(approved.from_address)) return false;
      if (report.provider !== approved.provider || report.host.toLowerCase() !== approved.host.toLowerCase() ||
          report.port !== approved.port || report.tls_mode !== approved.tls_mode ||
          report.from_address.toLowerCase() !== approved.from_address.toLowerCase()) return false;
    }

    const secretMarkers = [];
    checkPlaceholdersAndSecrets(report, 'smtp_report', secretMarkers);
    if (secretMarkers.length > 0) return false;

    const requireLive = Boolean(context?.requireLive);

    if (mode === 'simulation') {
      if (requireLive) return false;
      return true;
    }

    // Live mode
    if (report.environment !== 'production') return false;
    if (
      !validSmtpReference(report.operator_reference) ||
      !validSmtpReference(report.authorization_reference) ||
      !validSmtpReference(report.provider_reference)
    ) {
      return false;
    }

    const delivery = report.delivery;
    if (!delivery || typeof delivery !== 'object' || Array.isArray(delivery) ||
        delivery.status !== 'delivered' || !validSmtpReference(delivery.receipt_id)) return false;
    const deliveredAt = parseSmtpTimestamp(delivery.timestamp);
    if (!deliveredAt || deliveredAt > evalNow) return false;

    const dns = report.dns;
    if (!dns || typeof dns !== 'object' || Array.isArray(dns)) return false;
    const checkedAt = parseSmtpTimestamp(dns.checked_at);
    if (!checkedAt || checkedAt > evalNow) return false;

    const dnsPassed = ['spf', 'dkim', 'dmarc'].every((key) =>
      dns[key] && typeof dns[key] === 'object' && !Array.isArray(dns[key]) &&
      dns[key].passed === true && validSmtpReference(dns[key].record));
    if (!dnsPassed) return false;

    return true;
  } catch {
    return false;
  }
}

function isSecretReferencePolicyCandidate({ parsed } = {}) {
  // A custom-named JSON file must be checked too; a dossier cannot qualify.
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return false;
  if (Array.isArray(parsed.stages) || parsed.dossier_version !== undefined) return false;
  return true;
}

function validateSecretReferencePolicyReport(report, now, approvedOrContext, maybeContext) {
  try {
    if (!report || typeof report !== 'object' || Array.isArray(report)) return false;
    if (report.drill_type !== 'secret_reference_policy_verification' || report.status !== 'success') return false;
    const mode = report.execution_mode;
    if (mode !== 'simulation' && mode !== 'live') return false;

    let approved = null;
    let context = {};
    if (approvedOrContext && typeof approvedOrContext === 'object') {
      if (approvedOrContext.requireLive !== undefined || approvedOrContext.expectedSection !== undefined) {
        context = approvedOrContext;
      } else {
        approved = approvedOrContext;
        if (maybeContext && typeof maybeContext === 'object') {
          context = maybeContext;
        }
      }
    }

    const evalNow = now instanceof Date ? now : new Date();
    if (!Number.isFinite(evalNow.getTime())) return false;
    const timestamp = parseSmtpTimestamp(report.timestamp);
    if (!timestamp || timestamp > evalNow) return false;
    if (!Array.isArray(report.errors) || report.errors.length !== 0) return false;
    if (!validSmtpReference(report.policy_reference)) return false;

    if (!report.references || typeof report.references !== 'object' || Array.isArray(report.references)) return false;

    const secretMarkers = [];
    checkPlaceholdersAndSecrets(report, 'policy_report', secretMarkers);
    if (secretMarkers.length > 0) return false;

    const keys = Object.keys(report.references);
    if (keys.length !== REQUIRED_SECRET_KEYS.length ||
        keys.some((key) => !REQUIRED_SECRET_KEYS.includes(key))) return false;

    if (new Set(REQUIRED_SECRET_KEYS.map((key) => report.references[key]?.source)).size !== REQUIRED_SECRET_KEYS.length) return false;
    if (approved && typeof approved === 'object') {
      if (new Set(REQUIRED_SECRET_KEYS.map((key) => approved[key])).size !== REQUIRED_SECRET_KEYS.length) return false;
    }

    const refsValid = REQUIRED_SECRET_KEYS.every((key) => {
      const entry = report.references[key];
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return false;
      const expectedSource = approved ? approved[key] : entry.source;
      if (!validSmtpSecretReference(expectedSource) || /gemini/i.test(expectedSource)) return false;
      if (entry.source !== expectedSource) return false;
      if (entry.access_verified !== true || entry.plaintext_exposed !== false) return false;
      return Object.keys(entry).length === 3;
    });
    if (!refsValid) return false;

    const requireLive = Boolean(context?.requireLive);

    if (mode === 'simulation') {
      if (requireLive) return false;
      if (Object.keys(report).sort().join(',') !==
          ['drill_type', 'errors', 'execution_mode', 'policy_reference', 'references', 'status', 'timestamp'].sort().join(',')) return false;
      return true;
    }

    // Live mode
    if (report.environment !== 'production') return false;
    if (
      !validSmtpReference(report.operator_reference) ||
      !validSmtpReference(report.authorization_reference) ||
      !validSmtpReference(report.policy_reference)
    ) {
      return false;
    }

    if (Object.keys(report).sort().join(',') !==
        ['authorization_reference', 'drill_type', 'environment', 'errors', 'execution_mode', 'operator_reference', 'policy_reference', 'references', 'status', 'timestamp'].sort().join(',')) return false;

    return true;
  } catch {
    return false;
  }
}

function isDataRetentionPolicyCandidate({ parsed } = {}) {
  // A custom-named JSON file must be checked too; a dossier cannot qualify.
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return false;
  if (Array.isArray(parsed.stages) || parsed.dossier_version !== undefined) return false;
  return true;
}

function validateDataRetentionPolicyReport(report, now, approvedOrContext, maybeContext) {
  try {
    if (!report || typeof report !== 'object' || Array.isArray(report)) return false;
    if (report.drill_type !== 'data_retention_policy_verification' || report.status !== 'success') return false;
    const mode = report.execution_mode;
    if (mode !== 'simulation' && mode !== 'live') return false;

    let approved = null;
    let context = {};
    if (approvedOrContext && typeof approvedOrContext === 'object') {
      if (approvedOrContext.requireLive !== undefined || approvedOrContext.expectedSection !== undefined) {
        context = approvedOrContext;
      } else {
        approved = approvedOrContext;
        if (maybeContext && typeof maybeContext === 'object') {
          context = maybeContext;
        }
      }
    }

    const evalNow = now instanceof Date ? now : new Date();
    if (!Number.isFinite(evalNow.getTime())) return false;
    const timestamp = parseSmtpTimestamp(report.timestamp);
    if (!timestamp || timestamp > evalNow) return false;
    if (!Array.isArray(report.errors) || report.errors.length !== 0) return false;
    if (!validSmtpReference(report.policy_reference)) return false;
    if (report.scheduled_cleanup_verified !== true) return false;

    if (!report.retention_windows || typeof report.retention_windows !== 'object' || Array.isArray(report.retention_windows)) return false;

    const secretMarkers = [];
    checkPlaceholdersAndSecrets(report, 'retention_report', secretMarkers);
    if (secretMarkers.length > 0) return false;

    const keys = Object.keys(report.retention_windows);
    if (keys.length !== REQUIRED_RETENTION_KEYS.length ||
        keys.some((key) => !REQUIRED_RETENTION_KEYS.includes(key))) return false;

    const windowsValid = REQUIRED_RETENTION_KEYS.every((key) => {
      const entry = report.retention_windows[key];
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return false;
      const expectedWindow = approved ? approved[key] : entry.window;
      if (typeof expectedWindow !== 'string' || entry.window !== expectedWindow) return false;
      if (entry.policy_verified !== true) return false;
      return Object.keys(entry).length === 2;
    });
    if (!windowsValid) return false;

    const requireLive = Boolean(context?.requireLive);

    if (mode === 'simulation') {
      if (requireLive) return false;
      if (Object.keys(report).sort().join(',') !==
          ['drill_type', 'errors', 'execution_mode', 'policy_reference', 'retention_windows', 'scheduled_cleanup_verified', 'status', 'timestamp'].sort().join(',')) return false;
      return true;
    }

    // Live mode
    if (report.environment !== 'production') return false;
    if (
      !validSmtpReference(report.operator_reference) ||
      !validSmtpReference(report.authorization_reference) ||
      !validSmtpReference(report.policy_reference)
    ) {
      return false;
    }

    if (Object.keys(report).sort().join(',') !==
        ['authorization_reference', 'drill_type', 'environment', 'errors', 'execution_mode', 'operator_reference', 'policy_reference', 'retention_windows', 'scheduled_cleanup_verified', 'status', 'timestamp'].sort().join(',')) return false;

    return true;
  } catch {
    return false;
  }
}

function isValidGraphqlEndpoint(endpoint) {
  if (typeof endpoint !== 'string' || !endpoint.trim()) return false;
  if (endpoint === '/graphql') return true;
  try {
    const url = new URL(endpoint);
    return (url.protocol === 'https:' || url.protocol === 'http:') && url.pathname === '/graphql';
  } catch {
    return false;
  }
}

function isGraphqlIntrospectionCandidate({ parsed } = {}) {
  // A custom-named JSON file must be checked too; a dossier cannot qualify.
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return false;
  if (Array.isArray(parsed.stages) || parsed.dossier_version !== undefined) return false;
  return true;
}

function validateGraphqlIntrospectionReport(report, now, approvedOrContext, maybeContext) {
  try {
    if (!report || typeof report !== 'object' || Array.isArray(report)) return false;
    if (report.drill_type !== 'graphql_introspection_probe' || report.status !== 'success') return false;
    const mode = report.execution_mode;
    if (mode !== 'simulation' && mode !== 'live') return false;

    let approved = null;
    let context = {};
    if (approvedOrContext && typeof approvedOrContext === 'object') {
      if (approvedOrContext.requireLive !== undefined || approvedOrContext.expectedSection !== undefined) {
        context = approvedOrContext;
      } else {
        approved = approvedOrContext;
        if (maybeContext && typeof maybeContext === 'object') {
          context = maybeContext;
        }
      }
    }

    const evalNow = now instanceof Date ? now : new Date();
    if (!Number.isFinite(evalNow.getTime())) return false;
    const timestamp = parseSmtpTimestamp(report.timestamp);
    if (!timestamp || timestamp > evalNow) return false;
    if (!isValidGraphqlEndpoint(report.endpoint)) return false;
    if (typeof report.production_introspection_enabled !== 'boolean') return false;
    if (!Array.isArray(report.errors) || report.errors.length !== 0) return false;

    if (!report.probe_result || typeof report.probe_result !== 'object' || Array.isArray(report.probe_result)) return false;

    const secretMarkers = [];
    checkPlaceholdersAndSecrets(report, 'graphql_probe_report', secretMarkers);
    if (secretMarkers.length > 0) return false;

    if (Object.keys(report.probe_result).sort().join(',') !==
        ['introspection_permitted', 'response_summary', 'schema_exposed', 'status_code'].sort().join(',')) return false;

    const probe = report.probe_result;
    if (typeof probe.status_code !== 'number' || !Number.isInteger(probe.status_code) || probe.status_code <= 0) return false;
    if (typeof probe.introspection_permitted !== 'boolean') return false;
    if (probe.introspection_permitted !== report.production_introspection_enabled) return false;
    if (typeof probe.schema_exposed !== 'boolean') return false;
    if (report.production_introspection_enabled === false && probe.schema_exposed !== false) return false;
    if (report.production_introspection_enabled === true && probe.schema_exposed !== true) return false;
    if (typeof probe.response_summary !== 'string' || !probe.response_summary.trim() || probe.response_summary !== probe.response_summary.trim()) return false;

    if (approved && typeof approved === 'object' && typeof approved.production_introspection_enabled === 'boolean') {
      if (report.production_introspection_enabled !== approved.production_introspection_enabled) return false;
    }

    const requireLive = Boolean(context?.requireLive);

    if (mode === 'simulation') {
      if (requireLive) return false;
      if (Object.keys(report).sort().join(',') !==
          ['drill_type', 'endpoint', 'errors', 'execution_mode', 'probe_result', 'production_introspection_enabled', 'status', 'timestamp'].sort().join(',')) return false;
      return true;
    }

    // Live mode
    if (report.environment !== 'production') return false;
    if (
      !validSmtpReference(report.operator_reference) ||
      !validSmtpReference(report.authorization_reference) ||
      !validSmtpReference(report.probe_reference)
    ) {
      return false;
    }

    if (Object.keys(report).sort().join(',') !==
        ['authorization_reference', 'drill_type', 'endpoint', 'environment', 'errors', 'execution_mode', 'operator_reference', 'probe_reference', 'probe_result', 'production_introspection_enabled', 'status', 'timestamp'].sort().join(',')) return false;

    return true;
  } catch {
    return false;
  }
}

const NO_AI_JOURNEYS = ['analytics_dashboard', 'governed_report', 'export_download'];

function hasExactKeys(value, keys) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

function isNoAiPostureCandidate({ parsed } = {}) {
  // A custom-named JSON file must be checked too; a dossier cannot qualify.
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return false;
  if (Array.isArray(parsed.stages) || parsed.dossier_version !== undefined) return false;
  return true;
}

function validateNoAiPostureReport(report, now, approvedOrContext, maybeContext) {
  try {
    if (!report || typeof report !== 'object' || Array.isArray(report)) return false;
    if (report.drill_type !== 'no_ai_production_posture_verification' || report.status !== 'success') return false;
    const mode = report.execution_mode;
    if (mode !== 'simulation' && mode !== 'live') return false;

    let approved = null;
    let context = {};
    if (approvedOrContext && typeof approvedOrContext === 'object') {
      if (approvedOrContext.requireLive !== undefined || approvedOrContext.expectedSection !== undefined) {
        context = approvedOrContext;
      } else {
        approved = approvedOrContext;
        if (maybeContext && typeof maybeContext === 'object') {
          context = maybeContext;
        }
      }
    }

    const evalNow = now instanceof Date ? now : new Date();
    if (!Number.isFinite(evalNow.getTime())) return false;
    const timestamp = parseSmtpTimestamp(report.timestamp);
    if (!timestamp || timestamp > evalNow) return false;

    if (!Array.isArray(report.errors) || report.errors.length !== 0) return false;
    if (report.unpaid_provider_excluded !== true) return false;
    if (!validSmtpReference(report.provider_policy_reference)) return false;

    if (!report.runtime || typeof report.runtime !== 'object' || Array.isArray(report.runtime)) return false;
    if (!report.journeys || typeof report.journeys !== 'object' || Array.isArray(report.journeys)) return false;
    if (!hasExactKeys(report.runtime, ['api', 'worker'])) return false;
    if (!hasExactKeys(report.journeys, NO_AI_JOURNEYS)) return false;

    for (const service of ['api', 'worker']) {
      const runtime = report.runtime[service];
      if (!runtime || typeof runtime !== 'object' || Array.isArray(runtime)) return false;
      if (!hasExactKeys(runtime, ['ai_draft_enabled', 'gemini_api_key_present', 'inventory_reference']) ||
          runtime.ai_draft_enabled !== false || runtime.gemini_api_key_present !== false ||
          !validSmtpReference(runtime.inventory_reference)) return false;
    }
    for (const journey of NO_AI_JOURNEYS) {
      const result = report.journeys[journey];
      if (!result || typeof result !== 'object' || Array.isArray(result)) return false;
      if (!hasExactKeys(result, ['passed', 'test_reference']) || result.passed !== true ||
          !validSmtpReference(result.test_reference)) return false;
    }

    const secretMarkers = [];
    checkPlaceholdersAndSecrets(report, 'no_ai_posture_report', secretMarkers);
    if (secretMarkers.length > 0) return false;

    if (approved && typeof approved === 'object') {
      if (
        approved.status !== 'approved' ||
        approved.ai_enabled !== false ||
        approved.no_ai_path_verified !== true ||
        approved.server_ai_draft_enabled_false !== true ||
        approved.no_gemini_api_key_provisioned !== true ||
        approved.unpaid_provider_excluded !== true
      ) {
        return false;
      }
    }

    const requireLive = Boolean(context?.requireLive);

    if (mode === 'simulation') {
      if (requireLive) return false;
      if (!hasExactKeys(report, [
        'drill_type',
        'errors',
        'execution_mode',
        'journeys',
        'provider_policy_reference',
        'runtime',
        'status',
        'timestamp',
        'unpaid_provider_excluded',
      ])) {
        return false;
      }
      return true;
    }

    // Live mode
    if (report.environment !== 'production') return false;
    if (
      !validSmtpReference(report.operator_reference) ||
      !validSmtpReference(report.authorization_reference)
    ) {
      return false;
    }

    if (!hasExactKeys(report, [
      'authorization_reference',
      'drill_type',
      'environment',
      'errors',
      'execution_mode',
      'journeys',
      'operator_reference',
      'provider_policy_reference',
      'runtime',
      'status',
      'timestamp',
      'unpaid_provider_excluded',
    ])) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

function checkEvidenceFile(ref, category, addBlocker, baseDirs) {
  if (!['production_domain_tls', 'smtp_delivery', 'secrets_management', 'secret_references', 'data_retention_policy', 'graphql_introspection', 'deployment_and_rollback', 'volume_encryption', 'backup_and_disaster_recovery', 'optional_ai_posture'].includes(category)) {
    return checkEvidenceFileContents(ref, category, addBlocker, baseDirs);
  }
  const fail = () =>
    addBlocker(
      category,
      category === 'production_domain_tls'
        ? 'A referenced Caddy routing report is invalid or failed'
        : category === 'smtp_delivery'
        ? 'A referenced SMTP delivery report is invalid or failed'
        : category === 'volume_encryption'
        ? 'A referenced volume encryption report is invalid or failed'
        : category === 'secrets_management'
        ? 'A referenced secret rotation report is invalid or failed'
        : category === 'secret_references'
        ? 'A referenced secret-reference policy report is invalid or failed'
        : category === 'data_retention_policy'
        ? 'A referenced data retention policy report is invalid or failed'
        : category === 'graphql_introspection'
        ? 'A referenced GraphQL introspection report is invalid or failed'
        : category === 'deployment_and_rollback'
        ? 'A referenced deployment drill report is invalid or failed'
        : category === 'optional_ai_posture'
        ? 'A referenced no-AI production posture report is invalid or failed'
        : typeof ref === 'string' && (ref.includes('reconcil') || ref.includes('storage'))
        ? 'A referenced storage reconciliation report is invalid or failed'
        : 'A referenced restore drill report is invalid or failed'
    );
  try {
    // Formatting unexpected nested JSON values can itself throw. Neither the
    // exception nor any child/path diagnostic may escape this evidence boundary.
    return checkEvidenceFileContents(ref, category, fail, baseDirs);
  } catch {
    fail();
    return [];
  }
}

function checkEvidenceFileContents(ref, category, addBlocker, baseDirs) {
  if (category === 'slo_and_alerting') {
    const emit = addBlocker;
    // Even non-child dossiers and malformed custom files can contain private diagnostics.
    addBlocker = (key) => emit(key, 'A referenced capacity and alerting report is invalid or failed');
  }
  const parsedFiles = [];
  const matches = expandEvidenceGlob(ref, baseDirs);
  if (matches.length === 0) {
    addBlocker(category, `Approved evidence references file '${ref}' but no matching file exists on disk`);
    return parsedFiles;
  }
  for (const file of matches) {
    let parsed;
    try {
      parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (err) {
      addBlocker(category, `Approved evidence file '${ref}' is not valid JSON (${err.message})`);
      continue;
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      addBlocker(category, 'Approved evidence file must contain a JSON object');
      continue;
    }
    parsedFiles.push({ file, parsed });
    if (category === 'volume_encryption' && !isVolumeEncryptionCandidate({ file, parsed }) &&
        !validVolumeDossier(parsed)) {
      addBlocker(category, 'A referenced volume encryption report is invalid or failed');
    }
    if (category === 'backup_and_disaster_recovery' &&
        !isRestoreCandidate({ file, parsed }) &&
        !isReconciliationCandidate({ file, parsed }) &&
        !validRecoveryDossier(parsed)) {
      addBlocker(
        category,
        typeof ref === 'string' && (ref.includes('reconcil') || ref.includes('storage'))
          ? 'A referenced storage reconciliation report is invalid or failed'
          : 'A referenced restore drill report is invalid or failed'
      );
    }
    if (category === 'production_domain_tls') {
      if (isCaddyRoutingCandidate({ file, parsed })) {
        // The approval call below validates children with its explicit evaluation clock and live requirement.
        continue;
      }
      if (!validCaddyDossier(parsed, file) && !validCaddyStaticEvidence(parsed, file)) {
        addBlocker(category, 'A referenced Caddy routing report is invalid or failed');
        continue;
      }
    }
    if (category === 'smtp_delivery') {
      if (isSmtpDeliveryCandidate({ file, parsed })) {
        // The approval call below validates children with its explicit evaluation clock and live requirement.
        continue;
      }
      addBlocker(category, 'A referenced SMTP delivery report is invalid or failed');
      continue;
    }
    // Category 5 child failures use fixed reasons, never untrusted child diagnostics.
    if (category === 'slo_and_alerting' && isCapacityAlertingCandidate({ file, parsed })) {
      if (!validateCapacityAlertingReport(parsed)) {
        addBlocker(category, 'A referenced capacity and alerting report is invalid or failed');
      }
      continue;
    }
    if (category === 'secrets_management' && isSecretRotationCandidate({ file, parsed })) {
      // The approval call below validates children with its explicit evaluation clock.
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

    if (parsed.drill_type === 'static_integrity_verification' || path.basename(file).startsWith('static-integrity-evidence-')) {
      const result = validateStaticEvidence(parsed);
      if (!result.valid) {
        addBlocker(category, `Approved evidence file '${ref}' has invalid static integrity evidence${result.failedCheckId ? ` (${result.failedCheckId})` : ''}`);
      }
    }
    if (parsed.staticIntegrityBaseline !== undefined && parsed.staticIntegrityBaseline?.status !== 'verified') {
      addBlocker(category, `Approved evidence file '${ref}' reports static integrity baseline breach`);
    }
    if (parsed.summary?.staticIntegrityCompliance !== undefined && parsed.summary.staticIntegrityCompliance !== 'passed') {
      addBlocker(category, `Approved evidence file '${ref}' reports static integrity compliance failure`);
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

    // Caddy routing drill child evidence checks
    if (
      file.includes('caddy-routing-evidence-') ||
      file.includes('caddy-routing') ||
      parsed.drill_type === 'caddy_routing_and_tls_verification' ||
      (typeof parsed.securityHeadersVerified === 'boolean' &&
        typeof parsed.s3SigV4HostPreserved === 'boolean' &&
        Array.isArray(parsed.evaluatedRoutes))
    ) {
      if (typeof parsed.status === 'string' && parsed.status.toLowerCase() !== 'success') {
        addBlocker(category, `Approved evidence file '${ref}' reports Caddy routing verification failure (status: "${parsed.status}")`);
      }
      if (parsed.valid === false) {
        addBlocker(category, `Approved evidence file '${ref}' reports invalid Caddy routing configuration (valid: false)`);
      }
      if (parsed.hstsApproved === false) {
        addBlocker(category, `Approved evidence file '${ref}' reports HSTS was not enabled and approved (hstsApproved: false)`);
      }
      if (Array.isArray(parsed.errors) && parsed.errors.length > 0) {
        addBlocker(category, `Approved evidence file '${ref}' reports Caddy routing error(s): ${parsed.errors.join('; ')}`);
      }
      if (parsed.securityHeadersVerified === false) {
        addBlocker(category, `Approved evidence file '${ref}' reports security headers verification failure (securityHeadersVerified: false)`);
      }
      if (parsed.s3SigV4HostPreserved === false) {
        addBlocker(category, `Approved evidence file '${ref}' reports S3 SigV4 Host header preservation failure (s3SigV4HostPreserved: false)`);
      }
      if (parsed.proxyHeadersVerified === false) {
        addBlocker(category, `Approved evidence file '${ref}' reports proxy headers verification failure (proxyHeadersVerified: false)`);
      }
      if (typeof parsed.routesEvaluated === 'number' && parsed.routesEvaluated < 12) {
        addBlocker(category, `Approved evidence file '${ref}' reports insufficient routes tested (${parsed.routesEvaluated} < 12)`);
      }
      if (
        typeof parsed.routesPassed === 'number' &&
        typeof parsed.routesEvaluated === 'number' &&
        parsed.routesPassed !== parsed.routesEvaluated
      ) {
        addBlocker(
          category,
          `Approved evidence file '${ref}' reports route evaluation discrepancies (${parsed.routesPassed}/${parsed.routesEvaluated} passed)`
        );
      }
      if (Array.isArray(parsed.evaluatedRoutes)) {
        const failed = parsed.evaluatedRoutes.filter((r) => r && r.passed === false);
        if (failed.length > 0) {
          addBlocker(category, `Approved evidence file '${ref}' reports ${failed.length} failed route(s)`);
        }
      }
    }

    // Deployment & rollback drill child evidence checks
    if (
      file.includes('deployment-drill-evidence-') ||
      typeof parsed.schema_backward_compatible === 'boolean' ||
      typeof parsed.caddy_routing_verified === 'boolean' ||
      typeof parsed.rollback_procedure_verified === 'boolean'
    ) {
      if (typeof parsed.status === 'string' && parsed.status.toLowerCase() !== 'success') {
        addBlocker(category, `Approved evidence file '${ref}' reports deployment drill failure (status: "${parsed.status}")`);
      }
      if (parsed.schema_backward_compatible === false) {
        addBlocker(category, `Approved evidence file '${ref}' reports schema backward compatibility failure (schema_backward_compatible: false)`);
      }
      if (parsed.rollback_procedure_verified === false) {
        addBlocker(category, `Approved evidence file '${ref}' reports rollback procedure verification failure (rollback_procedure_verified: false)`);
      }
      if (parsed.caddy_routing_verified === false) {
        addBlocker(category, `Approved evidence file '${ref}' reports Caddy routing verification failure (caddy_routing_verified: false)`);
      }
      if (parsed.network_isolation_verified === false) {
        addBlocker(category, `Approved evidence file '${ref}' reports network isolation verification failure (network_isolation_verified: false)`);
      }
    }

    // Secret rotation drill child evidence checks
    if (
      file.includes('secret-rotation-evidence-') ||
      parsed.drill_type === 'zero_downtime_secret_rotation_and_compromise_response' ||
      (parsed.steps && typeof parsed.steps === 'object' && parsed.steps.session_rollover)
    ) {
      if (typeof parsed.status === 'string' && parsed.status.toLowerCase() !== 'success') {
        addBlocker(category, `Approved evidence file '${ref}' reports secret rotation drill failure (status: "${parsed.status}")`);
      }
      if (Array.isArray(parsed.errors) && parsed.errors.length > 0) {
        addBlocker(category, `Approved evidence file '${ref}' reports secret rotation drill error(s): ${parsed.errors.join('; ')}`);
      }
      if (parsed.steps && typeof parsed.steps === 'object') {
        const requiredSteps = [
          'session_rollover',
          'csrf_rollover',
          'database_rotation',
          'valkey_rotation',
          'storage_rotation',
          'compromise_response',
          'redaction_audit',
        ];
        for (const s of requiredSteps) {
          const stepObj = parsed.steps[s];
          if (stepObj && typeof stepObj === 'object') {
            const sStatus = typeof stepObj.status === 'string' ? stepObj.status.toLowerCase() : null;
            if (sStatus && sStatus !== 'passed') {
              addBlocker(category, `Approved evidence file '${ref}' reports secret rotation step '${s}' failure (status: "${stepObj.status}")`);
            }
          }
        }
        if (
          parsed.steps.redaction_audit &&
          typeof parsed.steps.redaction_audit === 'object' &&
          (parsed.steps.redaction_audit.raw_secrets_masked === false ||
            parsed.steps.redaction_audit.zero_dev_passwords_detected === false)
        ) {
          addBlocker(category, `Approved evidence file '${ref}' reports secret redaction or leak audit failure`);
        }
      }
    }

    // Unified Launch Evidence Dossier deployment & secret rotation baseline checks
    const depStatus = typeof parsed.deploymentBaseline?.status === 'string'
      ? parsed.deploymentBaseline.status.toLowerCase()
      : null;
    if (depStatus === 'breached' || depStatus === 'failed') {
      addBlocker(category, `Approved evidence file '${ref}' reports deployment baseline breach (deploymentBaseline.status: "${parsed.deploymentBaseline.status}")`);
    }
    const depCompliance = typeof parsed.summary?.deploymentCompliance === 'string'
      ? parsed.summary.deploymentCompliance.toLowerCase()
      : null;
    if (depCompliance === 'failed' || depCompliance === 'failure') {
      addBlocker(category, `Approved evidence file '${ref}' reports deployment compliance failure (summary.deploymentCompliance: "${parsed.summary.deploymentCompliance}")`);
    }
    const rollbackCompliance = typeof parsed.summary?.rollbackCompliance === 'string'
      ? parsed.summary.rollbackCompliance.toLowerCase()
      : null;
    if (rollbackCompliance === 'failed' || rollbackCompliance === 'failure') {
      addBlocker(category, `Approved evidence file '${ref}' reports rollback compliance failure (summary.rollbackCompliance: "${parsed.summary.rollbackCompliance}")`);
    }

    const secStatus = typeof parsed.secretRotationBaseline?.status === 'string'
      ? parsed.secretRotationBaseline.status.toLowerCase()
      : null;
    if (secStatus === 'breached' || secStatus === 'failed') {
      addBlocker(category, `Approved evidence file '${ref}' reports secret rotation baseline breach (secretRotationBaseline.status: "${parsed.secretRotationBaseline.status}")`);
    }
    const secCompliance = typeof parsed.summary?.secretRotationCompliance === 'string'
      ? parsed.summary.secretRotationCompliance.toLowerCase()
      : null;
    if (secCompliance === 'failed' || secCompliance === 'failure') {
      addBlocker(category, `Approved evidence file '${ref}' reports secret rotation compliance failure (summary.secretRotationCompliance: "${parsed.summary.secretRotationCompliance}")`);
    }

    // Volume encryption drill child evidence checks
    if (
      file.includes('volume-encryption-evidence-') ||
      parsed.drill_type === 'production_volume_encryption_and_key_separation' ||
      (parsed.keySeparation && typeof parsed.keySeparation === 'object' && Array.isArray(parsed.evaluatedMounts))
    ) {
      if (typeof parsed.status === 'string' && parsed.status.toLowerCase() !== 'success') {
        addBlocker(category, `Approved evidence file '${ref}' reports volume encryption verification failure (status: "${parsed.status}")`);
      }
      if (parsed.valid === false) {
        addBlocker(category, `Approved evidence file '${ref}' reports invalid volume encryption configuration (valid: false)`);
      }
      if (Array.isArray(parsed.errors) && parsed.errors.length > 0) {
        addBlocker(category, `Approved evidence file '${ref}' reports volume encryption error(s): ${parsed.errors.join('; ')}`);
      }
      if (parsed.keySeparation && typeof parsed.keySeparation === 'object') {
        if (parsed.keySeparation.verified === false) {
          addBlocker(category, `Approved evidence file '${ref}' reports Key Separation Invariant violation (keySeparation.verified: false)`);
        }
        if (Array.isArray(parsed.keySeparation.detectedViolations) && parsed.keySeparation.detectedViolations.length > 0) {
          addBlocker(category, `Approved evidence file '${ref}' reports ${parsed.keySeparation.detectedViolations.length} detected keyfile violation(s) in volume mounts or repository`);
        }
      }
      if (Array.isArray(parsed.evaluatedMounts)) {
        const failedMounts = parsed.evaluatedMounts.filter((m) => m && m.passed === false);
        if (failedMounts.length > 0) {
          addBlocker(category, `Approved evidence file '${ref}' reports ${failedMounts.length} failed stateful storage mount(s): ${failedMounts.map((m) => m.service + ':' + m.containerPath).join(', ')}`);
        }
      }
    }

    // Unified Launch Evidence Dossier volume encryption baseline checks
    const volStatus = typeof parsed.volumeEncryptionBaseline?.status === 'string'
      ? parsed.volumeEncryptionBaseline.status.toLowerCase()
      : null;
    if (volStatus === 'breached' || volStatus === 'failed') {
      addBlocker(category, `Approved evidence file '${ref}' reports volume encryption baseline breach (volumeEncryptionBaseline.status: "${parsed.volumeEncryptionBaseline.status}")`);
    }
    const volCompliance = typeof parsed.summary?.volumeEncryptionCompliance === 'string'
      ? parsed.summary.volumeEncryptionCompliance.toLowerCase()
      : null;
    if (volCompliance === 'failed' || volCompliance === 'failure') {
      addBlocker(category, `Approved evidence file '${ref}' reports volume encryption compliance failure (summary.volumeEncryptionCompliance: "${parsed.summary.volumeEncryptionCompliance}")`);
    }

    // Capacity & alerting drill child evidence checks
    if (
      file.includes('capacity-alerting-drill-evidence-') ||
      file.includes('capacity-alerting') ||
      parsed.drill_type === 'capacity_and_prometheus_alerting_drill' ||
      (parsed.summary &&
        typeof parsed.summary === 'object' &&
        typeof parsed.alerts === 'object' &&
        typeof parsed.capacity === 'object' &&
        typeof parsed.dosResilience === 'object')
    ) {
      if (typeof parsed.status === 'string' && parsed.status.toLowerCase() !== 'success') {
        addBlocker(category, `Approved evidence file '${ref}' reports capacity and alerting drill failure (status: "${parsed.status}")`);
      }
      if (parsed.summary && typeof parsed.summary === 'object') {
        if (typeof parsed.summary.alertVerification === 'string' && parsed.summary.alertVerification.toLowerCase() !== 'passed') {
          addBlocker(category, `Approved evidence file '${ref}' reports alert verification failure (summary.alertVerification: "${parsed.summary.alertVerification}")`);
        }
        if (typeof parsed.summary.capacitySloCompliance === 'string' && parsed.summary.capacitySloCompliance.toLowerCase() !== 'passed') {
          addBlocker(category, `Approved evidence file '${ref}' reports capacity SLO compliance failure (summary.capacitySloCompliance: "${parsed.summary.capacitySloCompliance}")`);
        }
        if (typeof parsed.summary.dosResilience === 'string' && parsed.summary.dosResilience.toLowerCase() !== 'passed') {
          addBlocker(category, `Approved evidence file '${ref}' reports DoS resilience failure (summary.dosResilience: "${parsed.summary.dosResilience}")`);
        }
        if (typeof parsed.summary.databaseBaselineCompliance === 'string' && parsed.summary.databaseBaselineCompliance.toLowerCase() !== 'passed') {
          addBlocker(category, `Approved evidence file '${ref}' reports database baseline compliance failure (summary.databaseBaselineCompliance: "${parsed.summary.databaseBaselineCompliance}")`);
        }
      }
      if (parsed.alerts && typeof parsed.alerts === 'object') {
        if (parsed.alerts.valid === false) {
          addBlocker(category, `Approved evidence file '${ref}' reports alert verification invalid (alerts.valid: false)`);
        }
        if (typeof parsed.alerts.ruleCount === 'number' && parsed.alerts.ruleCount < 11) {
          addBlocker(category, `Approved evidence file '${ref}' reports insufficient alert rules tested (alerts.ruleCount: ${parsed.alerts.ruleCount})`);
        }
        if (Array.isArray(parsed.alerts.simulations)) {
          const failedSims = parsed.alerts.simulations.filter((s) => s && s.passed === false);
          if (failedSims.length > 0) {
            addBlocker(category, `Approved evidence file '${ref}' reports ${failedSims.length} failed alert simulation(s)`);
          }
        }
      }
      if (parsed.capacity && typeof parsed.capacity === 'object') {
        if (parsed.capacity.compliance && typeof parsed.capacity.compliance === 'object') {
          if (parsed.capacity.compliance.overallPassed === false) {
            addBlocker(category, `Approved evidence file '${ref}' reports capacity SLO overall compliance failure`);
          }
          if (parsed.capacity.compliance.availabilityPassed === false) {
            addBlocker(category, `Approved evidence file '${ref}' reports availability SLO compliance failure`);
          }
          if (parsed.capacity.compliance.latencyPassed === false) {
            addBlocker(category, `Approved evidence file '${ref}' reports latency SLO compliance failure`);
          }
          if (parsed.capacity.compliance.throughputPassed === false) {
            addBlocker(category, `Approved evidence file '${ref}' reports throughput SLO compliance failure`);
          }
          if (parsed.capacity.compliance.databaseAcquisitionLatencyPassed === false) {
            addBlocker(category, `Approved evidence file '${ref}' reports database pool acquisition latency SLO compliance failure`);
          }
          if (parsed.capacity.compliance.databaseQueryLatencyPassed === false) {
            addBlocker(category, `Approved evidence file '${ref}' reports database query execution latency SLO compliance failure`);
          }
        }
      }
      if (parsed.databaseTelemetryBaseline && typeof parsed.databaseTelemetryBaseline === 'object') {
        if (typeof parsed.databaseTelemetryBaseline.status === 'string' && parsed.databaseTelemetryBaseline.status.toLowerCase() !== 'verified') {
          addBlocker(category, `Approved evidence file '${ref}' reports database baseline failure (databaseTelemetryBaseline.status: "${parsed.databaseTelemetryBaseline.status}")`);
        }
      }
      if (parsed.dosResilience && typeof parsed.dosResilience === 'object') {
        if (typeof parsed.dosResilience.status === 'string' && parsed.dosResilience.status.toLowerCase() !== 'success') {
          addBlocker(category, `Approved evidence file '${ref}' reports DoS resilience failure (dosResilience.status: "${parsed.dosResilience.status}")`);
        }
      }
      if (Array.isArray(parsed.failures) && parsed.failures.length > 0) {
        addBlocker(category, `Approved evidence file '${ref}' reports ${parsed.failures.length} capacity and alerting failure(s)`);
      }
    }

    // SAST drill child evidence checks
    if (
      file.includes('sast-scan-evidence-') ||
      file.includes('sast-evidence-') ||
      parsed.drill_type === 'sast_security_scan' ||
      (Array.isArray(parsed.blockingActiveFindings) && typeof parsed.passed === 'boolean')
    ) {
      if (typeof parsed.status === 'string' && parsed.status.toLowerCase() !== 'success') {
        addBlocker(category, `Approved evidence file '${ref}' reports SAST scan verification failure (status: "${parsed.status}")`);
      }
      if (parsed.passed === false) {
        addBlocker(category, `Approved evidence file '${ref}' reports SAST scan failure (passed: false)`);
      }
      if (Array.isArray(parsed.blockingActiveFindings) && parsed.blockingActiveFindings.length > 0) {
        addBlocker(category, `Approved evidence file '${ref}' reports ${parsed.blockingActiveFindings.length} active unreviewed SAST blocker finding(s)`);
      }
      if (Array.isArray(parsed.expiredFindings) && parsed.expiredFindings.length > 0) {
        addBlocker(category, `Approved evidence file '${ref}' reports ${parsed.expiredFindings.length} expired SAST suppression(s) (fail-closed)`);
      }
    }

    // SBOM drill child evidence checks
    if (
      file.includes('sbom-inventory-') ||
      file.includes('sbom-evidence-') ||
      parsed.bomFormat === 'CycloneDX' ||
      parsed.licenseCompliance !== undefined
    ) {
      if (!parsed.licenseCompliance || typeof parsed.licenseCompliance !== 'object') {
        addBlocker(category, `Approved evidence file '${ref}' missing license compliance verification (licenseCompliance object required)`);
      } else {
        if (parsed.licenseCompliance.compliant === false) {
          addBlocker(category, `Approved evidence file '${ref}' reports SBOM license compliance failure (licenseCompliance.compliant: false)`);
        }
        if (Array.isArray(parsed.licenseCompliance.violations) && parsed.licenseCompliance.violations.length > 0) {
          addBlocker(category, `Approved evidence file '${ref}' reports ${parsed.licenseCompliance.violations.length} SBOM license compliance violation(s): ${parsed.licenseCompliance.violations.map((v) => v.component + ' (' + v.license + ')').join(', ')}`);
        }
      }
      if (Array.isArray(parsed.licenseViolations) && parsed.licenseViolations.length > 0) {
        addBlocker(category, `Approved evidence file '${ref}' reports ${parsed.licenseViolations.length} SBOM license violation(s)`);
      }
    }

    // Container security drill child evidence checks
    if (
      file.includes('container-security-evidence-') ||
      parsed.drill_type === 'container_security_verification' ||
      (Array.isArray(parsed.checks) && typeof parsed.valid === 'boolean')
    ) {
      if (typeof parsed.status === 'string' && parsed.status.toLowerCase() !== 'success') {
        addBlocker(category, `Approved evidence file '${ref}' reports container security verification failure (status: "${parsed.status}")`);
      }
      if (parsed.valid === false) {
        addBlocker(category, `Approved evidence file '${ref}' reports invalid container security configuration (valid: false)`);
      }
      if (Array.isArray(parsed.errors) && parsed.errors.length > 0) {
        addBlocker(category, `Approved evidence file '${ref}' reports container security error(s): ${parsed.errors.join('; ')}`);
      }
      if (Array.isArray(parsed.checks)) {
        const failedChecks = parsed.checks.filter((c) => c && c.passed === false);
        if (failedChecks.length > 0) {
          addBlocker(category, `Approved evidence file '${ref}' reports ${failedChecks.length} failed container security check(s): ${failedChecks.map((c) => '[' + c.target + '] ' + c.check).join(', ')}`);
        }
      }
    }

    // Unified Launch Evidence Dossier supply chain baseline checks
    const scStatus = typeof parsed.supplyChainBaseline?.status === 'string'
      ? parsed.supplyChainBaseline.status.toLowerCase()
      : null;
    if (scStatus === 'breached' || scStatus === 'failed') {
      addBlocker(category, `Approved evidence file '${ref}' reports supply chain security baseline breach (supplyChainBaseline.status: "${parsed.supplyChainBaseline.status}")`);
    }
    const scCompliance = typeof parsed.summary?.supplyChainCompliance === 'string'
      ? parsed.summary.supplyChainCompliance.toLowerCase()
      : null;
    if (scCompliance === 'failed' || scCompliance === 'failure') {
      addBlocker(category, `Approved evidence file '${ref}' reports supply chain security compliance failure (summary.supplyChainCompliance: "${parsed.summary.supplyChainCompliance}")`);
    }
    const sastCompliance = typeof parsed.summary?.sastCompliance === 'string'
      ? parsed.summary.sastCompliance.toLowerCase()
      : null;
    if (sastCompliance === 'failed' || sastCompliance === 'failure') {
      addBlocker(category, `Approved evidence file '${ref}' reports SAST scan compliance failure (summary.sastCompliance: "${parsed.summary.sastCompliance}")`);
    }
    const containerSecCompliance = typeof parsed.summary?.containerSecurityCompliance === 'string'
      ? parsed.summary.containerSecurityCompliance.toLowerCase()
      : null;
    if (containerSecCompliance === 'failed' || containerSecCompliance === 'failure') {
      addBlocker(category, `Approved evidence file '${ref}' reports container security compliance failure (summary.containerSecurityCompliance: "${parsed.summary.containerSecurityCompliance}")`);
    }
  }
  return parsedFiles;
}

function validateReadiness(record, _filePath, options = {}) {
  const categoryBlockers = {};
  let totalApproved = 0;
  const recoveryEvidence = [];
  const volumeEvidence = [];
  const secretEvidence = [];
  const deploymentEvidence = [];
  const capacityEvidence = [];
  const caddyEvidence = [];
  const smtpEvidence = [];
  const secretReferenceEvidence = [];
  const retentionEvidence = [];
  const graphqlEvidence = [];
  const noAiEvidence = [];
  const now = options.now instanceof Date ? options.now : new Date();

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
            const parsedFiles = checkEvidenceFile(ev.trim(), sectionName, addBlocker, baseDirs);
            if (sectionName === 'backup_and_disaster_recovery') recoveryEvidence.push(...parsedFiles);
            if (sectionName === 'volume_encryption') volumeEvidence.push(...parsedFiles);
            if (sectionName === 'secrets_management') secretEvidence.push(...parsedFiles);
            if (sectionName === 'deployment_and_rollback') deploymentEvidence.push(...parsedFiles);
            if (sectionName === 'slo_and_alerting') capacityEvidence.push(...parsedFiles);
            if (sectionName === 'production_domain_tls') caddyEvidence.push(...parsedFiles);
            if (sectionName === 'smtp_delivery') smtpEvidence.push(...parsedFiles);
            if (sectionName === 'secret_references') secretReferenceEvidence.push(...parsedFiles);
            if (sectionName === 'data_retention_policy') retentionEvidence.push(...parsedFiles);
            if (sectionName === 'graphql_introspection') graphqlEvidence.push(...parsedFiles);
            if (sectionName === 'optional_ai_posture') noAiEvidence.push(...parsedFiles);
          }
        });
      }
    }
  }

  // 3. Category-specific validations

  // 3.1 production_domain_tls
  const domainSec = sections.production_domain_tls;
  if (domainSec && domainSec.status === 'approved') {
    const rawDomain = typeof domainSec.domain === 'string' ? domainSec.domain.trim() : '';
    const isIpAddress = /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/.test(rawDomain) || rawDomain.includes(':');
    const hasProtocol = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(rawDomain);
    const hasUriParts = /[\/\?#\s]/.test(rawDomain);
    const fqdnPattern = /^([a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;
    const isValidFqdn =
      fqdnPattern.test(rawDomain) &&
      !rawDomain.includes('localhost') &&
      !rawDomain.includes('127.0.0.1') &&
      !isIpAddress &&
      !hasProtocol &&
      !hasUriParts;

    if (!isValidFqdn) {
      addBlocker(
        'production_domain_tls',
        `Production domain must be a valid fully qualified domain name (received: "${domainSec.domain}")`
      );
    }

    const rawEmail = typeof domainSec.tls_contact_email === 'string' ? domainSec.tls_contact_email.trim() : '';
    const emailPattern = /^[a-zA-Z0-9._%+-]+@([a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;
    const localPart = rawEmail.split('@')[0];
    const isValidEmail =
      rawEmail.length <= 254 &&
      localPart.length <= 64 &&
      emailPattern.test(rawEmail) &&
      !localPart.startsWith('.') &&
      !localPart.endsWith('.') &&
      !rawEmail.includes('..') &&
      !rawEmail.includes('__REQUIRED_');

    if (!isValidEmail) {
      addBlocker('production_domain_tls', `TLS contact email is missing or invalid: "${domainSec.tls_contact_email}"`);
    }

    if (domainSec.hsts_approved !== true) {
      addBlocker('production_domain_tls', 'HSTS approval must be explicitly confirmed (hsts_approved: true)');
    }

    if (typeof domainSec.custom_certificates !== 'boolean') {
      addBlocker(
        'production_domain_tls',
        'Field "custom_certificates" must be explicitly defined as a boolean (true or false)'
      );
    }

    const caddyCandidates = caddyEvidence.filter(isCaddyRoutingCandidate);
    if (caddyCandidates.length === 0) {
      addBlocker('production_domain_tls', 'A successful Caddy routing and TLS verification child JSON report is required');
    } else {
      if (caddyCandidates.some(({ parsed }) => !validateCaddyRoutingReport(parsed, now, rawDomain, { expectedSection: domainSec }))) {
        addBlocker('production_domain_tls', 'A referenced Caddy routing report is invalid or failed');
      }
      if (!caddyCandidates.some(({ parsed }) => validateCaddyRoutingReport(parsed, now, rawDomain, { requireLive: true, expectedSection: domainSec }))) {
        addBlocker('production_domain_tls', 'A live Caddy routing and TLS verification operator receipt is required');
      }
    }
  }

  // 3.2 smtp_delivery
  const smtpSec = sections.smtp_delivery;
  if (smtpSec && smtpSec.status === 'approved') {
    if (!validSmtpText(smtpSec.provider)) {
      addBlocker('smtp_delivery', 'SMTP provider is required');
    }
    if (!validSmtpText(smtpSec.host)) {
      addBlocker('smtp_delivery', 'SMTP host is required');
    }
    if (!Number.isInteger(smtpSec.port) || smtpSec.port <= 0 || smtpSec.port > 65535) {
      addBlocker('smtp_delivery', `SMTP port must be a valid port number (received: ${smtpSec.port})`);
    }
    if (!['STARTTLS', 'TLS'].includes(smtpSec.tls_mode)) {
      addBlocker('smtp_delivery', 'SMTP tls_mode must be STARTTLS or TLS');
    }
    if (!validSmtpEmail(smtpSec.from_address)) {
      addBlocker('smtp_delivery', `SMTP from_address is invalid: "${smtpSec.from_address}"`);
    }
    if (!validSmtpSecretReference(smtpSec.credentials_source_reference) ||
        smtpSec.credentials_source_reference !== sections.secret_references?.smtp_secret_source) {
      addBlocker('smtp_delivery', 'SMTP credentials source reference must match the approved secret reference');
    }
    if (!validSmtpText(smtpSec.delivery_policy)) {
      addBlocker('smtp_delivery', 'SMTP delivery policy description is required');
    }
    if (!validSmtpText(smtpSec.bounce_abuse_handling)) {
      addBlocker('smtp_delivery', 'SMTP bounce/abuse handling procedure reference is required');
    }
    const smtpCandidates = smtpEvidence.filter(isSmtpDeliveryCandidate);
    if (smtpCandidates.length === 0) {
      addBlocker('smtp_delivery', 'A successful SMTP delivery and DNS verification child JSON report is required');
    } else {
      if (smtpCandidates.some(({ parsed }) => !validateSmtpDeliveryReport(parsed, now, smtpSec))) {
        addBlocker('smtp_delivery', 'A referenced SMTP delivery report is invalid or failed');
      }
      if (!smtpCandidates.some(({ parsed }) => validateSmtpDeliveryReport(parsed, now, smtpSec, { requireLive: true }))) {
        addBlocker('smtp_delivery', 'A live SMTP delivery verification operator receipt is required');
      }
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
    if (
      typeof secMgmt.rotation_cadence_days !== 'number' ||
      !Number.isFinite(secMgmt.rotation_cadence_days) ||
      secMgmt.rotation_cadence_days <= 0 ||
      secMgmt.rotation_cadence_days > 90
    ) {
      addBlocker(
        'secrets_management',
        `Rotation cadence (in days) must be a positive number <= 90 days (received: ${secMgmt.rotation_cadence_days})`
      );
    }
    if (!secMgmt.compromise_response_plan || typeof secMgmt.compromise_response_plan !== 'string') {
      addBlocker('secrets_management', 'Compromise response runbook reference is required');
    }
    const secretCandidates = secretEvidence.filter(isSecretRotationCandidate);
    if (secretCandidates.length === 0) {
      addBlocker('secrets_management', 'A successful secret rotation child JSON report is required');
    } else {
      if (secretCandidates.some(({ parsed }) => !validateSecretRotationReport(parsed, now))) {
        addBlocker('secrets_management', 'A referenced secret rotation report is invalid or failed');
      }
      if (!secretCandidates.some(({ parsed }) => validateSecretRotationReport(parsed, now, { requireLive: true }))) {
        addBlocker('secrets_management', 'A live production secret rotation operator receipt is required');
      }
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
      } else if (secRefs.status === 'approved' && !validSmtpSecretReference(val)) {
        addBlocker('secret_references', `Field '${key}' must be an indirect secret-store reference`);
      }
    }
    if (secRefs.status === 'approved') {
      const candidates = secretReferenceEvidence.filter(isSecretReferencePolicyCandidate);
      if (candidates.length === 0) {
        addBlocker('secret_references', 'A successful secret-reference policy child JSON report is required');
      } else {
        if (candidates.some(({ parsed }) => !validateSecretReferencePolicyReport(parsed, now, secRefs))) {
          addBlocker('secret_references', 'A referenced secret-reference policy report is invalid or failed');
        }
        if (!candidates.some(({ parsed }) => validateSecretReferencePolicyReport(parsed, now, secRefs, { requireLive: true }))) {
          addBlocker('secret_references', 'A live secret-reference policy operator receipt is required');
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
    const capacityCandidates = capacityEvidence.filter(isCapacityAlertingCandidate);
    if (capacityCandidates.length === 0) {
      addBlocker('slo_and_alerting', 'A successful capacity and alerting drill child JSON report is required');
    } else if (capacityCandidates.some(({ parsed }) => !validateCapacityAlertingReport(parsed, now, { section: sloSec, requireLive: true }))) {
      addBlocker('slo_and_alerting', 'A referenced capacity and alerting report is invalid or failed');
    }
  }

  // 3.6 backup_and_disaster_recovery
  const bdrSec = sections.backup_and_disaster_recovery;
  if (bdrSec && bdrSec.status === 'approved') {
    const invalidRpo =
      typeof bdrSec.rpo_hours !== 'number' ||
      !Number.isFinite(bdrSec.rpo_hours) ||
      bdrSec.rpo_hours <= 0 ||
      bdrSec.rpo_hours > 1;
    if (invalidRpo) {
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
    if (
      !bdrSec.backup_destination ||
      typeof bdrSec.backup_destination !== 'string' ||
      !validRecoveryReference(bdrSec.backup_destination)
    ) {
      addBlocker('backup_and_disaster_recovery', 'Off-host backup destination is required');
    }
    const schedule = parseBackupScheduleCron(bdrSec.backup_schedule_cron);
    if (!schedule.valid) {
      addBlocker('backup_and_disaster_recovery', 'Backup schedule must use a supported every-hour UTC cron expression');
    } else if (!invalidRpo && schedule.maxGapMinutes > bdrSec.rpo_hours * 60) {
      addBlocker('backup_and_disaster_recovery', 'Backup schedule maximum start gap exceeds the declared RPO');
    }
    if (bdrSec.restore_drill_completed !== true) {
      addBlocker('backup_and_disaster_recovery', 'Restore drill must be verified and completed (restore_drill_completed: true)');
    }
    const declaredDate = typeof bdrSec.restore_drill_date === 'string'
      ? parseUtcDate(bdrSec.restore_drill_date) : null;
    if (!declaredDate || declaredDate.getTime() > now.getTime()) {
      addBlocker('backup_and_disaster_recovery', 'Restore drill date must be a valid, nonfuture UTC date');
    }
    const restoreCandidates = recoveryEvidence.filter(isRestoreCandidate);
    if (restoreCandidates.length === 0) {
      addBlocker('backup_and_disaster_recovery', 'A successful restore drill child JSON report is required');
    } else {
      if (
        restoreCandidates.some(
          ({ parsed }) =>
            !validateRestoreReport(parsed, now),
        )
      ) {
        addBlocker('backup_and_disaster_recovery', 'A referenced restore drill report is invalid or failed');
      }
      if (
        !restoreCandidates.some(({ parsed }) =>
          validateRestoreReport(parsed, now, {
            requireLive: true,
            expectedSection: bdrSec,
          }),
        )
      ) {
        addBlocker('backup_and_disaster_recovery', 'A live disaster recovery restore operator receipt is required');
      }
      const valid = restoreCandidates
        .map(({ parsed }) => validateRestoreReport(parsed, now))
        .filter(Boolean);
      if (valid.length > 0 && declaredDate) {
        const latest = valid.reduce((max, date) => (date > max ? date : max));
        if (declaredDate.toISOString().slice(0, 10) !== latest.toISOString().slice(0, 10)) {
          addBlocker('backup_and_disaster_recovery', 'Restore drill date does not match the latest successful report UTC date');
        }
      }
    }
    if (bdrSec.db_object_reconciliation_tested !== true) {
      addBlocker('backup_and_disaster_recovery', 'PostgreSQL and Garage object storage reconciliation drill must be verified (db_object_reconciliation_tested: true)');
    }
    const reconciliationCandidates = recoveryEvidence.filter(isReconciliationCandidate);
    if (reconciliationCandidates.length === 0) {
      addBlocker('backup_and_disaster_recovery', 'A successful storage reconciliation child JSON report is required');
    } else {
      if (
        reconciliationCandidates.some(
          ({ parsed }) =>
            !validateReconciliationReport(parsed, now, { expectedSection: bdrSec }),
        )
      ) {
        addBlocker('backup_and_disaster_recovery', 'A referenced storage reconciliation report is invalid or failed');
      }
      if (
        !reconciliationCandidates.some(({ parsed }) =>
          validateReconciliationReport(parsed, now, {
            requireLive: true,
            expectedSection: bdrSec,
          }),
        )
      ) {
        addBlocker('backup_and_disaster_recovery', 'A live storage reconciliation operator receipt is required');
      }
    }
  }

  // 3.7 data_retention_policy
  const retSec = sections.data_retention_policy;
  if (retSec && retSec.status === 'approved') {
    for (const p of REQUIRED_RETENTION_KEYS) {
      if (!retSec[p] || typeof retSec[p] !== 'string') {
        addBlocker('data_retention_policy', `Retention policy definition for '${p}' is required`);
      }
    }
    if (retSec.upload_quarantine_retention_policy !== '7d') {
      addBlocker('data_retention_policy', "upload_quarantine_retention_policy must be '7d'");
    }
    if (retSec.rejected_object_retention_policy !== '1d') {
      addBlocker('data_retention_policy', "rejected_object_retention_policy must be '1d'");
    }
    if (retSec.export_retention_policy !== '30d') {
      addBlocker('data_retention_policy', "export_retention_policy must be '30d'");
    }
    if (retSec.telemetry_retention_policy !== '15d') {
      addBlocker('data_retention_policy', "telemetry_retention_policy must be '15d'");
    }
    if (retSec.backup_retention_policy !== '30d') {
      addBlocker('data_retention_policy', "backup_retention_policy must be '30d'");
    }
    if (typeof retSec.account_retention_policy === 'string') {
      const valid = /^[1-9]\d*d$/.test(retSec.account_retention_policy) ||
        retSec.account_retention_policy === 'indefinite_until_tenant_deletion';
      if (!valid) {
        addBlocker('data_retention_policy', "account_retention_policy must be a positive day duration (e.g. '365d') or 'indefinite_until_tenant_deletion'");
      }
    }
    if (typeof retSec.audit_retention_policy === 'string') {
      const valid = /^[1-9]\d*d$/.test(retSec.audit_retention_policy);
      if (!valid) {
        addBlocker('data_retention_policy', "audit_retention_policy must be a positive day duration (e.g. '730d')");
      }
    }
    if (typeof retSec.report_retention_policy === 'string') {
      const valid = /^[1-9]\d*d$/.test(retSec.report_retention_policy) ||
        retSec.report_retention_policy === 'indefinite_until_tenant_deletion';
      if (!valid) {
        addBlocker('data_retention_policy', "report_retention_policy must be a positive day duration (e.g. '365d') or 'indefinite_until_tenant_deletion'");
      }
    }

    const retentionCandidates = retentionEvidence.filter(isDataRetentionPolicyCandidate);
    if (retentionCandidates.length === 0) {
      addBlocker('data_retention_policy', 'A successful data retention policy child JSON report is required');
    } else {
      if (retentionCandidates.some(({ parsed }) => !validateDataRetentionPolicyReport(parsed, now, retSec))) {
        addBlocker('data_retention_policy', 'A referenced data retention policy report is invalid or failed');
      }
      if (!retentionCandidates.some(({ parsed }) => validateDataRetentionPolicyReport(parsed, now, retSec, { requireLive: true }))) {
        addBlocker('data_retention_policy', 'A live data retention policy operator receipt is required');
      }
    }
  }

  // 3.8 volume_encryption
  const encSec = sections.volume_encryption;
  if (encSec && encSec.status === 'approved') {
    if (
      !validVolumeReference(encSec.encryption_mechanism) ||
      !isApprovedMechanism(encSec.encryption_mechanism)
    ) {
      addBlocker(
        'volume_encryption',
        'Production volume encryption mechanism must be concrete and approved',
      );
    }
    if (!validVolumePaths(encSec.encrypted_mount_paths)) {
      addBlocker(
        'volume_encryption',
        'Encrypted mount paths must include at least 3 unique concrete absolute directory paths',
      );
    }
    if (encSec.key_separation_confirmed !== true) {
      addBlocker(
        'volume_encryption',
        'Key separation from data/backups must be explicitly confirmed (key_separation_confirmed: true)',
      );
    }
    if (!validVolumeReference(encSec.key_recovery_owner)) {
      addBlocker(
        'volume_encryption',
        'Key recovery owner must be concrete and designated',
      );
    }
    const volumeCandidates = volumeEvidence.filter(isVolumeEncryptionCandidate);
    if (
      volumeCandidates.some(
        ({ parsed }) =>
          !validateVolumeEncryptionReport(parsed, now, {
            expectedSection: encSec,
          }),
      )
    ) {
      addBlocker(
        'volume_encryption',
        'A referenced volume encryption report is invalid or failed',
      );
    }
    if (
      !volumeCandidates.some(({ parsed }) =>
        validateVolumeEncryptionReport(parsed, now, {
          requireLive: true,
          expectedSection: encSec,
        }),
      )
    ) {
      addBlocker(
        'volume_encryption',
        'A successful live volume encryption child JSON report matching the approved configuration is required',
      );
    }
  }

  // 3.9 graphql_introspection
  const gqlSec = sections.graphql_introspection;
  if (gqlSec && gqlSec.status === 'approved') {
    if (typeof gqlSec.production_introspection_enabled !== 'boolean') {
      addBlocker('graphql_introspection', 'production_introspection_enabled must be a boolean');
    }
    if (gqlSec.production_introspection_enabled === true && (!gqlSec.justification || typeof gqlSec.justification !== 'string' || !gqlSec.justification.trim() || gqlSec.justification.includes('__REQUIRED_'))) {
      addBlocker('graphql_introspection', 'Production GraphQL introspection enabled requires justification');
    }
    const graphqlCandidates = graphqlEvidence.filter(isGraphqlIntrospectionCandidate);
    if (graphqlCandidates.length === 0) {
      addBlocker('graphql_introspection', 'A successful GraphQL introspection probe child JSON report is required');
    } else {
      if (graphqlCandidates.some(({ parsed }) => !validateGraphqlIntrospectionReport(parsed, now, gqlSec))) {
        addBlocker('graphql_introspection', 'A referenced GraphQL introspection report is invalid or failed');
      }
      if (!graphqlCandidates.some(({ parsed }) => validateGraphqlIntrospectionReport(parsed, now, gqlSec, { requireLive: true }))) {
        addBlocker('graphql_introspection', 'A live GraphQL introspection probe operator receipt is required');
      }
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
        if (!external) {
          const parsedFiles = checkEvidenceFile(ref, category, addBlocker, baseDirs);
          if (field === 'live_drill_evidence') {
            deploymentEvidence.push(...parsedFiles);
          }
        }
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
    const deploymentCandidates = deploymentEvidence.filter(isDeploymentDrillCandidate);
    if (deploymentCandidates.length === 0) {
      addBlocker('deployment_and_rollback', 'A successful deployment drill child JSON report is required');
    } else if (deploymentCandidates.some(({ parsed }) => !validateDeploymentDrillReport(parsed, now, { expectedRelease: release }))) {
      addBlocker('deployment_and_rollback', 'A referenced deployment drill report is invalid or failed');
    } else if (!deploymentCandidates.some(({ parsed }) => validateDeploymentDrillReport(parsed, now, { requireLive: true, expectedRelease: release }))) {
      addBlocker('deployment_and_rollback', 'A live deployment drill child bound to the approved release is required');
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
      const noAiCandidates = noAiEvidence.filter(isNoAiPostureCandidate);
      if (noAiCandidates.length === 0) {
        addBlocker('optional_ai_posture', 'A successful no-AI production posture child JSON report is required');
      } else {
        if (noAiCandidates.some(({ parsed }) => !validateNoAiPostureReport(parsed, now, aiSec))) {
          addBlocker('optional_ai_posture', 'A referenced no-AI production posture report is invalid or failed');
        }
        if (!noAiCandidates.some(({ parsed }) => validateNoAiPostureReport(parsed, now, aiSec, { requireLive: true }))) {
          addBlocker('optional_ai_posture', 'A live no-AI production posture operator receipt is required');
        }
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
  parseBackupScheduleCron,
  checkPlaceholdersAndSecrets,
  REQUIRED_SECTIONS,
  REQUIRED_SECRET_KEYS,
  DEV_PASSWORDS,
  isVolumeEncryptionCandidate,
  validateVolumeEncryptionReport,
  isSecretRotationCandidate,
  validateSecretRotationReport,
  SECRET_ROTATION_STEPS,
  SECRET_ROTATION_CLASSES,
  isDeploymentDrillCandidate,
  validateDeploymentDrillReport,
  DEPLOYMENT_DRAIN_PERIODS,
  isCapacityAlertingCandidate,
  parseCapacityAlertingTimestamp,
  validateCapacityAlertingReport,
  isCaddyRoutingCandidate,
  parseCaddyRoutingTimestamp,
  validateCaddyRoutingReport,
  isSmtpDeliveryCandidate,
  validSmtpReference,
  validateSmtpDeliveryReport,
  isSecretReferencePolicyCandidate,
  validateSecretReferencePolicyReport,
  REQUIRED_RETENTION_KEYS,
  isDataRetentionPolicyCandidate,
  validateDataRetentionPolicyReport,
  isGraphqlIntrospectionCandidate,
  validateGraphqlIntrospectionReport,
  isNoAiPostureCandidate,
  validateNoAiPostureReport,
  isRestoreCandidate,
  validateRestoreReport,
  isReconciliationCandidate,
  validateReconciliationReport,
  RECONCILIATION_COUNTS,
};
