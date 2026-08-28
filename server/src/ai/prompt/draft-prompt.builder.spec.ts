import {
  buildDraftPrompt,
  computeCanonicalInputHash,
  PROMPT_TEMPLATE_VERSION,
} from './draft-prompt.builder';

describe('draft-prompt.builder', () => {
  const mockEvidence = [
    {
      id: '11111111-1111-7111-8111-111111111111',
      evidenceType: 'aggregate',
      label: 'Corn Yield',
      value: 180,
      unit: 'bushels',
      snapshot: {
        metric: { label: 'Corn Yield', unit: 'bushels' },
        value: 180,
      },
    },
    {
      id: '22222222-2222-7222-8222-222222222222',
      evidenceType: 'dashboard_view',
      label: 'Water Efficiency View',
      snapshot: { name: 'Water Efficiency View' },
    },
  ];

  it('builds system instruction with strict grounding and delimiter rules', () => {
    const prompt = buildDraftPrompt({
      purpose: 'Summarize regional yield trends',
      evidence: mockEvidence,
      maxProposals: 2,
    });

    expect(prompt.templateVersion).toBe(PROMPT_TEMPLATE_VERSION);
    expect(prompt.systemInstruction).toContain('Strict Grounding Rules');
    expect(prompt.systemInstruction).toContain('citedEvidenceIds');
    expect(prompt.systemInstruction).toContain('<evidence_context>');
    expect(prompt.systemInstruction).toContain('<user_purpose>');
    expect(prompt.userPrompt).toContain('<evidence_context>');
    expect(prompt.userPrompt).toContain('11111111-1111-7111-8111-111111111111');
    expect(prompt.userPrompt).toContain('Summarize regional yield trends');
  });

  it('produces deterministic SHA-256 canonical hash regardless of evidence order', () => {
    const hash1 = computeCanonicalInputHash({
      purpose: 'Summarize regional yield trends',
      evidence: [mockEvidence[0], mockEvidence[1]],
      maxProposals: 2,
      templateVersion: PROMPT_TEMPLATE_VERSION,
    });

    const hash2 = computeCanonicalInputHash({
      purpose: 'Summarize regional yield trends',
      evidence: [mockEvidence[1], mockEvidence[0]],
      maxProposals: 2,
      templateVersion: PROMPT_TEMPLATE_VERSION,
    });

    expect(hash1).toBe(hash2);
    expect(hash1).toMatch(/^[0-9a-f]{64}$/);
  });

  it('changes input hash when purpose, template version or proposal count change', () => {
    const baseHash = computeCanonicalInputHash({
      purpose: 'Summarize regional yield trends',
      evidence: mockEvidence,
      maxProposals: 2,
      templateVersion: PROMPT_TEMPLATE_VERSION,
    });

    const diffPurposeHash = computeCanonicalInputHash({
      purpose: 'Different purpose',
      evidence: mockEvidence,
      maxProposals: 2,
      templateVersion: PROMPT_TEMPLATE_VERSION,
    });

    const diffCountHash = computeCanonicalInputHash({
      purpose: 'Summarize regional yield trends',
      evidence: mockEvidence,
      maxProposals: 3,
      templateVersion: PROMPT_TEMPLATE_VERSION,
    });

    expect(diffPurposeHash).not.toBe(baseHash);
    expect(diffCountHash).not.toBe(baseHash);
  });
});
