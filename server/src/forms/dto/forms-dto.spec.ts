import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { ContactSubmissionDto } from './contact-submission.dto';

describe('Forms DTOs validation', () => {
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

  describe('ContactSubmissionDto', () => {
    it('accepts valid contact submission with normalisations', async () => {
      const result = await transformDto(ContactSubmissionDto, {
        name: '  Ada Lovelace  ',
        email: '  Ada@Example.COM  ',
        organization: '  Acres Analytics  ',
        message: '  We would like a walkthrough of the regional dataset.  ',
        source: '  landing  ',
      });
      expect(result).toBeInstanceOf(ContactSubmissionDto);
      expect(result.name).toBe('Ada Lovelace');
      expect(result.email).toBe('ada@example.com');
      expect(result.organization).toBe('Acres Analytics');
      expect(result.message).toBe(
        'We would like a walkthrough of the regional dataset.',
      );
      expect(result.source).toBe('landing');
    });

    it('accepts valid submission without optional fields', async () => {
      const result = await transformDto(ContactSubmissionDto, {
        name: 'Ada Lovelace',
        email: 'ada@example.com',
        message: 'We would like a walkthrough of the regional dataset.',
      });
      expect(result).toBeInstanceOf(ContactSubmissionDto);
      expect(result.organization).toBeUndefined();
      expect(result.source).toBeUndefined();
    });

    it('rejects message shorter than minimum length', async () => {
      await expect(
        pipe.transform(
          {
            name: 'Ada Lovelace',
            email: 'ada@example.com',
            message: 'Too short',
          },
          { type: 'body', metatype: ContactSubmissionDto },
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects message longer than maximum length', async () => {
      await expect(
        pipe.transform(
          {
            name: 'Ada Lovelace',
            email: 'ada@example.com',
            message: 'a'.repeat(4001),
          },
          { type: 'body', metatype: ContactSubmissionDto },
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects invalid email', async () => {
      await expect(
        pipe.transform(
          {
            name: 'Ada Lovelace',
            email: 'not-an-email',
            message: 'We would like a walkthrough of the regional dataset.',
          },
          { type: 'body', metatype: ContactSubmissionDto },
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
