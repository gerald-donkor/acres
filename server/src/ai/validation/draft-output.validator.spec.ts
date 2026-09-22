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

  it('rejects empty or non-string input', () => {
    expect(() => validateAndParseModelOutput('', allowedIds, 3)).toThrow(
      MalformedOutputError,
    );
    expect(() =>
      validateAndParseModelOutput(null as unknown as string, allowedIds, 3),
    ).toThrow(MalformedOutputError);
  });

  it('strips generic markdown code fences without json identifier', () => {
    const raw = `\`\`\`
{
  "proposals": [
    {
      "heading": "Generic Fence Proposal",
      "body": "Body content here.",
      "citedEvidenceIds": ["11111111-1111-7111-8111-111111111111"]
    }
  ]
}
\`\`\``;

    const result = validateAndParseModelOutput(raw, allowedIds, 3);
    expect(result).toHaveLength(1);
    expect(result[0].heading).toBe('Generic Fence Proposal');
  });

  it('accepts raw JSON array of proposals directly', () => {
    const raw = JSON.stringify([
      {
        heading: 'Top Level Array Proposal',
        body: 'Body content here.',
        evidenceIds: ['11111111-1111-7111-8111-111111111111'],
      },
    ]);

    const result = validateAndParseModelOutput(raw, allowedIds, 3);
    expect(result).toHaveLength(1);
    expect(result[0].heading).toBe('Top Level Array Proposal');
  });

  it('rejects JSON missing proposals array or with empty proposals array', () => {
    expect(() =>
      validateAndParseModelOutput(
        JSON.stringify({ notProposals: [] }),
        allowedIds,
        3,
      ),
    ).toThrow('Model JSON does not contain a proposals array.');

    expect(() =>
      validateAndParseModelOutput(
        JSON.stringify({ proposals: [] }),
        allowedIds,
        3,
      ),
    ).toThrow('Model returned an empty proposals array.');
  });

  it('rejects non-object proposal items', () => {
    const raw = JSON.stringify({
      proposals: ['not-an-object'],
    });

    expect(() => validateAndParseModelOutput(raw, allowedIds, 3)).toThrow(
      'Proposal at index 0 is not a valid object.',
    );
  });

  it('rejects missing or overly long headings', () => {
    const missingHeading = JSON.stringify({
      proposals: [
        {
          heading: '',
          body: 'Valid body',
          citedEvidenceIds: ['11111111-1111-7111-8111-111111111111'],
        },
      ],
    });
    expect(() =>
      validateAndParseModelOutput(missingHeading, allowedIds, 3),
    ).toThrow(/Proposal heading must be 1-160 characters/);

    const longHeading = JSON.stringify({
      proposals: [
        {
          heading: 'A'.repeat(161),
          body: 'Valid body',
          citedEvidenceIds: ['11111111-1111-7111-8111-111111111111'],
        },
      ],
    });
    expect(() =>
      validateAndParseModelOutput(longHeading, allowedIds, 3),
    ).toThrow(/Proposal heading must be 1-160 characters/);
  });

  it('rejects missing or overly long bodies', () => {
    const missingBody = JSON.stringify({
      proposals: [
        {
          heading: 'Valid Heading',
          body: '',
          citedEvidenceIds: ['11111111-1111-7111-8111-111111111111'],
        },
      ],
    });
    expect(() =>
      validateAndParseModelOutput(missingBody, allowedIds, 3),
    ).toThrow(/Proposal body must be 1-4000 characters/);

    const longBody = JSON.stringify({
      proposals: [
        {
          heading: 'Valid Heading',
          body: 'B'.repeat(4001),
          citedEvidenceIds: ['11111111-1111-7111-8111-111111111111'],
        },
      ],
    });
    expect(() => validateAndParseModelOutput(longBody, allowedIds, 3)).toThrow(
      /Proposal body must be 1-4000 characters/,
    );
  });

  it('rejects proposals with only whitespace citations', () => {
    const raw = JSON.stringify({
      proposals: [
        {
          heading: 'Valid Heading',
          body: 'Valid body',
          citedEvidenceIds: ['  ', ''],
        },
      ],
    });
    expect(() => validateAndParseModelOutput(raw, allowedIds, 3)).toThrow(
      GroundingRejectionError,
    );
  });

  it('skips duplicate proposals with identical headings (case-insensitive)', () => {
    const raw = JSON.stringify({
      proposals: [
        {
          heading: 'Unique Trend',
          body: 'Body 1',
          citedEvidenceIds: ['11111111-1111-7111-8111-111111111111'],
        },
        {
          heading: 'unique trend',
          body: 'Body 2',
          citedEvidenceIds: ['11111111-1111-7111-8111-111111111111'],
        },
      ],
    });

    const result = validateAndParseModelOutput(raw, allowedIds, 3);
    expect(result).toHaveLength(1);
    expect(result[0].heading).toBe('Unique Trend');
  });
});
