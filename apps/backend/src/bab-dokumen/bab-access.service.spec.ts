import { withSectionList, withSectionReview } from './bab-access.service';

describe('withSectionReview', () => {
  const base = { locked: false, reviewSubmittedAt: null };
  const at = new Date('2026-09-21');

  it('keeps chapter flags when there are no sections', () => {
    expect(withSectionReview({ ...base, sections: [] })).toEqual(base);
  });

  it('locked only when every section is locked', () => {
    const s = (locked: boolean) => ({ locked, reviewSubmittedAt: null });
    expect(withSectionReview({ ...base, sections: [s(true), s(true)] }).locked).toBe(true);
    expect(withSectionReview({ ...base, sections: [s(true), s(false)] }).locked).toBe(false);
  });

  it('reviewSubmittedAt comes from any submitted section; sections are stripped', () => {
    const out = withSectionReview({
      ...base,
      sections: [{ locked: false, reviewSubmittedAt: null }, { locked: false, reviewSubmittedAt: at }],
    });
    expect(out.reviewSubmittedAt).toBe(at);
    expect(out).not.toHaveProperty('sections');
  });
});

describe('withSectionList', () => {
  const at = new Date('2026-09-21');

  it('keeps sections while deriving the same chapter flags', () => {
    const sections = [
      { id: 'a', locked: true, reviewSubmittedAt: null },
      { id: 'b', locked: true, reviewSubmittedAt: at },
    ];
    const out = withSectionList({ locked: false, reviewSubmittedAt: null, sections });
    expect(out.sections).toBe(sections);
    expect(out.locked).toBe(true);
    expect(out.reviewSubmittedAt).toBe(at);
  });

  it('leaves chapter flags alone with no sections', () => {
    const out = withSectionList({ locked: true, reviewSubmittedAt: null, sections: [] });
    expect(out).toEqual({ locked: true, reviewSubmittedAt: null, sections: [] });
  });
});
