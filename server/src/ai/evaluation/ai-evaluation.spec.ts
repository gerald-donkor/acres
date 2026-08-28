import {
  validateAndParseModelOutput,
  GroundingRejectionError,
  MalformedOutputError,
} from '../validation/draft-output.validator';
import {
  AI_EVALUATION_FIXTURES,
  type AiEvalTestCase,
} from './ai-evaluation-fixtures';

describe('AI Evaluation Suite (Synthetic Fixtures)', () => {
  it.each(AI_EVALUATION_FIXTURES)(
    'evaluates fixture "$name" [$category] -> expects $expectedOutcome',
    (fixture: AiEvalTestCase) => {
      const allowedIds = new Set(fixture.evidence.map((e) => e.id));

      if (fixture.expectedOutcome === 'success') {
        const result = validateAndParseModelOutput(
          fixture.mockRawOutput,
          allowedIds,
          3,
        );
        expect(result.length).toBeGreaterThan(0);
        if (fixture.expectedProposalCount !== undefined) {
          expect(result.length).toBe(fixture.expectedProposalCount);
        }
        for (const p of result) {
          expect(p.heading.length).toBeGreaterThan(0);
          expect(p.body.length).toBeGreaterThan(0);
          expect(p.citedEvidenceIds.length).toBeGreaterThan(0);
          for (const cite of p.citedEvidenceIds) {
            expect(allowedIds.has(cite)).toBe(true);
          }
        }
      } else if (fixture.expectedOutcome === 'grounding_rejected') {
        expect(() =>
          validateAndParseModelOutput(fixture.mockRawOutput, allowedIds, 3),
        ).toThrow(GroundingRejectionError);
      } else if (fixture.expectedOutcome === 'malformed_output') {
        expect(() =>
          validateAndParseModelOutput(fixture.mockRawOutput, allowedIds, 3),
        ).toThrow(MalformedOutputError);
      }
    },
  );
});
