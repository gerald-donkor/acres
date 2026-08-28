import { Inject, Injectable, Logger } from '@nestjs/common';
import type {
  AiDraftProposal,
  AiDraftProposalsResult,
  AiGenerationState,
} from '@acres/shared';
import { ApiException } from '../common/api-exception';
import { AcresConfigService } from '../config/acres-config.service';
import { IdempotencyService } from '../idempotency/idempotency.service';
import type { OrganizationContext } from '../organizations/organization-context';
import { TenantTransactionService } from '../prisma/tenant-transaction.service';
import {
  AI_DRAFT_PROVIDER,
  type AiDraftProvider,
  type NormalizedEvidenceItem,
} from './ai.port';
import {
  AiDisabledException,
  AiGroundingRejectedException,
  AiOutputInvalidException,
  AiRateLimitedException,
  AiTimeoutException,
  AiUnavailableException,
} from './ai.errors';
import type { CreateAiDraftDto } from './dto/ai-draft.dto';
import {
  buildDraftPrompt,
  computeCanonicalInputHash,
  PROMPT_TEMPLATE_VERSION,
} from './prompt/draft-prompt.builder';

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor(
    @Inject(AI_DRAFT_PROVIDER) private readonly provider: AiDraftProvider,
    private readonly tenants: TenantTransactionService,
    private readonly idempotency: IdempotencyService,
    private readonly config: AcresConfigService,
  ) {}

  async generateDraftProposals(
    organization: OrganizationContext,
    reportId: string,
    revisionId: string,
    input: CreateAiDraftDto,
    idempotencyKey?: string,
  ): Promise<AiDraftProposalsResult> {
    if (!this.config.aiDraftEnabled) {
      throw new AiDisabledException();
    }

    if (input.acknowledgement !== true && input.acknowledgement !== 'true') {
      throw ApiException.validationFailed([
        'Acknowledgement of third-party unpaid Gemini processing is required.',
      ]);
    }

    return this.tenants.organizationScoped(
      organization.accountId,
      organization.organizationId,
      (tx) =>
        this.idempotency.run(
          tx,
          {
            key: idempotencyKey,
            accountId: organization.accountId,
            organizationId: organization.organizationId,
            operation: `reports.ai_drafts:${revisionId}`,
            requestBody: {
              purpose: input.purpose,
              evidenceIds: input.evidenceIds,
              proposalCount: input.proposalCount,
            },
            responseStatus: 201,
          },
          async () => {
            const revision = await tx.reportRevision.findFirst({
              where: {
                id: revisionId,
                reportId,
                organizationId: organization.organizationId,
              },
            });

            if (!revision) {
              throw ApiException.notFound('Report revision not found.');
            }

            if (revision.status !== 'draft') {
              throw ApiException.conflict(
                'AI draft proposals can only be generated for draft revisions.',
              );
            }

            const evidenceRows = await tx.reportEvidence.findMany({
              where: {
                organizationId: organization.organizationId,
                revisionId,
                id: { in: input.evidenceIds },
              },
            });

            const foundIds = new Set(evidenceRows.map((e) => e.id));
            const missingIds = input.evidenceIds.filter(
              (id) => !foundIds.has(id),
            );
            if (missingIds.length > 0) {
              throw ApiException.validationFailed([
                `Selected evidence ID(s) not found on this revision: ${missingIds.join(', ')}`,
              ]);
            }

            const normalizedEvidence: NormalizedEvidenceItem[] =
              evidenceRows.map((row) => {
                const snap =
                  row.snapshot &&
                  typeof row.snapshot === 'object' &&
                  !Array.isArray(row.snapshot)
                    ? (row.snapshot as Record<string, unknown>)
                    : {};
                const metric =
                  snap.metric &&
                  typeof snap.metric === 'object' &&
                  !Array.isArray(snap.metric)
                    ? (snap.metric as Record<string, unknown>)
                    : {};

                return {
                  id: row.id,
                  evidenceType: row.evidenceType,
                  label:
                    (typeof metric.label === 'string' && metric.label) ||
                    (typeof snap.name === 'string' && snap.name) ||
                    undefined,
                  value:
                    typeof snap.value === 'string' ||
                    typeof snap.value === 'number' ||
                    typeof snap.value === 'boolean'
                      ? snap.value
                      : undefined,
                  unit:
                    typeof metric.unit === 'string' ? metric.unit : undefined,
                  periodStart:
                    typeof snap.periodStart === 'string'
                      ? snap.periodStart
                      : undefined,
                  periodEnd:
                    typeof snap.periodEnd === 'string'
                      ? snap.periodEnd
                      : undefined,
                  regionId:
                    typeof snap.regionId === 'string'
                      ? snap.regionId
                      : undefined,
                  snapshot: snap,
                };
              });

            const maxProposals = Math.min(
              input.proposalCount ?? this.config.aiDraftMaxProposals,
              this.config.aiDraftMaxProposals,
            );

            const prompt = buildDraftPrompt({
              purpose: input.purpose,
              evidence: normalizedEvidence,
              maxProposals,
            });

            if (
              Buffer.byteLength(prompt.userPrompt, 'utf8') >
              this.config.aiDraftMaxContextBytes
            ) {
              throw ApiException.validationFailed([
                'Evidence context exceeds maximum permitted byte size.',
              ]);
            }

            const inputHash = computeCanonicalInputHash({
              purpose: input.purpose,
              evidence: normalizedEvidence,
              maxProposals,
              templateVersion: PROMPT_TEMPLATE_VERSION,
            });

            const startTime = Date.now();
            let proposals: AiDraftProposal[];
            let providerName = 'gemini';
            let modelName = this.config.aiDraftModel;
            let templateVersion = PROMPT_TEMPLATE_VERSION;

            try {
              const res = await this.provider.generateDraftProposals({
                purpose: input.purpose,
                evidence: normalizedEvidence,
                maxProposals,
              });
              proposals = res.proposals;
              providerName = res.provider;
              modelName = res.model;
              templateVersion = res.promptTemplateVersion;
            } catch (error) {
              const durationMs = Date.now() - startTime;
              let state: AiGenerationState = 'failed';
              let errorCategory: string = 'unexpected_failure';

              if (error instanceof AiTimeoutException) {
                state = 'timeout';
                errorCategory = 'timeout';
              } else if (error instanceof AiRateLimitedException) {
                state = 'rate_limited';
                errorCategory = 'rate_limited';
              } else if (error instanceof AiGroundingRejectedException) {
                state = 'grounding_rejected';
                errorCategory = 'grounding_rejected';
              } else if (error instanceof AiOutputInvalidException) {
                state = 'malformed_output';
                errorCategory = 'malformed_output';
              } else if (error instanceof AiUnavailableException) {
                state = 'unavailable';
                errorCategory = 'unavailable';
              }

              await this.recordFailureAudit(
                organization,
                reportId,
                revisionId,
                {
                  provider: providerName,
                  model: modelName,
                  promptTemplateVersion: templateVersion,
                  inputHash,
                  state,
                  errorCategory,
                  evidenceCount: normalizedEvidence.length,
                  durationMs,
                },
              );

              throw error;
            }

            const durationMs = Date.now() - startTime;
            const generationRecord = await tx.aiGeneration.create({
              data: {
                organizationId: organization.organizationId,
                reportId,
                revisionId,
                accountId: organization.accountId,
                provider: providerName,
                model: modelName,
                promptTemplateVersion: templateVersion,
                inputHash,
                state: 'succeeded',
                proposalCount: proposals.length,
                evidenceCount: normalizedEvidence.length,
                durationMs,
                completedAt: new Date(),
              },
            });

            return {
              proposals,
              metadata: {
                generationId: generationRecord.id,
                provider: providerName,
                model: modelName,
                promptTemplateVersion: templateVersion,
                proposalCount: proposals.length,
                createdAt: generationRecord.createdAt.toISOString(),
              },
            };
          },
        ),
      {
        statementTimeoutMs: Math.max(
          this.config.aiDraftTimeoutMs + 5000,
          20000,
        ),
      },
    );
  }

  private async recordFailureAudit(
    organization: OrganizationContext,
    reportId: string,
    revisionId: string,
    params: {
      provider: string;
      model: string;
      promptTemplateVersion: string;
      inputHash: string;
      state: AiGenerationState;
      errorCategory: string;
      evidenceCount: number;
      durationMs: number;
    },
  ): Promise<void> {
    try {
      await this.tenants.organizationScoped(
        organization.accountId,
        organization.organizationId,
        async (tx) => {
          await tx.aiGeneration.create({
            data: {
              organizationId: organization.organizationId,
              reportId,
              revisionId,
              accountId: organization.accountId,
              provider: params.provider,
              model: params.model,
              promptTemplateVersion: params.promptTemplateVersion,
              inputHash: params.inputHash,
              state: params.state,
              errorCategory: params.errorCategory,
              proposalCount: 0,
              evidenceCount: params.evidenceCount,
              durationMs: params.durationMs,
              completedAt: new Date(),
            },
          });
        },
      );
    } catch {
      // Best-effort operational logging; do not mask primary exception
    }
  }
}
