import { GoogleGenAI } from '@google/genai';
import { Injectable, Logger } from '@nestjs/common';
import { AcresConfigService } from '../../config/acres-config.service';
import type {
  AiDraftProvider,
  GenerateDraftsRequest,
  GenerateDraftsResponse,
} from '../ai.port';
import {
  AiDisabledException,
  AiGroundingRejectedException,
  AiOutputInvalidException,
  AiRateLimitedException,
  AiTimeoutException,
  AiUnavailableException,
} from '../ai.errors';
import { buildDraftPrompt } from '../prompt/draft-prompt.builder';
import {
  GroundingRejectionError,
  MalformedOutputError,
  validateAndParseModelOutput,
} from '../validation/draft-output.validator';

const proposalJsonSchema = {
  type: 'object',
  properties: {
    proposals: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          heading: {
            type: 'string',
            description: 'Concise finding title (1 to 160 characters)',
          },
          body: {
            type: 'string',
            description:
              'Detailed finding description grounded in evidence (1 to 4000 characters)',
          },
          citedEvidenceIds: {
            type: 'array',
            items: {
              type: 'string',
              description:
                'Exact evidence ID from context that substantiates this claim',
            },
            description: 'Non-empty list of cited evidence IDs',
          },
        },
        required: ['heading', 'body', 'citedEvidenceIds'],
      },
    },
  },
  required: ['proposals'],
};

@Injectable()
export class GeminiDraftAdapter implements AiDraftProvider {
  private readonly logger = new Logger(GeminiDraftAdapter.name);
  private client: GoogleGenAI | null = null;

  constructor(private readonly config: AcresConfigService) {}

  private getClient(): GoogleGenAI {
    if (!this.config.aiDraftEnabled) {
      throw new AiDisabledException();
    }
    if (!this.config.geminiApiKey) {
      throw new AiDisabledException('GEMINI_API_KEY is not configured.');
    }
    if (!this.client) {
      this.client = new GoogleGenAI({ apiKey: this.config.geminiApiKey });
    }
    return this.client;
  }

  async generateDraftProposals(
    request: GenerateDraftsRequest,
  ): Promise<GenerateDraftsResponse> {
    const client = this.getClient();

    const prompt = buildDraftPrompt({
      purpose: request.purpose,
      evidence: request.evidence,
      maxProposals: request.maxProposals,
    });

    const allowedEvidenceIds = new Set(request.evidence.map((e) => e.id));
    const timeoutMs = this.config.aiDraftTimeoutMs;

    let rawOutputText = '';
    let tokensUsed: number | undefined;

    try {
      const generatePromise = client.models.generateContent({
        model: this.config.aiDraftModel,
        contents: prompt.userPrompt,
        config: {
          systemInstruction: prompt.systemInstruction,
          responseMimeType: 'application/json',
          responseSchema: proposalJsonSchema,
          temperature: 0.2,
          maxOutputTokens: this.config.aiDraftMaxOutputTokens,
        },
      });

      let timerId: NodeJS.Timeout | undefined;
      const timeoutPromise = new Promise<never>((_, reject) => {
        timerId = setTimeout(() => {
          reject(new AiTimeoutException());
        }, timeoutMs);
      });

      try {
        const response = await Promise.race([generatePromise, timeoutPromise]);
        rawOutputText = response.text ?? '';
        tokensUsed = response.usageMetadata?.totalTokenCount;
      } finally {
        if (timerId) clearTimeout(timerId);
      }
    } catch (error) {
      if (error instanceof AiTimeoutException) {
        throw error;
      }

      const errMessage = error instanceof Error ? error.message : String(error);
      const status =
        error && typeof error === 'object' && 'status' in error
          ? Number(error.status)
          : 0;

      this.logger.warn(`Gemini API request failed: ${errMessage}`);

      if (
        status === 429 ||
        errMessage.includes('429') ||
        errMessage.includes('RESOURCE_EXHAUSTED') ||
        errMessage.includes('quota')
      ) {
        throw new AiRateLimitedException();
      }

      if (
        status === 503 ||
        errMessage.includes('503') ||
        errMessage.includes('UNAVAILABLE') ||
        errMessage.includes('ECONNREFUSED') ||
        errMessage.includes('ETIMEDOUT')
      ) {
        throw new AiUnavailableException();
      }

      throw new AiUnavailableException(
        'The AI service encountered an error processing the request.',
      );
    }

    try {
      const proposals = validateAndParseModelOutput(
        rawOutputText,
        allowedEvidenceIds,
        request.maxProposals,
      );

      return {
        proposals,
        provider: 'gemini',
        model: this.config.aiDraftModel,
        promptTemplateVersion: prompt.templateVersion,
        rawTokensUsed: tokensUsed,
      };
    } catch (valError) {
      if (valError instanceof GroundingRejectionError) {
        this.logger.warn(`Grounding validation rejected: ${valError.message}`);
        throw new AiGroundingRejectedException(valError.message, [
          valError.message,
        ]);
      }
      if (valError instanceof MalformedOutputError) {
        this.logger.warn(`Model output malformed: ${valError.message}`);
        throw new AiOutputInvalidException(valError.message, [
          valError.message,
        ]);
      }
      throw new AiOutputInvalidException('Output validation failed.');
    }
  }
}
