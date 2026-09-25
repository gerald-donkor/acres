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
const { validateStaticEvidence } = require('./run-static-integrity-checks');

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

function validateRestoreReport(report, now) {
  if (!report || typeof report !== 'object' || Array.isArray(report)) return null;
  if (typeof report.drill_timestamp !== 'string') return null;
  const timestamp = parseUtcDate(report.drill_timestamp, true);
  if (!timestamp || timestamp.getTime() > now.getTime() || report.status !== 'success' ||
      report.rto_compliant !== true || report.record_parity_verified !== true ||
      report.postgis_verified !== true || report.foreign_keys_verified !== true) return null;
  for (const key of ['tables_source', 'tables_restored', 'migrations_source', 'migrations_restored']) {
    if (!Number.isSafeInteger(report[key]) || report[key] < 0) return null;
  }
  if (report.tables_source !== report.tables_restored ||
      report.migrations_source !== report.migrations_restored ||
      !Number.isSafeInteger(report.backup_bytes) || report.backup_bytes <= 0 ||
      typeof report.duration_ms !== 'number' || !Number.isFinite(report.duration_ms) ||
      report.duration_ms < 0) return null;
  return timestamp;
}

const RECONCILIATION_COUNTS = [
  'totalDatabaseObjects', 'activeDatabaseObjects', 'pendingOrDeletedExcluded',
  'totalBucketObjects', 'matchedObjects', 'missingObjects', 'orphanObjects',
  'mismatchedObjects',
];

function isReconciliationCandidate({ file, parsed }) {
  const name = path.basename(file);
  if (name.includes('reconcile-report-') || name.includes('reconciliation-report')) return true;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return false;
  return RECONCILIATION_COUNTS.some((key) =>
    parsed.summary && typeof parsed.summary === 'object' && key in parsed.summary) ||
    ['matched', 'missing', 'orphans', 'mismatches'].some((key) => key in parsed);
}

function validateReconciliationReport(report, now) {
  if (!report || typeof report !== 'object' || Array.isArray(report) ||
      typeof report.timestamp !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(report.timestamp)) return false;
  const timestamp = new Date(report.timestamp);
  if (!Number.isFinite(timestamp.getTime()) || timestamp.toISOString() !== report.timestamp ||
      timestamp.getTime() > now.getTime()) return false;
  const summary = report.summary;
  if (!summary || typeof summary !== 'object' || Array.isArray(summary) ||
      RECONCILIATION_COUNTS.some((key) => !Number.isSafeInteger(summary[key]) || summary[key] < 0)) return false;
  for (const [count, collection] of [
    ['matchedObjects', 'matched'], ['missingObjects', 'missing'],
    ['orphanObjects', 'orphans'], ['mismatchedObjects', 'mismatches'],
  ]) {
    if (!Array.isArray(report[collection]) || summary[count] !== report[collection].length) return false;
  }
  return summary.missingObjects === 0 && summary.mismatchedObjects === 0 &&
    summary.exitCode === 0 &&
    (summary.orphanObjects === 0 ? summary.status === 'clean' : summary.status === 'warning');
}

function isVolumeEncryptionCandidate({ file, parsed } = {}) {
  const name = typeof file === 'string' ? path.basename(file) : '';
  if (name.includes('volume-encryption-evidence-') || name.includes('volume-encryption')) return true;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return false;
  return parsed.drill_type === 'production_volume_encryption_and_key_separation' ||
    (parsed.keySeparation && typeof parsed.keySeparation === 'object' && Array.isArray(parsed.evaluatedMounts));
}

