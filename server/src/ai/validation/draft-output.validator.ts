import type { AiDraftProposal } from '@acres/shared';

export class GroundingRejectionError extends Error {
  constructor(
    message: string,
    readonly invalidCitations?: string[],
  ) {
    super(message);
    this.name = 'GroundingRejectionError';
  }
}

export class MalformedOutputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MalformedOutputError';
  }
}

export function validateAndParseModelOutput(
  rawText: string,
  allowedEvidenceIds: Set<string>,
  maxProposals: number,
): AiDraftProposal[] {
  if (!rawText || typeof rawText !== 'string') {
    throw new MalformedOutputError('Model response is empty or non-string.');
  }

  // Strip markdown code fences if present
  let cleaned = rawText.trim();
  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.replace(/^```json\s*/, '').replace(/\s*```$/, '');
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```\s*/, '').replace(/\s*```$/, '');
  }
  cleaned = cleaned.trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    throw new MalformedOutputError(
      `Model response is not valid JSON: ${(err as Error).message}`,
    );
  }

  let rawList: unknown[];
  if (Array.isArray(parsed)) {
    rawList = parsed;
  } else if (
    parsed &&
    typeof parsed === 'object' &&
    'proposals' in parsed &&
    Array.isArray(parsed.proposals)
  ) {
    rawList = (parsed as { proposals: unknown[] }).proposals;
  } else {
    throw new MalformedOutputError(
      'Model JSON does not contain a proposals array.',
    );
  }

  if (rawList.length === 0) {
    throw new MalformedOutputError('Model returned an empty proposals array.');
  }

  if (rawList.length > maxProposals) {
    rawList = rawList.slice(0, maxProposals);
  }

  const proposals: AiDraftProposal[] = [];
  const seenHeadings = new Set<string>();

  for (let i = 0; i < rawList.length; i++) {
    const item = rawList[i];
    if (!item || typeof item !== 'object') {
      throw new MalformedOutputError(
        `Proposal at index ${i} is not a valid object.`,
      );
    }

    const rec = item as Record<string, unknown>;
    const heading = typeof rec.heading === 'string' ? rec.heading.trim() : '';
    const body = typeof rec.body === 'string' ? rec.body.trim() : '';
    const rawCitations = Array.isArray(rec.citedEvidenceIds)
      ? rec.citedEvidenceIds
      : Array.isArray(rec.evidenceIds)
        ? rec.evidenceIds
        : [];

    if (!heading || heading.length > 160) {
      throw new MalformedOutputError(
        `Proposal heading must be 1-160 characters (received length ${heading.length}).`,
      );
    }

    if (!body || body.length > 4000) {
      throw new MalformedOutputError(
        `Proposal body must be 1-4000 characters (received length ${body.length}).`,
      );
    }

    const citationStrings = rawCitations
      .map((c) => (typeof c === 'string' ? c.trim() : ''))
      .filter((c) => Boolean(c));

    if (citationStrings.length === 0) {
      throw new GroundingRejectionError(
        `Proposal "${heading}" contains no cited evidence references.`,
      );
    }

    const foreignCitations: string[] = [];
    const validCitations: string[] = [];
    for (const cite of citationStrings) {
      if (!allowedEvidenceIds.has(cite)) {
        foreignCitations.push(cite);
      } else if (!validCitations.includes(cite)) {
        validCitations.push(cite);
      }
    }

    if (foreignCitations.length > 0) {
      throw new GroundingRejectionError(
        `Proposal references unknown or unprovided evidence ID(s): ${foreignCitations.join(', ')}`,
        foreignCitations,
      );
    }

    if (validCitations.length === 0) {
      throw new GroundingRejectionError(
        `Proposal "${heading}" has no valid evidence citations.`,
      );
    }

    if (seenHeadings.has(heading.toLowerCase())) {
      // Skip duplicate proposal
      continue;
    }
    seenHeadings.add(heading.toLowerCase());

    proposals.push({
      heading,
      body,
      citedEvidenceIds: validCitations,
    });
  }

  if (proposals.length === 0) {
    throw new MalformedOutputError('No valid distinct proposals parsed.');
  }

  return proposals;
}
