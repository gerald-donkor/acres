import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { ForgotPasswordDto } from './forgot-password.dto';
import { LoginDto } from './login.dto';
import { RegisterAccountDto } from './register-account.dto';
import { ResetPasswordDto } from './reset-password.dto';

describe('Auth DTOs validation', () => {
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

  describe('LoginDto', () => {
    it('accepts valid credentials and normalises email', async () => {
      const result = await transformDto(LoginDto, {
        email: '  Ada@Example.COM  ',
        password: 'my-password-123',
      });
      expect(result).toBeInstanceOf(LoginDto);
      expect(result.email).toBe('ada@example.com');
      expect(result.password).toBe('my-password-123');
    });

    it('rejects invalid email formats', async () => {
      await expect(
        pipe.transform(
          { email: 'not-an-email', password: 'valid-password' },
          { type: 'body', metatype: LoginDto },
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects email exceeding max length', async () => {
      const longEmail = `${'a'.repeat(250)}@example.com`;
      await expect(
        pipe.transform(
          { email: longEmail, password: 'valid-password' },
          { type: 'body', metatype: LoginDto },
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects non-whitelisted properties', async () => {
      await expect(
        pipe.transform(
          {
            email: 'ada@example.com',
            password: 'valid-password',
            extraField: 'attack',
          },
          { type: 'body', metatype: LoginDto },
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('RegisterAccountDto', () => {
    it('accepts valid input with trimmed displayName', async () => {
      const result = await transformDto(RegisterAccountDto, {
        email: '  Grace@Example.COM  ',
        password: 'strong-password-8',
        displayName: '  Grace Hopper  ',
      });
      expect(result).toBeInstanceOf(RegisterAccountDto);
      expect(result.email).toBe('grace@example.com');
      expect(result.password).toBe('strong-password-8');
      expect(result.displayName).toBe('Grace Hopper');
    });

    it('accepts valid input without optional displayName', async () => {
      const result = await transformDto(RegisterAccountDto, {
        email: 'grace@example.com',
        password: 'strong-password-8',
      });
      expect(result).toBeInstanceOf(RegisterAccountDto);
      expect(result.displayName).toBeUndefined();
    });

    it('rejects password shorter than minimum length', async () => {
      await expect(
        pipe.transform(
          { email: 'grace@example.com', password: 'short' },
          { type: 'body', metatype: RegisterAccountDto },
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects password longer than maximum length', async () => {
      await expect(
        pipe.transform(
          { email: 'grace@example.com', password: 'a'.repeat(129) },
          { type: 'body', metatype: RegisterAccountDto },
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('ForgotPasswordDto', () => {
    it('accepts valid email and normalises it', async () => {
      const result = await transformDto(ForgotPasswordDto, {
        email: ' User@DOMAIN.org ',
      });
      expect(result).toBeInstanceOf(ForgotPasswordDto);
      expect(result.email).toBe('user@domain.org');
    });

    it('rejects missing or malformed email', async () => {
      await expect(
        pipe.transform(
          { email: 'bad' },
          { type: 'body', metatype: ForgotPasswordDto },
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('ResetPasswordDto', () => {
    it('accepts valid token and new password', async () => {
      const result = await transformDto(ResetPasswordDto, {
        token: '  aB3_1234567890abcdef  ',
        password: 'new-valid-password-123',
      });
      expect(result).toBeInstanceOf(ResetPasswordDto);
      expect(result.token).toBe('aB3_1234567890abcdef');
      expect(result.password).toBe('new-valid-password-123');
    });

    it('rejects token shorter than 16 chars', async () => {
      await expect(
        pipe.transform(
          { token: 'short-token', password: 'new-valid-password-123' },
          { type: 'body', metatype: ResetPasswordDto },
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects password shorter than 8 chars', async () => {
      await expect(
        pipe.transform(
          { token: 'aB3_1234567890abcdef', password: 'short' },
          { type: 'body', metatype: ResetPasswordDto },
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
