import type { AiDraftProposal } from '@acres/shared';
import type { NormalizedEvidenceItem } from '../ai.port';
import { PROMPT_TEMPLATE_VERSION } from '../prompt/draft-prompt.builder';
import { FakeDraftAdapter } from './fake-draft.adapter';

describe('FakeDraftAdapter', () => {
  let adapter: FakeDraftAdapter;

  beforeEach(() => {
    adapter = new FakeDraftAdapter();
  });

  describe('default proposal generation', () => {
    it('generates grounded proposals using explicit evidence properties', async () => {
      const evidence: NormalizedEvidenceItem[] = [
        {
          id: 'ev-1',
          evidenceType: 'aggregate',
          label: 'Corn Yield',
          value: 42,
          unit: 'bu/acre',
          snapshot: {},
        },
        {
          id: 'ev-2',
          evidenceType: 'aggregate',
          label: 'Soybean Production',
          value: '1200',
          unit: 'tons',
          snapshot: {},
        },
      ];

      const res = await adapter.generateDraftProposals({
        purpose: 'Analyze crop trends',
        evidence,
        maxProposals: 3,
      });

      expect(res.provider).toBe('fake-gemini');
      expect(res.model).toBe('gemini-test');
      expect(res.promptTemplateVersion).toBe(PROMPT_TEMPLATE_VERSION);
      expect(res.rawTokensUsed).toBe(128);
      expect(res.proposals).toHaveLength(2);

      expect(res.proposals[0]).toEqual({
        heading: 'Growth observation in Corn Yield',
        body: 'Analysis of evidence ev-1 indicates measured value of 42 bu/acre, supporting regional growth trends.',
        citedEvidenceIds: ['ev-1'],
      });

      expect(res.proposals[1]).toEqual({
        heading: 'Growth observation in Soybean Production',
        body: 'Analysis of evidence ev-2 indicates measured value of 1200 tons, supporting regional growth trends.',
        citedEvidenceIds: ['ev-2'],
      });
    });

    it('falls back to snapshot properties when top-level properties are undefined', async () => {
      const evidence: NormalizedEvidenceItem[] = [
        {
          id: 'ev-snap-1',
          evidenceType: 'dashboard_view',
          snapshot: {
            label: 'Wheat Output',
            value: 95,
            unit: 'kg/ha',
          },
        },
        {
          id: 'ev-snap-2',
          evidenceType: 'aggregate',
          snapshot: {
            label: 'Barley Metric',
            value: '500',
            unit: 'bushels',
          },
        },
      ];

      const res = await adapter.generateDraftProposals({
        purpose: 'Evaluate regional crops',
        evidence,
        maxProposals: 5,
      });

      expect(res.proposals).toHaveLength(2);
      expect(res.proposals[0]).toEqual({
        heading: 'Growth observation in Wheat Output',
        body: 'Analysis of evidence ev-snap-1 indicates measured value of 95 kg/ha, supporting regional growth trends.',
        citedEvidenceIds: ['ev-snap-1'],
      });
      expect(res.proposals[1]).toEqual({
        heading: 'Growth observation in Barley Metric',
        body: 'Analysis of evidence ev-snap-2 indicates measured value of 500 bushels, supporting regional growth trends.',
        citedEvidenceIds: ['ev-snap-2'],
      });
    });

    it('falls back to index-based defaults when label, value, and unit are absent or invalid types', async () => {
      const evidence: NormalizedEvidenceItem[] = [
        {
          id: 'ev-empty-1',
          evidenceType: 'aggregate',
          snapshot: {
            label: 123, // invalid type, should fall back to Metric 1
            value: true, // boolean in snapshot, should fall back to 100
            unit: null, // null, should fall back to empty string
          },
        },
        {
          id: 'ev-empty-2',
          evidenceType: 'aggregate',
          snapshot: {},
        },
      ];

      const res = await adapter.generateDraftProposals({
        purpose: 'Default fallback check',
        evidence,
        maxProposals: 2,
      });

      expect(res.proposals).toHaveLength(2);
      expect(res.proposals[0]).toEqual({
        heading: 'Growth observation in Metric 1',
        body: 'Analysis of evidence ev-empty-1 indicates measured value of 100, supporting regional growth trends.',
        citedEvidenceIds: ['ev-empty-1'],
      });
      expect(res.proposals[1]).toEqual({
        heading: 'Growth observation in Metric 2',
        body: 'Analysis of evidence ev-empty-2 indicates measured value of 100, supporting regional growth trends.',
        citedEvidenceIds: ['ev-empty-2'],
      });
    });

    it('caps generated proposals by maxProposals', async () => {
      const evidence: NormalizedEvidenceItem[] = [
        {
          id: 'ev-1',
          evidenceType: 'aggregate',
          snapshot: { label: 'Metric A' },
        },
        {
          id: 'ev-2',
          evidenceType: 'aggregate',
          snapshot: { label: 'Metric B' },
        },
        {
          id: 'ev-3',
          evidenceType: 'aggregate',
          snapshot: { label: 'Metric C' },
        },
      ];

      const res = await adapter.generateDraftProposals({
        purpose: 'Check max proposals limit',
        evidence,
        maxProposals: 2,
      });

      expect(res.proposals).toHaveLength(2);
      expect(res.proposals.map((p) => p.citedEvidenceIds[0])).toEqual([
        'ev-1',
        'ev-2',
      ]);
    });

    it('returns an empty array when evidence is empty', async () => {
      const res = await adapter.generateDraftProposals({
        purpose: 'Empty evidence test',
        evidence: [],
        maxProposals: 3,
      });

      expect(res.proposals).toEqual([]);
      expect(res.provider).toBe('fake-gemini');
      expect(res.model).toBe('gemini-test');
      expect(res.rawTokensUsed).toBe(128);
    });
  });

  describe('custom proposals configuration', () => {
    it('returns configured custom proposals capped by maxProposals', async () => {
      const custom: AiDraftProposal[] = [
        {
          heading: 'Custom Insight 1',
          body: 'Detailed body 1',
          citedEvidenceIds: ['ev-custom-1'],
        },
        {
          heading: 'Custom Insight 2',
          body: 'Detailed body 2',
          citedEvidenceIds: ['ev-custom-2'],
        },
        {
          heading: 'Custom Insight 3',
          body: 'Detailed body 3',
          citedEvidenceIds: ['ev-custom-3'],
        },
      ];

      adapter.setCustomProposals(custom);

      const res = await adapter.generateDraftProposals({
        purpose: 'Test custom proposals',
        evidence: [],
        maxProposals: 2,
      });

      expect(res.proposals).toHaveLength(2);
      expect(res.proposals).toEqual(custom.slice(0, 2));
      expect(res.provider).toBe('fake-gemini');
      expect(res.model).toBe('gemini-test');
    });

    it('reverts to default generation when custom proposals are cleared with null', async () => {
      adapter.setCustomProposals([
        {
          heading: 'Temporary Custom',
          body: 'Temp body',
          citedEvidenceIds: ['ev-temp'],
        },
      ]);

      adapter.setCustomProposals(null);

      const res = await adapter.generateDraftProposals({
        purpose: 'Post-reset test',
        evidence: [
          {
            id: 'ev-real',
            evidenceType: 'aggregate',
            label: 'Real Metric',
            value: 88,
            unit: '%',
            snapshot: {},
          },
        ],
        maxProposals: 1,
      });

      expect(res.proposals).toHaveLength(1);
      expect(res.proposals[0].heading).toBe(
        'Growth observation in Real Metric',
      );
      expect(res.proposals[0].citedEvidenceIds).toEqual(['ev-real']);
    });
  });

  describe('error injection', () => {
    it('throws the configured error when errorToThrow is set', async () => {
      const customError = new Error('Simulated upstream failure');
      adapter.setErrorToThrow(customError);

      await expect(
        adapter.generateDraftProposals({
          purpose: 'Error test',
          evidence: [],
          maxProposals: 1,
        }),
      ).rejects.toThrow('Simulated upstream failure');
    });

    it('reverts to normal generation when errorToThrow is cleared with null', async () => {
      adapter.setErrorToThrow(new Error('Temporary error'));
      adapter.setErrorToThrow(null);

      const res = await adapter.generateDraftProposals({
        purpose: 'Recovery test',
        evidence: [],
        maxProposals: 1,
      });

      expect(res.proposals).toEqual([]);
      expect(res.provider).toBe('fake-gemini');
    });
  });
});
