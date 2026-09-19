import type { GoogleGenAI } from '@google/genai';
import { AcresConfigService } from '../../config/acres-config.service';
import {
  AiDisabledException,
  AiGroundingRejectedException,
  AiRateLimitedException,
  AiUnavailableException,
} from '../ai.errors';
import { GEMINI_CLIENT, GeminiDraftAdapter } from './gemini-draft.adapter';

interface MockClient {
  models: {
    generateContent: jest.Mock;
  };
}

describe('GeminiDraftAdapter', () => {
  let adapter: GeminiDraftAdapter;
  let mockConfig: {
    aiDraftEnabled: boolean;
    geminiApiKey?: string;
    aiDraftModel: string;
    aiDraftTimeoutMs: number;
    aiDraftMaxProposals: number;
    aiDraftMaxOutputTokens: number;
  };

  beforeEach(() => {
    mockConfig = {
      aiDraftEnabled: true,
      geminiApiKey: 'test-key-for-adapter',
      aiDraftModel: 'gemini-2.5-flash',
      aiDraftTimeoutMs: 1000,
      aiDraftMaxProposals: 3,
      aiDraftMaxOutputTokens: 2048,
    };
    adapter = new GeminiDraftAdapter(
      mockConfig as unknown as AcresConfigService,
    );
  });

  it('exports GEMINI_CLIENT injection token', () => {
    expect(typeof GEMINI_CLIENT).toBe('symbol');
  });

  it('throws AiDisabledException if aiDraftEnabled is false', async () => {
    mockConfig.aiDraftEnabled = false;
    await expect(
      adapter.generateDraftProposals({
        purpose: 'Test purpose',
        evidence: [],
        maxProposals: 2,
      }),
    ).rejects.toThrow(AiDisabledException);
  });

  it('throws AiDisabledException even when an SDK client is injected if aiDraftEnabled is false', async () => {
    mockConfig.aiDraftEnabled = false;
    const mockClient: MockClient = {
      models: {
        generateContent: jest.fn(),
      },
    };
    const adapterWithClient = new GeminiDraftAdapter(
      mockConfig as unknown as AcresConfigService,
      mockClient as unknown as GoogleGenAI,
    );

    await expect(
      adapterWithClient.generateDraftProposals({
        purpose: 'Test purpose',
        evidence: [],
        maxProposals: 2,
      }),
    ).rejects.toThrow(AiDisabledException);
    expect(mockClient.models.generateContent).not.toHaveBeenCalled();
  });

  it('throws AiDisabledException if geminiApiKey is not set and no client is injected', async () => {
    mockConfig.geminiApiKey = undefined;
    await expect(
      adapter.generateDraftProposals({
        purpose: 'Test purpose',
        evidence: [],
        maxProposals: 2,
      }),
    ).rejects.toThrow(AiDisabledException);
  });

  it('successfully generates and parses structured output using injected SDK client', async () => {
    const mockResponse = {
      text: JSON.stringify({
        proposals: [
          {
            heading: 'Regional Yield Increase',
            body: 'Corn yield grew by 5%.',
            citedEvidenceIds: ['ev-1'],
          },
        ],
      }),
      usageMetadata: { totalTokenCount: 150 },
    };

    const mockClient: MockClient = {
      models: {
        generateContent: jest.fn().mockResolvedValue(mockResponse),
      },
    };
    adapter = new GeminiDraftAdapter(
      mockConfig as unknown as AcresConfigService,
      mockClient as unknown as GoogleGenAI,
    );

    const res = await adapter.generateDraftProposals({
      purpose: 'Summarize yield',
      evidence: [
        {
          id: 'ev-1',
          evidenceType: 'aggregate',
          snapshot: { value: 100 },
        },
      ],
      maxProposals: 2,
    });

    expect(res.proposals).toHaveLength(1);
    expect(res.proposals[0].heading).toBe('Regional Yield Increase');
    expect(res.proposals[0].citedEvidenceIds).toEqual(['ev-1']);
    expect(res.provider).toBe('gemini');
    expect(res.model).toBe('gemini-2.5-flash');
    expect(res.rawTokensUsed).toBe(150);
  });

  it('maps SDK rate-limit errors to AiRateLimitedException', async () => {
    const mockClient: MockClient = {
      models: {
        generateContent: jest.fn().mockRejectedValue({
          status: 429,
          message: 'RESOURCE_EXHAUSTED: Rate limit exceeded',
        }),
      },
    };
    adapter = new GeminiDraftAdapter(
      mockConfig as unknown as AcresConfigService,
      mockClient as unknown as GoogleGenAI,
    );

    await expect(
      adapter.generateDraftProposals({
        purpose: 'Summarize yield',
        evidence: [{ id: 'ev-1', evidenceType: 'aggregate', snapshot: {} }],
        maxProposals: 2,
      }),
    ).rejects.toThrow(AiRateLimitedException);
  });

  it('maps SDK 503 / network errors to AiUnavailableException', async () => {
    const mockClient: MockClient = {
      models: {
        generateContent: jest.fn().mockRejectedValue({
          status: 503,
          message: 'UNAVAILABLE: Service unavailable',
        }),
      },
    };
    adapter = new GeminiDraftAdapter(
      mockConfig as unknown as AcresConfigService,
      mockClient as unknown as GoogleGenAI,
    );

    await expect(
      adapter.generateDraftProposals({
        purpose: 'Summarize yield',
        evidence: [{ id: 'ev-1', evidenceType: 'aggregate', snapshot: {} }],
        maxProposals: 2,
      }),
    ).rejects.toThrow(AiUnavailableException);
  });

  it('maps grounding rejection to AiGroundingRejectedException', async () => {
    const mockClient: MockClient = {
      models: {
        generateContent: jest.fn().mockResolvedValue({
          text: JSON.stringify({
            proposals: [
              {
                heading: 'Foreign Citation',
                body: 'Unfounded claim.',
                citedEvidenceIds: ['ev-unknown'],
              },
            ],
          }),
        }),
      },
    };
    adapter = new GeminiDraftAdapter(
      mockConfig as unknown as AcresConfigService,
      mockClient as unknown as GoogleGenAI,
    );

    await expect(
      adapter.generateDraftProposals({
        purpose: 'Summarize yield',
        evidence: [{ id: 'ev-1', evidenceType: 'aggregate', snapshot: {} }],
        maxProposals: 2,
      }),
    ).rejects.toThrow(AiGroundingRejectedException);
  });
});