function validateVolumeEncryptionReport(report, now) {
  if (!report || typeof report !== 'object' || Array.isArray(report) ||
      typeof report.timestamp !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/.test(report.timestamp)) return false;
  const timestamp = new Date(report.timestamp);
  const evalNow = now instanceof Date ? now : new Date();
  if (!Number.isFinite(timestamp.getTime()) || timestamp.toISOString() !== report.timestamp ||
      timestamp.getTime() > evalNow.getTime()) return false;
  if (report.status !== 'success' || report.valid !== true) return false;
  if (!Array.isArray(report.errors) || report.errors.length > 0) return false;
  const keySep = report.keySeparation;
  if (!keySep || typeof keySep !== 'object' || Array.isArray(keySep)) return false;
  if (keySep.verified !== true) return false;
  if (!Array.isArray(keySep.detectedViolations) || keySep.detectedViolations.length > 0) return false;
  if (!Array.isArray(report.evaluatedMounts) || report.evaluatedMounts.length < 3) return false;
  if (report.evaluatedMounts.some((m) => !m || typeof m !== 'object' || m.passed !== true)) return false;
  if (report.totalRequiredMounts !== undefined || report.validMountsCount !== undefined) {
    if (!Number.isSafeInteger(report.totalRequiredMounts) || report.totalRequiredMounts < 3 ||
        !Number.isSafeInteger(report.validMountsCount) || report.validMountsCount !== report.totalRequiredMounts) {
      return false;
    }
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

function validateSecretRotationReport(report, now) {
  if (!report || typeof report !== 'object' || Array.isArray(report)) return false;
  const timestamp = parseSecretRotationTimestamp(report.timestamp);
  const evalNow = now instanceof Date ? now : new Date();
  if (!timestamp || timestamp.getTime() > evalNow.getTime()) return false;
  if (report.status !== 'success') return false;
  if (!Array.isArray(report.errors) || report.errors.length > 0) return false;
  if (!Array.isArray(report.tested_secret_classes) ||
      !SECRET_ROTATION_CLASSES.every((cls) => report.tested_secret_classes.includes(cls))) {
    return false;
  }
  if (!report.steps || typeof report.steps !== 'object' || Array.isArray(report.steps)) return false;
  for (const step of SECRET_ROTATION_STEPS) {
    const s = report.steps[step];
    if (!s || typeof s !== 'object' || Array.isArray(s)) return false;
    if (typeof s.status !== 'string' || s.status.toLowerCase() !== 'passed') return false;
  }
  const redaction = report.steps.redaction_audit;
  if (!redaction || redaction.raw_secrets_masked !== true || redaction.zero_dev_passwords_detected !== true) {
    return false;
  }
  return true;
}

const DEPLOYMENT_DRAIN_PERIODS = {
  caddy: '30s',
  next: '30s',
  api: '45s',
  worker: '60s',
};

function isDeploymentDrillCandidate({ file, parsed } = {}) {
  const name = typeof file === 'string' ? path.basename(file) : '';
  if (name.includes('deployment-drill-evidence-') || name.includes('deployment-drill')) return true;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return false;
  return (
    typeof parsed.schema_backward_compatible === 'boolean' &&
    typeof parsed.caddy_routing_verified === 'boolean' &&
    typeof parsed.rollback_procedure_verified === 'boolean'
  );
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

function validateDeploymentDrillReport(report, now) {
  if (!report || typeof report !== 'object' || Array.isArray(report)) return false;
  const timestamp = parseDeploymentDrillTimestamp(report.drill_timestamp || report.timestamp);
  const evalNow = now instanceof Date ? now : new Date();
  if (!timestamp || timestamp.getTime() > evalNow.getTime()) return false;
  if (report.status !== 'success') return false;
  if (report.schema_backward_compatible !== true) return false;
  if (report.rollback_procedure_verified !== true) return false;
  if (report.caddy_routing_verified !== true) return false;
  if (
    typeof report.caddy_routes_tested !== 'number' ||
    !Number.isInteger(report.caddy_routes_tested) ||
    report.caddy_routes_tested < 12
  ) {
    return false;
  }
  if (report.security_headers_verified !== true) return false;
  if (report.s3_sigv4_host_preserved !== true) return false;
  if (report.migrations_verified !== true) return false;
  if (
    typeof report.migration_count !== 'number' ||
    !Number.isInteger(report.migration_count) ||
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
    typeof report.graceful_drain_periods_verified !== 'object' ||
    Array.isArray(report.graceful_drain_periods_verified)
  ) {
    return false;
  }
  for (const [svc, expected] of Object.entries(DEPLOYMENT_DRAIN_PERIODS)) {
    if (report.graceful_drain_periods_verified[svc] !== expected) return false;
  }
  if (report.duration_ms !== undefined) {
    if (typeof report.duration_ms !== 'number' || !Number.isFinite(report.duration_ms) || report.duration_ms < 0) {
      return false;
    }
  }
  return true;
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

function validateCapacityAlertingReport(report, now) {
  if (!report || typeof report !== 'object' || Array.isArray(report)) return false;
  const timestamp = parseCapacityAlertingTimestamp(report.timestamp || report.drill_timestamp);
  const evalNow = now instanceof Date ? now : new Date();
  if (!timestamp || timestamp.getTime() > evalNow.getTime()) return false;
  if (report.status !== 'success') return false;
  if (report.durationMs !== undefined) {
    if (typeof report.durationMs !== 'number' || !Number.isFinite(report.durationMs) || report.durationMs < 0) {
      return false;
    }
  }
  if (!Array.isArray(report.failures) || report.failures.length > 0) return false;

  const summary = report.summary;
  if (!summary || typeof summary !== 'object' || Array.isArray(summary)) return false;
  if (summary.alertVerification !== 'passed') return false;
  if (summary.capacitySloCompliance !== 'passed') return false;
  if (summary.dosResilience !== 'passed') return false;
  if (summary.databaseBaselineCompliance !== 'passed') return false;

  const alerts = report.alerts;
  if (!alerts || typeof alerts !== 'object' || Array.isArray(alerts)) return false;
  if (alerts.valid !== true) return false;
  if (typeof alerts.ruleCount !== 'number' || !Number.isInteger(alerts.ruleCount) || alerts.ruleCount < 11) return false;
  if (!Array.isArray(alerts.errors) || alerts.errors.length > 0) return false;
  if (!Array.isArray(alerts.rules) || alerts.rules.length < 11) return false;
  if (!Array.isArray(alerts.simulations) || alerts.simulations.length < 11) return false;
  if (alerts.simulations.some((s) => !s || typeof s !== 'object' || s.passed !== true)) return false;

  const capacity = report.capacity;
  if (!capacity || typeof capacity !== 'object' || Array.isArray(capacity)) return false;
  if (capacity.status !== 'passed') return false;
  const comp = capacity.compliance;
  if (!comp || typeof comp !== 'object' || Array.isArray(comp)) return false;
  if (
    comp.availabilityPassed !== true ||
    comp.latencyPassed !== true ||
    comp.throughputPassed !== true ||
    comp.databaseAcquisitionLatencyPassed !== true ||
    comp.databaseQueryLatencyPassed !== true ||
    comp.monotonicDbAcquisition !== true ||
    comp.monotonicDbQuery !== true ||
    comp.overallPassed !== true
  ) {
    return false;
  }
  if (capacity.sloTargets !== undefined) {
    if (!capacity.sloTargets || typeof capacity.sloTargets !== 'object' || Array.isArray(capacity.sloTargets)) {
      return false;
    }
    const targets = capacity.sloTargets;
    if (typeof targets.availabilityTargetPercent === 'number' && targets.availabilityTargetPercent < 99.9) return false;
    if (typeof targets.maxP95LatencyMs === 'number' && (targets.maxP95LatencyMs <= 0 || targets.maxP95LatencyMs > 500)) return false;
    if (typeof targets.capacityTargetRps === 'number' && targets.capacityTargetRps < 100) return false;
    if (
      typeof targets.maxDatabaseAcquisitionP95LatencyMs === 'number' &&
      (targets.maxDatabaseAcquisitionP95LatencyMs <= 0 || targets.maxDatabaseAcquisitionP95LatencyMs > 50)
    ) {
      return false;
    }
    if (
      typeof targets.maxDatabaseQueryP95LatencyMs === 'number' &&
      (targets.maxDatabaseQueryP95LatencyMs <= 0 || targets.maxDatabaseQueryP95LatencyMs > 100)
    ) {
      return false;
    }
  }

  const db = report.databaseTelemetryBaseline;
  if (!db || typeof db !== 'object' || Array.isArray(db)) return false;
  if (db.status !== 'verified') return false;
  if (!db.postgresExporter || db.postgresExporter.up !== 1 || db.postgresExporter.lastScrapeError !== 0) return false;
  if (!db.postgresServer || db.postgresServer.pgUp !== 1) return false;
  if (!db.connectionPool || typeof db.connectionPool !== 'object') return false;
  if (!db.connectionPool.api || db.connectionPool.api.requestsWaiting !== 0) return false;
  if (!db.connectionPool.worker || db.connectionPool.worker.requestsWaiting !== 0) return false;
  if (!db.poolAcquisitionLatency || typeof db.poolAcquisitionLatency !== 'object') return false;
  if (!db.poolAcquisitionLatency.api || typeof db.poolAcquisitionLatency.api.p95Ms !== 'number' || db.poolAcquisitionLatency.api.p95Ms > 50) return false;
  if (!db.poolAcquisitionLatency.worker || typeof db.poolAcquisitionLatency.worker.p95Ms !== 'number' || db.poolAcquisitionLatency.worker.p95Ms > 50) return false;
  if (!db.queryExecutionDuration || typeof db.queryExecutionDuration !== 'object') return false;
  if (!db.queryExecutionDuration.api || typeof db.queryExecutionDuration.api.p95Ms !== 'number' || db.queryExecutionDuration.api.p95Ms > 100) return false;
  if (!db.queryExecutionDuration.worker || typeof db.queryExecutionDuration.worker.p95Ms !== 'number' || db.queryExecutionDuration.worker.p95Ms > 100) return false;
  if (!db.serverActivity || typeof db.serverActivity !== 'object' || db.serverActivity.lockWaits !== 0) return false;

  const dos = report.dosResilience;
  if (!dos || typeof dos !== 'object' || Array.isArray(dos) || dos.status !== 'success') return false;

  return true;
}

function isCaddyRoutingCandidate({ file, parsed } = {}) {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return false;
  if (Array.isArray(parsed.stages) || parsed.dossier_version !== undefined) return false;
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

function validateCaddyRoutingReport(report, now, approvedDomain) {
  if (!report || typeof report !== 'object' || Array.isArray(report)) return false;
  if (report.drill_type !== 'caddy_routing_and_tls_verification') return false;
  if (typeof approvedDomain === 'string') {
    if (typeof report.domain !== 'string' || report.domain.toLowerCase() !== approvedDomain.toLowerCase()) return false;
    if (typeof report.targetPath !== 'string' ||
        report.targetPath.trim() === '' ||
        path.basename(report.targetPath) === 'Caddyfile.example') return false;
  }
  const evalNow = now instanceof Date ? now : new Date();
  const ts = parseCaddyRoutingTimestamp(report.timestamp);
  if (!ts || ts.getTime() > evalNow.getTime()) return false;
  if (report.status !== 'success') return false;
  if (report.valid !== true) return false;
  if (!Array.isArray(report.errors) || report.errors.length > 0) return false;
  if (report.hstsApproved !== true) return false;
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
  return true;
}

function checkEvidenceFile(ref, category, addBlocker, baseDirs) {
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
    } else if (caddyCandidates.some(({ parsed }) => !validateCaddyRoutingReport(parsed, now, rawDomain))) {
      addBlocker('production_domain_tls', 'A referenced Caddy routing report is invalid or failed');
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
    } else if (secretCandidates.some(({ parsed }) => !validateSecretRotationReport(parsed, now))) {
      addBlocker('secrets_management', 'A referenced secret rotation report is invalid or failed');
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
    const capacityCandidates = capacityEvidence.filter(isCapacityAlertingCandidate);
    if (capacityCandidates.length === 0) {
      addBlocker('slo_and_alerting', 'A successful capacity and alerting drill child JSON report is required');
    } else if (capacityCandidates.some(({ parsed }) => !validateCapacityAlertingReport(parsed, now))) {
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
    if (!bdrSec.backup_destination || typeof bdrSec.backup_destination !== 'string') {
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
    const candidates = recoveryEvidence.filter(({ file, parsed }) =>
      path.basename(file).startsWith('restore-drill-evidence-') ||
      (parsed && typeof parsed === 'object' && !Array.isArray(parsed) &&
        ['drill_timestamp', 'source_db', 'drill_db', 'backup_file', 'backup_bytes',
          'duration_ms', 'duration_seconds', 'rto_target_seconds', 'rto_compliant',
          'tables_source', 'tables_restored', 'migrations_source', 'migrations_restored',
          'record_parity_verified', 'postgis_verified', 'foreign_keys_verified'].some((key) => key in parsed)));
    if (candidates.length === 0) {
      addBlocker('backup_and_disaster_recovery', 'A successful restore drill child JSON report is required');
    } else {
      const timestamps = candidates.map(({ parsed }) => validateRestoreReport(parsed, now));
      if (timestamps.some((timestamp) => timestamp === null)) {
        addBlocker('backup_and_disaster_recovery', 'A referenced restore drill report is invalid or failed');
      }
      const valid = timestamps.filter(Boolean);
      if (valid.length > 0 && declaredDate) {
        const latest = valid.reduce((max, date) => date > max ? date : max);
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
    } else if (reconciliationCandidates.some(({ parsed }) => !validateReconciliationReport(parsed, now))) {
      addBlocker('backup_and_disaster_recovery', 'A referenced storage reconciliation report is invalid or failed');
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
    const volumeCandidates = volumeEvidence.filter(isVolumeEncryptionCandidate);
    if (volumeCandidates.length === 0) {
      addBlocker('volume_encryption', 'A successful volume encryption child JSON report is required');
    } else if (volumeCandidates.some(({ parsed }) => !validateVolumeEncryptionReport(parsed, now))) {
      addBlocker('volume_encryption', 'A referenced volume encryption report is invalid or failed');
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
    } else if (deploymentCandidates.some(({ parsed }) => !validateDeploymentDrillReport(parsed, now))) {
      addBlocker('deployment_and_rollback', 'A referenced deployment drill report is invalid or failed');
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
};
