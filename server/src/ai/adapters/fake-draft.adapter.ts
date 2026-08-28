import { Injectable } from '@nestjs/common';
import type { AiDraftProposal } from '@acres/shared';
import type {
  AiDraftProvider,
  GenerateDraftsRequest,
  GenerateDraftsResponse,
} from '../ai.port';
import { PROMPT_TEMPLATE_VERSION } from '../prompt/draft-prompt.builder';

@Injectable()
export class FakeDraftAdapter implements AiDraftProvider {
  private customProposals: AiDraftProposal[] | null = null;
  private errorToThrow: Error | null = null;

  setCustomProposals(proposals: AiDraftProposal[] | null): void {
    this.customProposals = proposals;
  }

  setErrorToThrow(error: Error | null): void {
    this.errorToThrow = error;
  }

  async generateDraftProposals(
    request: GenerateDraftsRequest,
  ): Promise<GenerateDraftsResponse> {
    await Promise.resolve();
    if (this.errorToThrow) {
      throw this.errorToThrow;
    }

    if (this.customProposals) {
      return {
        proposals: this.customProposals.slice(0, request.maxProposals),
        provider: 'fake-gemini',
        model: 'gemini-test',
        promptTemplateVersion: PROMPT_TEMPLATE_VERSION,
        rawTokensUsed: 128,
      };
    }

    // Generate grounded default proposals using provided evidence items
    const proposals: AiDraftProposal[] = request.evidence
      .slice(0, request.maxProposals)
      .map((ev, index) => {
        const label =
          ev.label ??
          (typeof ev.snapshot.label === 'string'
            ? ev.snapshot.label
            : `Metric ${index + 1}`);
        const val =
          ev.value ??
          (typeof ev.snapshot.value === 'string' ||
          typeof ev.snapshot.value === 'number'
            ? ev.snapshot.value
            : '100');
        const unit =
          ev.unit ??
          (typeof ev.snapshot.unit === 'string' ? ev.snapshot.unit : '');

        return {
          heading: `Growth observation in ${label}`,
          body: `Analysis of evidence ${ev.id} indicates measured value of ${val}${unit ? ` ${unit}` : ''}, supporting regional growth trends.`,
          citedEvidenceIds: [ev.id],
        };
      });

    return {
      proposals,
      provider: 'fake-gemini',
      model: 'gemini-test',
      promptTemplateVersion: PROMPT_TEMPLATE_VERSION,
      rawTokensUsed: 128,
    };
  }
}
