import {
  ACCOUNT_TOKEN_PURPOSES,
  AI_GENERATION_STATES,
  ANONYMOUS_SESSION,
  API_ERROR_CODES,
  AUDIT_ACTIONS,
  CSRF_ERROR_CODE,
  CSRF_ERROR_MESSAGE,
  CSRF_HEADER_NAME,
  DASHBOARD_COMPARE_BY_OPTIONS,
  DASHBOARD_PRESENTATION_CHARTS,
  DASHBOARD_VIEW_STATUSES,
  DATASET_STATES,
  DEFAULT_CONTACT_SOURCE,
  EXPORT_FORMATS,
  EXPORT_STATUSES,
  IDEMPOTENCY_HEADER_NAME,
  INGESTION_RUN_STAGES,
  INGESTION_RUN_STATES,
  INSIGHT_REPORT_STATUSES,
  INVITATION_ROLES,
  JOB_RUN_STATUSES,
  MAPPING_VALIDATION_STATUSES,
  METRIC_AGGREGATION_TYPES,
  METRIC_DEFINITION_STATUSES,
  METRIC_VALUE_KINDS,
  NODE_ENVS,
  ORGANIZATION_HEADER_NAME,
  ORGANIZATION_PERMISSIONS,
  ORGANIZATION_ROLES,
  REPORT_EVIDENCE_TYPES,
  REPORT_REVISION_STATUSES,
  REPORT_STATUSES,
  REQUEST_ID_HEADER_NAME,
  SCHEDULED_JOB_NAMES,
  STORED_OBJECT_STATES,
  TERMINAL_EXPORT_STATUSES,
  TERMINAL_INGESTION_RUN_STATES,
  TERMINAL_UPLOAD_STATES,
  UPLOAD_STATES,
  VALIDATION,
  VALIDATION_ISSUE_SEVERITIES,
  isAccountTokenPurpose,
  isAiGenerationState,
  isApiError,
  isApiErrorCode,
  isAuditAction,
  isDashboardCompareBy,
  isDashboardPresentationChart,
  isDashboardViewStatus,
  isDatasetState,
  isExportFormat,
  isExportStatus,
  isIngestionRunStage,
  isIngestionRunState,
  isInsightReportStatus,
  isInvitationRole,
  isJobRunStatus,
  isMappingValidationStatus,
  isMetricAggregationType,
  isMetricDefinitionStatus,
  isMetricValueKind,
  isNodeEnv,
  isOrganizationPermission,
  isOrganizationRole,
  isReportEvidenceType,
  isReportRevisionStatus,
  isReportStatus,
  isScheduledJobName,
  isStoredObjectState,
  isTerminalExportStatus,
  isTerminalIngestionRunState,
  isTerminalUploadState,
  isUploadState,
  isValidationIssueSeverity,
} from '@acres/shared';

