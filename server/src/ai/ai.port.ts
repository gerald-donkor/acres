import type { AiDraftProposal } from '@acres/shared';

export const AI_DRAFT_PROVIDER = Symbol('AI_DRAFT_PROVIDER');

export interface NormalizedEvidenceItem {
  id: string;
  evidenceType: string;
  label?: string;
  value?: string | number | boolean | null;
  unit?: string | null;
  periodStart?: string | null;
  periodEnd?: string | null;
  regionId?: string | null;
  snapshot: Record<string, unknown>;
}

export interface GenerateDraftsRequest {
  purpose: string;
  evidence: NormalizedEvidenceItem[];
  maxProposals: number;
}

export interface GenerateDraftsResponse {
  proposals: AiDraftProposal[];
  provider: string;
  model: string;
  promptTemplateVersion: string;
  rawTokensUsed?: number;
}

export interface AiDraftProvider {
  generateDraftProposals(
    request: GenerateDraftsRequest,
  ): Promise<GenerateDraftsResponse>;
}
