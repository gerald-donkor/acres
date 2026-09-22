import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { CreateAiDraftDto } from './ai-draft.dto';

describe('AI Draft DTO validation', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: { enableImplicitConversion: false },
  });

  async function transformDto<T>(
    metatype: new () => T,
    value: unknown,
    type: 'body' | 'query' | 'param' = 'body',
  ): Promise<T> {
    const result: unknown = await pipe.transform(value, { type, metatype });
    return result as T;
  }

  const validUuid1 = '018f0000-0000-7000-8000-000000000001';
  const validUuid2 = '018f0000-0000-7000-8000-000000000002';

  describe('CreateAiDraftDto', () => {
    it('accepts valid draft request and trims purpose', async () => {
      const result = await transformDto(CreateAiDraftDto, {
        purpose:
          '  Synthesize regional population patterns for executive brief  ',
        evidenceIds: [validUuid1, validUuid2],
        proposalCount: '3',
        acknowledgement: true,
      });
      expect(result).toBeInstanceOf(CreateAiDraftDto);
      expect(result.purpose).toBe(
        'Synthesize regional population patterns for executive brief',
      );
      expect(result.evidenceIds).toEqual([validUuid1, validUuid2]);
      expect(result.proposalCount).toBe(3);
      expect(result.acknowledgement).toBe(true);
    });

    it('accepts valid request without optional proposalCount', async () => {
      const result = await transformDto(CreateAiDraftDto, {
        purpose: 'Draft summary',
        evidenceIds: [validUuid1],
        acknowledgement: 'User acknowledged draft review obligations',
      });
      expect(result).toBeInstanceOf(CreateAiDraftDto);
      expect(result.proposalCount).toBeUndefined();
      expect(result.acknowledgement).toBe(
        'User acknowledged draft review obligations',
      );
    });

    it('rejects empty evidenceIds or evidenceIds exceeding 10 items', async () => {
      await expect(
        pipe.transform(
          {
            purpose: 'Draft summary',
            evidenceIds: [],
            acknowledgement: true,
          },
          { type: 'body', metatype: CreateAiDraftDto },
        ),
      ).rejects.toThrow(BadRequestException);

      const elevenUuids = Array.from(
        { length: 11 },
        (_, i) =>
          `018f0000-0000-7000-8000-0000000000${String(i).padStart(2, '0')}`,
      );
      await expect(
        pipe.transform(
          {
            purpose: 'Draft summary',
            evidenceIds: elevenUuids,
            acknowledgement: true,
          },
          { type: 'body', metatype: CreateAiDraftDto },
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects invalid UUID in evidenceIds', async () => {
      await expect(
        pipe.transform(
          {
            purpose: 'Draft summary',
            evidenceIds: ['not-a-uuid'],
            acknowledgement: true,
          },
          { type: 'body', metatype: CreateAiDraftDto },
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects proposalCount outside 1..5 range', async () => {
      await expect(
        pipe.transform(
          {
            purpose: 'Draft summary',
            evidenceIds: [validUuid1],
            proposalCount: 0,
            acknowledgement: true,
          },
          { type: 'body', metatype: CreateAiDraftDto },
        ),
      ).rejects.toThrow(BadRequestException);

      await expect(
        pipe.transform(
          {
            purpose: 'Draft summary',
            evidenceIds: [validUuid1],
            proposalCount: 6,
            acknowledgement: true,
          },
          { type: 'body', metatype: CreateAiDraftDto },
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects undefined acknowledgement', async () => {
      await expect(
        pipe.transform(
          {
            purpose: 'Draft summary',
            evidenceIds: [validUuid1],
          },
          { type: 'body', metatype: CreateAiDraftDto },
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
