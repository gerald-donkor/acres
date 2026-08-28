import {
  GroundingRejectionError,
  MalformedOutputError,
  validateAndParseModelOutput,
} from './draft-output.validator';

describe('draft-output.validator', () => {
  const allowedIds = new Set([
    '11111111-1111-7111-8111-111111111111',
    '22222222-2222-7222-8222-222222222222',
  ]);

  it('successfully parses valid proposal JSON', () => {
    const raw = JSON.stringify({
      proposals: [
        {
          heading: 'Positive Nitrogen Trend',
          body: 'Measured levels showed steady growth.',
          citedEvidenceIds: ['11111111-1111-7111-8111-111111111111'],
        },
      ],
    });

    const result = validateAndParseModelOutput(raw, allowedIds, 3);
    expect(result).toHaveLength(1);
    expect(result[0].heading).toBe('Positive Nitrogen Trend');
    expect(result[0].citedEvidenceIds).toEqual([
      '11111111-1111-7111-8111-111111111111',
    ]);
  });

  it('strips markdown code fences if present', () => {
    const raw = `\`\`\`json
{
  "proposals": [
    {
      "heading": "Fence Wrapped Proposal",
      "body": "Body content here.",
      "citedEvidenceIds": ["11111111-1111-7111-8111-111111111111"]
    }
  ]
}
\`\`\``;

    const result = validateAndParseModelOutput(raw, allowedIds, 3);
    expect(result).toHaveLength(1);
    expect(result[0].heading).toBe('Fence Wrapped Proposal');
  });

  it('rejects foreign evidence IDs not in allowed list', () => {
    const raw = JSON.stringify({
      proposals: [
        {
          heading: 'Hallucinated Citation',
          body: 'Some claim.',
          citedEvidenceIds: ['99999999-9999-7999-8999-999999999999'],
        },
      ],
    });

    expect(() => validateAndParseModelOutput(raw, allowedIds, 3)).toThrow(
      GroundingRejectionError,
    );
  });

  it('rejects empty citations list', () => {
    const raw = JSON.stringify({
      proposals: [
        {
          heading: 'Uncited Claim',
          body: 'Some claim without evidence.',
          citedEvidenceIds: [],
        },
      ],
    });

    expect(() => validateAndParseModelOutput(raw, allowedIds, 3)).toThrow(
      GroundingRejectionError,
    );
  });

  it('rejects malformed non-JSON string', () => {
    expect(() =>
      validateAndParseModelOutput('not a json object', allowedIds, 3),
    ).toThrow(MalformedOutputError);
  });

  it('enforces maximum proposal bounding', () => {
    const raw = JSON.stringify({
      proposals: [
        {
          heading: 'Proposal 1',
          body: 'Body 1',
          citedEvidenceIds: ['11111111-1111-7111-8111-111111111111'],
        },
        {
          heading: 'Proposal 2',
          body: 'Body 2',
          citedEvidenceIds: ['22222222-2222-7222-8222-222222222222'],
        },
        {
          heading: 'Proposal 3',
          body: 'Body 3',
          citedEvidenceIds: ['11111111-1111-7111-8111-111111111111'],
        },
      ],
    });

    const result = validateAndParseModelOutput(raw, allowedIds, 2);
    expect(result).toHaveLength(2);
  });
});
