import { escapeFormula, renderPdf } from './reports.service';

describe('report export rendering', () => {
  it.each(['=SUM(A1:A2)', '+cmd', '-2+3', '@lookup', '\t=1', '\r=1'])(
    'neutralizes spreadsheet formula cell %s',
    (value) => {
      expect(escapeFormula(value)).toBe(`'${value}`);
    },
  );

  it('leaves ordinary text unchanged', () => {
    expect(escapeFormula('Population total')).toBe('Population total');
  });

  it('renders a minimal valid PDF structure', () => {
    const rendered = renderPdf({
      id: 'revision-1',
      reportId: 'report-1',
      revisionNumber: 1,
      status: 'published',
      title: 'Population report',
      summary: 'Evidence-backed summary',
      sections: [],
      authorAccountId: 'account-1',
      reviewerAccountId: null,
      publisherAccountId: 'account-1',
      submittedForReviewAt: null,
      publishedAt: new Date('2026-01-01T00:00:00.000Z'),
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      insights: [],
      evidence: [],
    });

    const pdf = rendered.body.toString('utf8');
    expect(pdf).toContain('xref\n0 6');
    expect(pdf).toContain('startxref');
    expect(pdf).toContain('%%EOF');
  });
});
