import { Test, type TestingModule } from '@nestjs/testing';
import {
  DEFAULT_CONTACT_SOURCE,
  type ContactSubmissionInput,
} from '@acres/shared';
import { PrismaService } from '../prisma/prisma.service';
import { FormsService } from './forms.service';

describe('FormsService', () => {
  let service: FormsService;
  let mockPrisma: {
    contactSubmission: {
      create: jest.Mock;
    };
  };

  const sampleDate = new Date('2026-09-21T12:00:00.000Z');
  const sampleSubmission = {
    id: 'sub-uuid-1',
    createdAt: sampleDate,
  };

  beforeEach(async () => {
    mockPrisma = {
      contactSubmission: {
        create: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FormsService,
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
      ],
    }).compile();

    service = module.get<FormsService>(FormsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('recordContact', () => {
    it('persists input with name, email, organization, message, and source', async () => {
      mockPrisma.contactSubmission.create.mockResolvedValue(sampleSubmission);

      const input: ContactSubmissionInput = {
        name: 'Jane Doe',
        email: 'jane@example.com',
        organization: 'Acme Corp',
        message: 'Interested in regional analytics.',
        source: 'custom-landing',
      };

      const result = await service.recordContact(input);

      expect(mockPrisma.contactSubmission.create).toHaveBeenCalledTimes(1);
      expect(mockPrisma.contactSubmission.create).toHaveBeenCalledWith({
        data: {
          name: 'Jane Doe',
          email: 'jane@example.com',
          organization: 'Acme Corp',
          message: 'Interested in regional analytics.',
          source: 'custom-landing',
        },
        select: { id: true, createdAt: true },
      });
      expect(result).toEqual({
        id: 'sub-uuid-1',
        receivedAt: '2026-09-21T12:00:00.000Z',
      });
    });

    it('persists organization: null when organization is undefined or omitted', async () => {
      mockPrisma.contactSubmission.create.mockResolvedValue(sampleSubmission);

      const input: ContactSubmissionInput = {
        name: 'Jane Doe',
        email: 'jane@example.com',
        message: 'No organization specified.',
      };

      await service.recordContact(input);

      expect(mockPrisma.contactSubmission.create).toHaveBeenCalledWith({
        data: {
          name: 'Jane Doe',
          email: 'jane@example.com',
          organization: null,
          message: 'No organization specified.',
          source: DEFAULT_CONTACT_SOURCE,
        },
        select: { id: true, createdAt: true },
      });
    });

    it('falls back to DEFAULT_CONTACT_SOURCE (landing) when source is undefined or omitted', async () => {
      mockPrisma.contactSubmission.create.mockResolvedValue(sampleSubmission);

      const input: ContactSubmissionInput = {
        name: 'Jane Doe',
        email: 'jane@example.com',
        organization: 'Acme Corp',
        message: 'No source specified.',
      };

      await service.recordContact(input);

      expect(mockPrisma.contactSubmission.create).toHaveBeenCalledWith({
        data: {
          name: 'Jane Doe',
          email: 'jane@example.com',
          organization: 'Acme Corp',
          message: 'No source specified.',
          source: DEFAULT_CONTACT_SOURCE,
        },
        select: { id: true, createdAt: true },
      });
      expect(DEFAULT_CONTACT_SOURCE).toBe('landing');
    });

    it('persists the provided source when source is provided', async () => {
      mockPrisma.contactSubmission.create.mockResolvedValue(sampleSubmission);

      const input: ContactSubmissionInput = {
        name: 'Jane Doe',
        email: 'jane@example.com',
        message: 'With specific source.',
        source: 'partner-referral',
      };

      await service.recordContact(input);

      expect(mockPrisma.contactSubmission.create).toHaveBeenCalledWith({
        data: {
          name: 'Jane Doe',
          email: 'jane@example.com',
          organization: null,
          message: 'With specific source.',
          source: 'partner-referral',
        },
        select: { id: true, createdAt: true },
      });
    });

    it('returns receipt with id and receivedAt in ISO 8601 format', async () => {
      const fixedTimestamp = new Date('2026-09-21T08:30:15.123Z');
      mockPrisma.contactSubmission.create.mockResolvedValue({
        id: 'contact-sub-999',
        createdAt: fixedTimestamp,
      });

      const receipt = await service.recordContact({
        name: 'Alex Smith',
        email: 'alex@example.com',
        message: 'Checking ISO format receipt',
      });

      expect(receipt).toEqual({
        id: 'contact-sub-999',
        receivedAt: '2026-09-21T08:30:15.123Z',
      });
      expect(new Date(receipt.receivedAt).toISOString()).toBe(
        receipt.receivedAt,
      );
    });
  });
});
