import { Test, type TestingModule } from '@nestjs/testing';
import { AcresConfigService } from '../config/acres-config.service';
import { IdempotencyService } from '../idempotency/idempotency.service';
import type { OrganizationContext } from '../organizations/organization-context';
import { TenantTransactionService } from '../prisma/tenant-transaction.service';
import { FakeDraftAdapter } from './adapters/fake-draft.adapter';
import { AiDisabledException, AiTimeoutException } from './ai.errors';
import { AI_DRAFT_PROVIDER } from './ai.port';
import { AiService } from './ai.service';

describe('AiService', () => {
  let service: AiService;
  let fakeAdapter: FakeDraftAdapter;
  let mockConfig: {
    aiDraftEnabled: boolean;
    aiDraftModel: string;
    aiDraftMaxProposals: number;
    aiDraftTimeoutMs: number;
  };
  let mockTx: {
    reportRevision: { findFirst: jest.Mock };
    reportEvidence: { findMany: jest.Mock };
    aiGeneration: { create: jest.Mock };
  };

  const mockOrg: OrganizationContext = {
    organizationId: 'org-1111',
    accountId: 'acc-1111',
    membershipId: 'mem-1111',
    role: 'owner',
  };

  beforeEach(async () => {
    fakeAdapter = new FakeDraftAdapter();
    mockConfig = {
      aiDraftEnabled: true,
      aiDraftModel: 'gemini-2.5-flash',
      aiDraftMaxProposals: 3,
      aiDraftTimeoutMs: 5000,
    };

    mockTx = {
      reportRevision: {
        findFirst: jest.fn(),
      },
      reportEvidence: {
        findMany: jest.fn(),
      },
      aiGeneration: {
        create: jest
          .fn()
          .mockImplementation((input: { data: Record<string, unknown> }) => ({
            id: 'gen-uuid-1',
            createdAt: new Date('2026-08-28T12:00:00Z'),
            ...input.data,
          })),
      },
    };

    const mockTenants = {
      organizationScoped: jest.fn(
        async (
          _accountId: string,
          _orgId: string,
          callback: (tx: unknown) => Promise<unknown>,
        ) => callback(mockTx),
      ),
    };

    const mockIdempotency = {
      run: jest.fn(
        async (_tx: unknown, _meta: unknown, work: () => Promise<unknown>) =>
          work(),
      ),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiService,
        {
          provide: AI_DRAFT_PROVIDER,
          useValue: fakeAdapter,
        },
        {
          provide: TenantTransactionService,
          useValue: mockTenants,
        },
        {
          provide: IdempotencyService,
          useValue: mockIdempotency,
        },
        {
          provide: AcresConfigService,
          useValue: mockConfig,
        },
      ],
    }).compile();

    service = module.get<AiService>(AiService);
  });

  it('throws AiDisabledException when aiDraftEnabled is false', async () => {
    mockConfig.aiDraftEnabled = false;

    await expect(
      service.generateDraftProposals(mockOrg, 'rep-1', 'rev-1', {
        purpose: 'Analyze yield',
        evidenceIds: ['ev-1'],
        acknowledgement: true,
      }),
    ).rejects.toThrow(AiDisabledException);
  });

  it('rejects request when acknowledgement is missing', async () => {
    await expect(
      service.generateDraftProposals(mockOrg, 'rep-1', 'rev-1', {
        purpose: 'Analyze yield',
        evidenceIds: ['ev-1'],
        acknowledgement: false,
      }),
    ).rejects.toThrow();
  });

  it('rejects generation when revision is not in draft status', async () => {
    mockTx.reportRevision.findFirst.mockResolvedValue({
      id: 'rev-1',
      reportId: 'rep-1',
      status: 'published',
    });

    await expect(
      service.generateDraftProposals(mockOrg, 'rep-1', 'rev-1', {
        purpose: 'Analyze yield',
        evidenceIds: ['ev-1'],
        acknowledgement: true,
      }),
    ).rejects.toThrow(
      'AI draft proposals can only be generated for draft revisions.',
    );
  });

  it('rejects when selected evidence ID is not on the revision', async () => {
    mockTx.reportRevision.findFirst.mockResolvedValue({
      id: 'rev-1',
      reportId: 'rep-1',
      status: 'draft',
    });
    mockTx.reportEvidence.findMany.mockResolvedValue([]); // not found

    try {
      await service.generateDraftProposals(mockOrg, 'rep-1', 'rev-1', {
        purpose: 'Analyze yield',
        evidenceIds: ['ev-1'],
        acknowledgement: true,
      });
      throw new Error('Expected generateDraftProposals to throw');
    } catch (err) {
      const customErr = err as { details?: string[] };
      expect(customErr.details).toEqual(
        expect.arrayContaining([
          expect.stringContaining(
            'Selected evidence ID(s) not found on this revision',
          ),
        ]),
      );
    }
  });

  it('successfully generates proposals and records AiGeneration audit row', async () => {
    mockTx.reportRevision.findFirst.mockResolvedValue({
      id: 'rev-1',
      reportId: 'rep-1',
      status: 'draft',
    });
    mockTx.reportEvidence.findMany.mockResolvedValue([
      {
        id: 'ev-1',
        evidenceType: 'aggregate',
        snapshot: { metric: { label: 'Crop Yield' }, value: 150 },
      },
    ]);

    const result = await service.generateDraftProposals(
      mockOrg,
      'rep-1',
      'rev-1',
      {
        purpose: 'Analyze yield',
        evidenceIds: ['ev-1'],
        proposalCount: 1,
        acknowledgement: true,
      },
    );

    expect(result.proposals).toHaveLength(1);
    expect(result.proposals[0].citedEvidenceIds).toEqual(['ev-1']);
    expect(result.metadata.generationId).toBe('gen-uuid-1');

    const expectedData: unknown = expect.objectContaining({
      organizationId: mockOrg.organizationId,
      reportId: 'rep-1',
      revisionId: 'rev-1',
      accountId: mockOrg.accountId,
      state: 'succeeded',
      proposalCount: 1,
      evidenceCount: 1,
    });
    expect(mockTx.aiGeneration.create).toHaveBeenCalledWith({
      data: expectedData,
    });

    // Ensure raw prompt text and generated body are NOT stored in AiGeneration table
    const createCall = mockTx.aiGeneration.create.mock.calls[0] as [
      { data: Record<string, unknown> },
    ];
    const createData = createCall[0].data;
    expect(createData.prompt).toBeUndefined();
    expect(createData.rawPrompt).toBeUndefined();
    expect(createData.generatedText).toBeUndefined();
  });

  it('records failure state when provider throws timeout', async () => {
    mockTx.reportRevision.findFirst.mockResolvedValue({
      id: 'rev-1',
      reportId: 'rep-1',
      status: 'draft',
    });
    mockTx.reportEvidence.findMany.mockResolvedValue([
      {
        id: 'ev-1',
        evidenceType: 'aggregate',
        snapshot: { value: 100 },
      },
    ]);

    fakeAdapter.setErrorToThrow(new AiTimeoutException());

    await expect(
      service.generateDraftProposals(mockOrg, 'rep-1', 'rev-1', {
        purpose: 'Analyze yield',
        evidenceIds: ['ev-1'],
        acknowledgement: true,
      }),
    ).rejects.toThrow(AiTimeoutException);

    const expectedTimeoutData: unknown = expect.objectContaining({
      state: 'timeout',
      errorCategory: 'timeout',
      proposalCount: 0,
    });
    expect(mockTx.aiGeneration.create).toHaveBeenCalledWith({
      data: expectedTimeoutData,
    });
  });
});
