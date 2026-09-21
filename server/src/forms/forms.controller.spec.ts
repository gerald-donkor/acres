import { Test, type TestingModule } from '@nestjs/testing';
import type { ContactSubmissionReceipt } from '@acres/shared';
import { FormsController } from './forms.controller';
import { FormsService } from './forms.service';
import type { ContactSubmissionDto } from './dto/contact-submission.dto';

describe('FormsController', () => {
  let controller: FormsController;
  let mockFormsService: {
    recordContact: jest.Mock;
  };

  beforeEach(async () => {
    mockFormsService = {
      recordContact: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [FormsController],
      providers: [
        {
          provide: FormsService,
          useValue: mockFormsService,
        },
      ],
    }).compile();

    controller = module.get<FormsController>(FormsController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('contact', () => {
    it('passes DTO to formsService.recordContact and returns the resulting ContactSubmissionReceipt', async () => {
      const dto: ContactSubmissionDto = {
        name: 'Ada Lovelace',
        email: 'ada@example.com',
        organization: 'Analytical Engine Corp',
        message: 'We would like a walkthrough of the regional dataset.',
        source: 'landing',
      };

      const expectedReceipt: ContactSubmissionReceipt = {
        id: 'sub-receipt-uuid',
        receivedAt: '2026-09-21T12:00:00.000Z',
      };

      mockFormsService.recordContact.mockResolvedValue(expectedReceipt);

      const result = await controller.contact(dto);

      expect(mockFormsService.recordContact).toHaveBeenCalledTimes(1);
      expect(mockFormsService.recordContact).toHaveBeenCalledWith(dto);
      expect(result).toEqual(expectedReceipt);
    });
  });
});