describe('shared-predicates and contracts', () => {
  describe('api and environment predicates', () => {
    it('verifies isApiErrorCode', () => {
      for (const code of API_ERROR_CODES) {
        expect(isApiErrorCode(code)).toBe(true);
      }
      expect(isApiErrorCode('UNKNOWN_CODE')).toBe(false);
      expect(isApiErrorCode('')).toBe(false);
      expect(isApiErrorCode(null as unknown as string)).toBe(false);
      expect(isApiErrorCode(undefined as unknown as string)).toBe(false);
      expect(isApiErrorCode(123 as unknown as string)).toBe(false);
    });

    it('verifies isNodeEnv', () => {
      for (const env of NODE_ENVS) {
        expect(isNodeEnv(env)).toBe(true);
      }
      expect(isNodeEnv('staging')).toBe(false);
      expect(isNodeEnv('')).toBe(false);
      expect(isNodeEnv(null as unknown as string)).toBe(false);
      expect(isNodeEnv(undefined as unknown as string)).toBe(false);
    });

    it('verifies isApiError', () => {
      expect(
        isApiError({
          ok: false,
          error: { code: 'FORBIDDEN', message: 'Forbidden' },
        }),
      ).toBe(true);
      expect(
        isApiError({
          ok: true,
          data: { id: '123' },
        }),
      ).toBe(false);
    });

    it('verifies header name constants', () => {
      expect(REQUEST_ID_HEADER_NAME).toBe('x-request-id');
      expect(IDEMPOTENCY_HEADER_NAME).toBe('idempotency-key');
    });
  });

  describe('auth and accounts predicates', () => {
    it('verifies isAccountTokenPurpose', () => {
      for (const purpose of ACCOUNT_TOKEN_PURPOSES) {
        expect(isAccountTokenPurpose(purpose)).toBe(true);
      }
      expect(isAccountTokenPurpose('session_refresh')).toBe(false);
      expect(isAccountTokenPurpose('')).toBe(false);
      expect(isAccountTokenPurpose(null as unknown as string)).toBe(false);
    });

    it('verifies CSRF and session constants', () => {
      expect(CSRF_HEADER_NAME).toBe('x-csrf-token');
      expect(CSRF_ERROR_CODE).toBe('CSRF_INVALID');
      expect(CSRF_ERROR_MESSAGE).toBe('CSRF token missing or invalid.');
      expect(ANONYMOUS_SESSION).toEqual({
        authenticated: false,
        account: null,
        expiresAt: null,
      });
    });
  });

  describe('jobs predicates', () => {
    it('verifies isJobRunStatus', () => {
      for (const status of JOB_RUN_STATUSES) {
        expect(isJobRunStatus(status)).toBe(true);
      }
      expect(isJobRunStatus('queued')).toBe(false);
      expect(isJobRunStatus('')).toBe(false);
      expect(isJobRunStatus(null as unknown as string)).toBe(false);
    });

    it('verifies isScheduledJobName', () => {
      for (const name of SCHEDULED_JOB_NAMES) {
        expect(isScheduledJobName(name)).toBe(true);
      }
      expect(isScheduledJobName('analytics.rebuild')).toBe(false);
      expect(isScheduledJobName('')).toBe(false);
      expect(isScheduledJobName(null as unknown as string)).toBe(false);
    });
  });

  describe('organizations predicates and permissions', () => {
    it('verifies isOrganizationRole', () => {
      for (const role of ORGANIZATION_ROLES) {
        expect(isOrganizationRole(role)).toBe(true);
      }
      expect(isOrganizationRole('superadmin')).toBe(false);
      expect(isOrganizationRole('')).toBe(false);
      expect(isOrganizationRole(null as unknown as string)).toBe(false);
      expect(isOrganizationRole(undefined as unknown as string)).toBe(false);
      expect(isOrganizationRole(123 as unknown as string)).toBe(false);
    });

    it('verifies isInvitationRole', () => {
      for (const role of INVITATION_ROLES) {
        expect(isInvitationRole(role)).toBe(true);
      }
      expect(isInvitationRole('owner')).toBe(false);
      expect(isInvitationRole('guest')).toBe(false);
      expect(isInvitationRole(null as unknown as string)).toBe(false);
    });

    it('verifies isOrganizationPermission', () => {
      for (const perm of ORGANIZATION_PERMISSIONS) {
        expect(isOrganizationPermission(perm)).toBe(true);
      }
      expect(isOrganizationPermission('system.admin')).toBe(false);
      expect(isOrganizationPermission('')).toBe(false);
      expect(isOrganizationPermission(null as unknown as string)).toBe(false);
      expect(isOrganizationPermission(undefined as unknown as string)).toBe(
        false,
      );
      expect(isOrganizationPermission(true as unknown as string)).toBe(false);
    });

    it('verifies isAuditAction', () => {
      for (const action of AUDIT_ACTIONS) {
        expect(isAuditAction(action)).toBe(true);
      }
      expect(isAuditAction('user_deleted')).toBe(false);
      expect(isAuditAction('')).toBe(false);
      expect(isAuditAction(null as unknown as string)).toBe(false);
      expect(isAuditAction(undefined as unknown as string)).toBe(false);
    });

    it('verifies organization header name', () => {
      expect(ORGANIZATION_HEADER_NAME).toBe('x-acres-organization-id');
    });
  });

  describe('uploads and storage predicates', () => {
    it('verifies isStoredObjectState', () => {
      for (const state of STORED_OBJECT_STATES) {
        expect(isStoredObjectState(state)).toBe(true);
      }
      expect(isStoredObjectState('processing')).toBe(false);
      expect(isStoredObjectState('')).toBe(false);
      expect(isStoredObjectState(null as unknown as string)).toBe(false);
      expect(isStoredObjectState(undefined as unknown as string)).toBe(false);
      expect(isStoredObjectState(42 as unknown as string)).toBe(false);
    });

    it('verifies isUploadState', () => {
      for (const state of UPLOAD_STATES) {
        expect(isUploadState(state)).toBe(true);
      }
      expect(isUploadState('processing')).toBe(false);
      expect(isUploadState('')).toBe(false);
      expect(isUploadState(null as unknown as string)).toBe(false);
    });

    it('verifies isTerminalUploadState', () => {
      for (const state of TERMINAL_UPLOAD_STATES) {
        expect(isTerminalUploadState(state)).toBe(true);
      }
      expect(isTerminalUploadState('pending_upload')).toBe(false);
      expect(isTerminalUploadState('scanning')).toBe(false);
      expect(isTerminalUploadState(null as unknown as string)).toBe(false);
    });
  });

  describe('ingestion predicates', () => {
    it('verifies isIngestionRunState and isTerminalIngestionRunState', () => {
      for (const state of INGESTION_RUN_STATES) {
        expect(isIngestionRunState(state)).toBe(true);
      }
      expect(isIngestionRunState('pending')).toBe(false);
      expect(isIngestionRunState(null as unknown as string)).toBe(false);

      for (const state of TERMINAL_INGESTION_RUN_STATES) {
        expect(isTerminalIngestionRunState(state)).toBe(true);
      }
      expect(isTerminalIngestionRunState('running')).toBe(false);
      expect(isTerminalIngestionRunState(null as unknown as string)).toBe(
        false,
      );
    });

    it('verifies isIngestionRunStage', () => {
      for (const stage of INGESTION_RUN_STAGES) {
        expect(isIngestionRunStage(stage)).toBe(true);
      }
      expect(isIngestionRunStage('finalize')).toBe(false);
      expect(isIngestionRunStage(null as unknown as string)).toBe(false);
    });

    it('verifies isDatasetState', () => {
      for (const state of DATASET_STATES) {
        expect(isDatasetState(state)).toBe(true);
      }
      expect(isDatasetState('deleted')).toBe(false);
      expect(isDatasetState(null as unknown as string)).toBe(false);
    });

    it('verifies isMappingValidationStatus', () => {
      for (const status of MAPPING_VALIDATION_STATUSES) {
        expect(isMappingValidationStatus(status)).toBe(true);
      }
      expect(isMappingValidationStatus('error')).toBe(false);
      expect(isMappingValidationStatus(null as unknown as string)).toBe(false);
    });

    it('verifies isValidationIssueSeverity', () => {
      for (const severity of VALIDATION_ISSUE_SEVERITIES) {
        expect(isValidationIssueSeverity(severity)).toBe(true);
      }
      expect(isValidationIssueSeverity('critical')).toBe(false);
      expect(isValidationIssueSeverity(null as unknown as string)).toBe(false);
    });
  });

  describe('reports and exports predicates', () => {
    it('verifies isReportStatus', () => {
      for (const status of REPORT_STATUSES) {
        expect(isReportStatus(status)).toBe(true);
      }
      expect(isReportStatus('deleted')).toBe(false);
      expect(isReportStatus(null as unknown as string)).toBe(false);
    });

    it('verifies isReportRevisionStatus', () => {
      for (const status of REPORT_REVISION_STATUSES) {
        expect(isReportRevisionStatus(status)).toBe(true);
      }
      expect(isReportRevisionStatus('rejected')).toBe(false);
      expect(isReportRevisionStatus(null as unknown as string)).toBe(false);
    });

    it('verifies isReportEvidenceType', () => {
      for (const type of REPORT_EVIDENCE_TYPES) {
        expect(isReportEvidenceType(type)).toBe(true);
      }
      expect(isReportEvidenceType('metric')).toBe(false);
      expect(isReportEvidenceType(null as unknown as string)).toBe(false);
    });

    it('verifies isExportFormat', () => {
      for (const format of EXPORT_FORMATS) {
        expect(isExportFormat(format)).toBe(true);
      }
      expect(isExportFormat('xlsx')).toBe(false);
      expect(isExportFormat(null as unknown as string)).toBe(false);
    });

    it('verifies isExportStatus and isTerminalExportStatus', () => {
      for (const status of EXPORT_STATUSES) {
        expect(isExportStatus(status)).toBe(true);
      }
      expect(isExportStatus('pending')).toBe(false);
      expect(isExportStatus(null as unknown as string)).toBe(false);

      for (const status of TERMINAL_EXPORT_STATUSES) {
        expect(isTerminalExportStatus(status)).toBe(true);
      }
      expect(isTerminalExportStatus('queued')).toBe(false);
      expect(isTerminalExportStatus('running')).toBe(false);
      expect(isTerminalExportStatus(null as unknown as string)).toBe(false);
    });

    it('verifies isAiGenerationState', () => {
      for (const state of AI_GENERATION_STATES) {
        expect(isAiGenerationState(state)).toBe(true);
      }
      expect(isAiGenerationState('cancelled')).toBe(false);
      expect(isAiGenerationState('')).toBe(false);
      expect(isAiGenerationState(null as unknown as string)).toBe(false);
      expect(isAiGenerationState(undefined as unknown as string)).toBe(false);
      expect(isAiGenerationState(500 as unknown as string)).toBe(false);
    });
  });

  describe('dashboards and regions predicates', () => {
    it('verifies isMetricValueKind', () => {
      for (const kind of METRIC_VALUE_KINDS) {
        expect(isMetricValueKind(kind)).toBe(true);
      }
      expect(isMetricValueKind('decimal')).toBe(false);
      expect(isMetricValueKind('')).toBe(false);
    });

    it('verifies isMetricAggregationType', () => {
      for (const agg of METRIC_AGGREGATION_TYPES) {
        expect(isMetricAggregationType(agg)).toBe(true);
      }
      expect(isMetricAggregationType('median')).toBe(false);
    });

    it('verifies isDashboardPresentationChart and isDashboardCompareBy', () => {
      for (const chart of DASHBOARD_PRESENTATION_CHARTS) {
        expect(isDashboardPresentationChart(chart)).toBe(true);
      }
      expect(isDashboardPresentationChart('pie')).toBe(false);

      for (const compare of DASHBOARD_COMPARE_BY_OPTIONS) {
        expect(isDashboardCompareBy(compare)).toBe(true);
      }
      expect(isDashboardCompareBy('metric')).toBe(false);
    });

    it('verifies isDashboardViewStatus and isMetricDefinitionStatus', () => {
      for (const status of DASHBOARD_VIEW_STATUSES) {
        expect(isDashboardViewStatus(status)).toBe(true);
      }
      expect(isDashboardViewStatus('draft')).toBe(false);

      for (const status of METRIC_DEFINITION_STATUSES) {
        expect(isMetricDefinitionStatus(status)).toBe(true);
      }
      expect(isMetricDefinitionStatus('deprecated')).toBe(false);
    });

    it('verifies isInsightReportStatus', () => {
      for (const status of INSIGHT_REPORT_STATUSES) {
        expect(isInsightReportStatus(status)).toBe(true);
      }
      expect(isInsightReportStatus('pending')).toBe(false);
      expect(isInsightReportStatus(null)).toBe(false);
      expect(isInsightReportStatus(undefined)).toBe(false);
    });
  });

  describe('validation constants and defaults', () => {
    it('verifies VALIDATION bounds structure', () => {
      expect(VALIDATION.email.maxLength).toBe(254);
      expect(VALIDATION.password.minLength).toBe(12);
      expect(VALIDATION.password.maxLength).toBe(128);
      expect(VALIDATION.displayName.maxLength).toBe(80);
      expect(VALIDATION.organization.name.minLength).toBe(1);
      expect(VALIDATION.organization.name.maxLength).toBe(160);
      expect(VALIDATION.dashboardView.name.minLength).toBe(1);
      expect(VALIDATION.dashboardView.name.maxLength).toBe(120);
      expect(VALIDATION.dashboardView.description.maxLength).toBe(500);
      expect(VALIDATION.report.title.minLength).toBe(1);
      expect(VALIDATION.report.title.maxLength).toBe(160);
      expect(VALIDATION.report.summary.maxLength).toBe(1000);
      expect(VALIDATION.report.insightHeading.minLength).toBe(1);
      expect(VALIDATION.report.insightHeading.maxLength).toBe(160);
      expect(VALIDATION.report.insightBody.minLength).toBe(1);
      expect(VALIDATION.report.insightBody.maxLength).toBe(4000);
      expect(VALIDATION.contact.name.minLength).toBe(1);
      expect(VALIDATION.contact.name.maxLength).toBe(120);
      expect(VALIDATION.contact.organization.maxLength).toBe(160);
      expect(VALIDATION.contact.message.minLength).toBe(10);
      expect(VALIDATION.contact.message.maxLength).toBe(4000);
      expect(VALIDATION.contact.source.maxLength).toBe(64);
      expect(VALIDATION.region.slug.maxLength).toBe(120);
    });

    it('verifies DEFAULT_CONTACT_SOURCE', () => {
      expect(DEFAULT_CONTACT_SOURCE).toBe('landing');
    });
  });
});
