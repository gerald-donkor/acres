import { BadRequestException, ValidationPipe } from '@nestjs/common';
import {
  AcceptInvitationDto,
  ChangeMemberRoleDto,
  CreateOrganizationDto,
  InviteMemberDto,
  TransferOwnershipDto,
  UpdateOrganizationDto,
} from '../dto';

describe('Organizations DTOs validation', () => {
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

  describe('CreateOrganizationDto and UpdateOrganizationDto', () => {
    it('accepts valid organization name and trims whitespace', async () => {
      const result = await transformDto(CreateOrganizationDto, {
        name: '  Acme Research Corp  ',
      });
      expect(result).toBeInstanceOf(CreateOrganizationDto);
      expect(result.name).toBe('Acme Research Corp');
    });

    it('rejects names shorter than minimum length or whitespace-only', async () => {
      await expect(
        pipe.transform(
          { name: '' },
          { type: 'body', metatype: CreateOrganizationDto },
        ),
      ).rejects.toThrow(BadRequestException);

      await expect(
        pipe.transform(
          { name: '   ' },
          { type: 'body', metatype: CreateOrganizationDto },
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects names longer than maximum length', async () => {
      await expect(
        pipe.transform(
          { name: 'A'.repeat(161) },
          { type: 'body', metatype: CreateOrganizationDto },
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('works identically for UpdateOrganizationDto', async () => {
      const result = await transformDto(UpdateOrganizationDto, {
        name: '  Updated Org  ',
      });
      expect(result).toBeInstanceOf(UpdateOrganizationDto);
      expect(result.name).toBe('Updated Org');
    });
  });

  describe('InviteMemberDto', () => {
    it('accepts valid invitation with assignable roles and normalises email', async () => {
      for (const role of ['admin', 'analyst', 'viewer'] as const) {
        const result = await transformDto(InviteMemberDto, {
          email: ' Teammate@Example.Com ',
          role,
        });
        expect(result).toBeInstanceOf(InviteMemberDto);
        expect(result.email).toBe('teammate@example.com');
        expect(result.role).toBe(role);
      }
    });

    it('rejects owner role for member invitations', async () => {
      await expect(
        pipe.transform(
          { email: 'teammate@example.com', role: 'owner' },
          { type: 'body', metatype: InviteMemberDto },
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects invalid email and unknown roles', async () => {
      await expect(
        pipe.transform(
          { email: 'bad-email', role: 'viewer' },
          { type: 'body', metatype: InviteMemberDto },
        ),
      ).rejects.toThrow(BadRequestException);

      await expect(
        pipe.transform(
          { email: 'teammate@example.com', role: 'superadmin' },
          { type: 'body', metatype: InviteMemberDto },
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('ChangeMemberRoleDto', () => {
    it('accepts assignable roles', async () => {
      const result = await transformDto(ChangeMemberRoleDto, {
        role: 'analyst',
      });
      expect(result).toBeInstanceOf(ChangeMemberRoleDto);
      expect(result.role).toBe('analyst');
    });

    it('rejects owner or arbitrary string roles', async () => {
      await expect(
        pipe.transform(
          { role: 'owner' },
          { type: 'body', metatype: ChangeMemberRoleDto },
        ),
      ).rejects.toThrow(BadRequestException);

      await expect(
        pipe.transform(
          { role: 'moderator' },
          { type: 'body', metatype: ChangeMemberRoleDto },
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('TransferOwnershipDto', () => {
    it('accepts valid UUID membershipId', async () => {
      const result = await transformDto(TransferOwnershipDto, {
        membershipId: '018f0000-0000-7000-8000-000000000002',
      });
      expect(result).toBeInstanceOf(TransferOwnershipDto);
      expect(result.membershipId).toBe('018f0000-0000-7000-8000-000000000002');
    });

    it('rejects non-UUID membershipId', async () => {
      await expect(
        pipe.transform(
          { membershipId: 'not-a-uuid' },
          { type: 'body', metatype: TransferOwnershipDto },
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('AcceptInvitationDto', () => {
    it('accepts valid invitation token within length bounds', async () => {
      const token = 'a'.repeat(48);
      const result = await transformDto(AcceptInvitationDto, { token });
      expect(result).toBeInstanceOf(AcceptInvitationDto);
      expect(result.token).toBe(token);
    });

    it('rejects token shorter than 32 characters', async () => {
      await expect(
        pipe.transform(
          { token: 'short-token-less-than-32-chars' },
          { type: 'body', metatype: AcceptInvitationDto },
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects token longer than 256 characters', async () => {
      await expect(
        pipe.transform(
          { token: 'a'.repeat(257) },
          { type: 'body', metatype: AcceptInvitationDto },
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
