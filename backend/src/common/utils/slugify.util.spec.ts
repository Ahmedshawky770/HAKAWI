import { describe, it, expect } from 'vitest';

import { slugify } from './slugify.util.ts';

/**
 * A slug is a published identifier: it appears in inbound links, bookmarks and search
 * indexes, and a title edit does not re-derive it.
 *
 * TWO LIMITATIONS, DOCUMENTED RATHER THAN SILENTLY "FIXED":
 *
 * 1. `\w` is ASCII-only, so a title in a non-Latin script slugifies to an EMPTY string.
 *    Hakawi is an Arabic-language platform, so this is not hypothetical — the first caller
 *    to wire this up for Arabic titles will get empty slugs. The two tests below pin that
 *    behaviour so it is a known, visible state rather than a surprise.
 *
 * 2. Case and punctuation are normalised away, so distinct titles can collide
 *    ("The Long Road" and "the long road!" are the same slug). That is inherent to
 *    slugification; uniqueness is enforced by a unique index, not by the slug function.
 *
 * `slugify` currently has no caller in `src/`. It is specified here because the next person
 * to wire it up should discover these limits from a test rather than from production.
 */
describe('slugify', () => {
  it('lowercases and hyphenates a title', () => {
    expect(slugify('The Long Road')).toBe('the-long-road');
  });

  it('strips punctuation that has no meaning in a URL segment', () => {
    expect(slugify("What's Up?")).toBe('whats-up');
    expect(slugify('A Tale of Two Cities!')).toBe('a-tale-of-two-cities');
  });

  it('collapses runs of whitespace and separators into a single hyphen', () => {
    expect(slugify('the   long    road')).toBe('the-long-road');
    expect(slugify('a---b')).toBe('a-b');
    expect(slugify('a - b')).toBe('a-b');
  });

  it('trims leading and trailing separators', () => {
    expect(slugify('  Leading and trailing  ')).toBe('leading-and-trailing');
    expect(slugify('---edges---')).toBe('edges');
  });

  it('PROBLEM: reduces a non-Latin title to an empty slug', () => {
    // Documented limitation, not an endorsement. The strip step treats every Arabic or CJK
    // character as punctuation, so a title in those scripts is erased entirely and every
    // such story would collide on one empty slug. Hakawi is an Arabic-language platform, so
    // the first caller to wire this up hits this immediately.
    //
    // Fixing it means transliterating or preserving the original characters, which is a
    // product decision rather than a bug fix — so it is pinned here instead of changed under
    // a coverage commit.
    expect(slugify('حكاوي')).toBe('');
    expect(slugify('走在路上')).toBe('');
  });

  it('is deterministic, so the same title always yields the same slug', () => {
    expect(slugify('The Long Road')).toBe(slugify('The Long Road'));
  });

  it('collapses titles differing only in case or punctuation onto one slug', () => {
    // Also documented rather than fixed: uniqueness is a unique index's job, and a slug
    // function that preserved case would produce ugly, case-sensitive URLs.
    expect(slugify('The Long Road')).toBe(slugify('the long road!'));
  });

  it('returns an empty string for input with nothing sluggable', () => {
    // Worth pinning: an empty slug has to be caught where the story is created, and a caller
    // that assumes slugify always returns something will not check.
    expect(slugify('')).toBe('');
    expect(slugify('!!!')).toBe('');
  });
});
