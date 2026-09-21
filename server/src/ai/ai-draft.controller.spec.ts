import type { AiDraftProposalsResult } from '@acres/shared';
import { ApiException } from '../common/api-exception';
import type { OrganizationContext } from '../organizations/organization-context';
import { AiDraftController } from './ai-draft.controller';
import {
  AiDisabledException,
  AiGroundingRejectedException,
  AiOutputInvalidException,
  AiRateLimitedException,
  AiTimeoutException,
  AiUnavailableException,
} from './ai.errors';
import type { AiService } from './ai.service';
import type { CreateAiDraftDto } from './dto/ai-draft.dto';

describe('AiDraftController', () => {
  let controller: AiDraftController;
  let mockAiService: {
    generateDraftProposals: jest.Mock;
  };

  const mockOrg: OrganizationContext = {
    organizationId: '11111111-1111-1111-1111-111111111111',
    accountId: '22222222-2222-2222-2222-222222222222',
    membershipId: '33333333-3333-3333-3333-333333333333',
    role: 'owner',
  };

  const reportId = '44444444-4444-4444-4444-444444444444';
  const revisionId = '55555555-5555-5555-5555-555555555555';
  const idempotencyKey = 'idem-test-key-001';

  const draftDto: CreateAiDraftDto = {
    purpose: 'Draft regional crop and soil health insights for Q3',
    evidenceIds: [
      '66666666-6666-6666-6666-666666666666',
      '77777777-7777-7777-7777-777777777777',
    ],
    proposalCount: 2,
    acknowledgement: true,
  };

  const mockResult: AiDraftProposalsResult = {
    proposals: [
      {
        heading: 'Soil Moisture Recovery',
        body: 'Subsurface moisture levels improved by 14% across the eastern parcel.',
        citedEvidenceIds: ['66666666-6666-6666-6666-666666666666'],
      },
      {
        heading: 'Vegetation Index Stability',
        body: 'NDVI vegetation indices remained stable across monitored plots during the dry spell.',
        citedEvidenceIds: ['77777777-7777-7777-7777-777777777777'],
      },
    ],
    metadata: {
      generationId: '88888888-8888-8888-8888-888888888888',
      provider: 'gemini',
      model: 'gemini-2.5-flash',
      promptTemplateVersion: '1.0.0',
      proposalCount: 2,
      createdAt: '2026-09-21T12:00:00.000Z',
    },
  };

  beforeEach(() => {
    mockAiService = {
      generateDraftProposals: jest.fn(),
    };
    controller = new AiDraftController(mockAiService as unknown as AiService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('is defined', () => {
    expect(controller).toBeDefined();
  });

  describe('generateDrafts', () => {
    it('delegates to aiService.generateDraftProposals with all parameters and returns the result', async () => {
      mockAiService.generateDraftProposals.mockResolvedValue(mockResult);

      const result = await controller.generateDrafts(
        mockOrg,
        reportId,
        revisionId,
        draftDto,
        idempotencyKey,
      );

      expect(mockAiService.generateDraftProposals).toHaveBeenCalledTimes(1);
      expect(mockAiService.generateDraftProposals).toHaveBeenCalledWith(
        mockOrg,
        reportId,
        revisionId,
        draftDto,
        idempotencyKey,
      );
      expect(result).toEqual(mockResult);
    });

    it('delegates to aiService.generateDraftProposals when idempotencyKey is omitted or undefined', async () => {
      mockAiService.generateDraftProposals.mockResolvedValue(mockResult);

      const result = await controller.generateDrafts(
        mockOrg,
        reportId,
        revisionId,
        draftDto,
        undefined,
      );

      expect(mockAiService.generateDraftProposals).toHaveBeenCalledTimes(1);
      expect(mockAiService.generateDraftProposals).toHaveBeenCalledWith(
        mockOrg,
        reportId,
        revisionId,
        draftDto,
        undefined,
      );
      expect(result).toEqual(mockResult);
    });

    describe('error propagation', () => {
      it('propagates AiDisabledException when AI preview is disabled', async () => {
        const error = new AiDisabledException();
        mockAiService.generateDraftProposals.mockRejectedValue(error);

        await expect(
          controller.generateDrafts(
            mockOrg,
            reportId,
            revisionId,
            draftDto,
            idempotencyKey,
          ),
        ).rejects.toThrow(error);
      });

      it('propagates AiTimeoutException when the provider request times out', async () => {
        const error = new AiTimeoutException();
        mockAiService.generateDraftProposals.mockRejectedValue(error);

        await expect(
          controller.generateDrafts(
            mockOrg,
            reportId,
            revisionId,
            draftDto,
            idempotencyKey,
          ),
        ).rejects.toThrow(error);
      });

      it('propagates AiRateLimitedException when rate limit is exceeded', async () => {
        const error = new AiRateLimitedException();
        mockAiService.generateDraftProposals.mockRejectedValue(error);

        await expect(
          controller.generateDrafts(
            mockOrg,
            reportId,
            revisionId,
            draftDto,
            idempotencyKey,
          ),
        ).rejects.toThrow(error);
      });

      it('propagates AiGroundingRejectedException when claims lack valid evidence', async () => {
        const error = new AiGroundingRejectedException(
          'Claims could not be grounded in cited evidence.',
          ['claim 1 ungrounded'],
        );
        mockAiService.generateDraftProposals.mockRejectedValue(error);

        await expect(
          controller.generateDrafts(
            mockOrg,
            reportId,
            revisionId,
            draftDto,
            idempotencyKey,
          ),
        ).rejects.toThrow(error);
      });

      it('propagates AiOutputInvalidException when model output is malformed', async () => {
        const error = new AiOutputInvalidException('Output JSON was invalid');
        mockAiService.generateDraftProposals.mockRejectedValue(error);

        await expect(
          controller.generateDrafts(
            mockOrg,
            reportId,
            revisionId,
            draftDto,
            idempotencyKey,
          ),
        ).rejects.toThrow(error);
      });

      it('propagates AiUnavailableException when the AI service is unavailable', async () => {
        const error = new AiUnavailableException();
        mockAiService.generateDraftProposals.mockRejectedValue(error);

        await expect(
          controller.generateDrafts(
            mockOrg,
            reportId,
            revisionId,
            draftDto,
            idempotencyKey,
          ),
        ).rejects.toThrow(error);
      });

      it('propagates ApiException validation or not-found errors', async () => {
        const error = ApiException.notFound('Report revision not found.');
        mockAiService.generateDraftProposals.mockRejectedValue(error);

        await expect(
          controller.generateDrafts(
            mockOrg,
            reportId,
            revisionId,
            draftDto,
            idempotencyKey,
          ),
        ).rejects.toThrow(error);
      });

      it('propagates unhandled or generic errors thrown by the service', async () => {
        const error = new Error('Unexpected downstream database error');
        mockAiService.generateDraftProposals.mockRejectedValue(error);

        await expect(
          controller.generateDrafts(
            mockOrg,
            reportId,
            revisionId,
            draftDto,
            idempotencyKey,
          ),
        ).rejects.toThrow(error);
      });
    });
  });
});
