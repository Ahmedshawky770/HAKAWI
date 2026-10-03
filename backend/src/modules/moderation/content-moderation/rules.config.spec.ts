import { describe, it, expect } from 'vitest';

import {
  CONTENT_MODERATION_RULES,
  CONTENT_MODERATION_RULE_KINDS,
  CONTENT_MODERATION_TARGET_TYPES,
  evaluateContent,
  rulesForTarget,
  type ContentModerationRule,
  type ContentModerationRuleKind,
} from './rules.config.ts';

function rule(overrides: Partial<ContentModerationRule> & { kind: ContentModerationRuleKind }): ContentModerationRule {
  return {
    id: 'test-rule',
    targetTypes: CONTENT_MODERATION_TARGET_TYPES,
    reason: 'auto:test',
    severity: 'medium',
    autoEscalate: false,
    ...overrides,
  };
}

describe('content moderation rules', () => {
  describe('the shipped rule set', () => {
    it('should give every rule a unique id', () => {
      const ids = CONTENT_MODERATION_RULES.map((entry) => entry.id);

      expect(new Set(ids).size).toBe(ids.length);
    });

    it('should only use declared kinds', () => {
      for (const entry of CONTENT_MODERATION_RULES) {
        expect(CONTENT_MODERATION_RULE_KINDS).toContain(entry.kind);
      }
    });

    it('should namespace every machine reason', () => {
      for (const entry of CONTENT_MODERATION_RULES) {
        expect(entry.reason).toMatch(/^auto:/);
      }
    });

    it('should declare the threshold a rule needs to act on', () => {
      for (const entry of CONTENT_MODERATION_RULES) {
        const declared =
          entry.maxMatches !== undefined ||
          entry.maxLinks !== undefined ||
          entry.repetitionRunLength !== undefined ||
          entry.minimumLength !== undefined;
        expect(declared).toBe(true);
      }
    });

    it('should scope the minimum length rule to comments only', () => {
      const minimumLength = rulesForTarget('comment').map((entry) => entry.id);
      const storyLength = rulesForTarget('story').map((entry) => entry.id);

      expect(minimumLength).toContain('comment-minimum-length');
      expect(storyLength).not.toContain('comment-minimum-length');
    });
  });

  describe('prohibited terms', () => {
    it('should flag content carrying a configured term', () => {
      const [violation] = evaluateContent('story', 'Get FREE MONEY today with our offer');

      expect(violation?.ruleId).toBe('prohibited-terms');
      expect(violation?.severity).toBe('high');
      expect(violation?.autoEscalate).toBe(true);
      expect(violation?.detail).toContain('free money');
    });

    it('should ignore punctuation and casing between the words', () => {
      const [violation] = evaluateContent('comment', 'buy-followers, right now');

      expect(violation?.ruleId).toBe('prohibited-terms');
    });

    it('should stay quiet on ordinary prose', () => {
      expect(evaluateContent('story', 'A short story about a lighthouse keeper')).toEqual([]);
    });

    it('should respect a raised match threshold', () => {
      const permissive = rule({ kind: 'prohibited_terms', terms: ['alpha', 'beta'], maxMatches: 3 });

      expect(evaluateContent('story', 'alpha beta', [permissive])).toEqual([]);
    });
  });

  describe('link spam', () => {
    it('should flag content at or over the link limit', () => {
      const [violation] = evaluateContent('comment', 'see https://a.test and www.b.test');

      expect(violation?.ruleId).toBe('link-spam');
    });

    it('should allow a single link', () => {
      expect(evaluateContent('comment', 'see https://a.test')).toEqual([]);
    });
  });

  describe('character repetition', () => {
    it('should flag a long run of one character', () => {
      const [violation] = evaluateContent('story', `aaaaaaaaaaaa${'b'}`);

      expect(violation?.ruleId).toBe('character-repetition');
      expect(violation?.autoEscalate).toBe(false);
    });

    it('should not flag natural word repetition', () => {
      expect(evaluateContent('story', 'ha ha ha ha had had had')).toEqual([]);
    });
  });

  describe('minimum length', () => {
    it('should flag a comment that normalises to nothing', () => {
      const [violation] = evaluateContent('comment', ' ! ');

      expect(violation?.ruleId).toBe('comment-minimum-length');
    });

    it('should not flag a real sentence', () => {
      expect(evaluateContent('comment', 'Nice story')).toEqual([]);
    });
  });

  describe('evaluateContent', () => {
    it('should never evaluate empty content', () => {
      expect(evaluateContent('story', '')).toEqual([]);
    });

    it('should return one violation per tripped rule', () => {
      const violations = evaluateContent('comment', 'free money https://a.test https://b.test');

      expect(violations.map((entry) => entry.ruleId)).toEqual(['prohibited-terms', 'link-spam']);
    });
  });
});

/**
 * The normaliser used to strip everything outside `[a-z0-9]`, which for an Arabic corpus meant the
 * whole string. Two rules consumed that value and neither survived it:
 *
 *  - `comment-minimum-length` measured the empty string, so EVERY Arabic comment was auto-reported
 *    as too short — a false positive per comment, not a missed detection;
 *  - `prohibited_terms` searched the empty string, so it never matched anything in Arabic.
 *
 * Every pre-existing case in this file was ASCII-only, which is exactly why the defect survived.
 * These are the regression guard.
 */
describe('normalisation of Arabic content', () => {
  it('does not treat a real Arabic comment as empty', () => {
    const outcomes = evaluateContent('comment', 'قصة قصيرة');
    expect(outcomes.map((outcome) => outcome.ruleId)).not.toContain('comment-minimum-length');
  });

  it('still treats a punctuation-only comment as empty', () => {
    // The complementary guarantee: the fix must not turn minimum_length off, only stop it firing
    // on content that has text in it.
    const outcomes = evaluateContent('comment', '   !   ');
    expect(outcomes.map((outcome) => outcome.ruleId)).toContain('comment-minimum-length');
  });

  it('matches an Arabic prohibited term', () => {
    const outcomes = evaluateContent('story', 'اشتر متابعين رخيص جدا');
    expect(outcomes.map((outcome) => outcome.ruleId)).toContain('prohibited-terms');
  });

  it('does not let harakat or tatweel fork an Arabic term match', () => {
    // One word, three spellings. Dropping any single normalisation step makes these diverge, and a
    // writer then evades the list just by typing a diacritic.
    for (const text of ['اشتر متابعين', 'اشترِ متابعين', 'اشــتر متابعين']) {
      const outcomes = evaluateContent('story', text);
      expect(outcomes.map((outcome) => outcome.ruleId)).toContain('prohibited-terms');
    }
  });

  it('does not let an alef variant fork an Arabic term match', () => {
    // إ (U+0625 hamza below), آ (U+0622 madda) and ا (U+0627) are the same letter. A writer who
    // types the bare alef everywhere would otherwise evade a list written with a marked one.
    for (const text of ['اضغط هنا الان', 'إضغط هنا الآن', 'إضغط هنا الان', 'اضغط هنا الآن']) {
      const outcomes = evaluateContent('story', text);
      expect(outcomes.map((outcome) => outcome.ruleId)).toContain('prohibited-terms');
    }
  });

  it('folds alef maqsura to yeh, but does not fold yeh back to alef', () => {
    // One direction is a spelling variant and the other is a different word. "على" and "علي" are the
    // same preposition written two ways; "في" and "فا" are not the same word at all. Folding
    // symmetrically would merge them and put a false positive on legitimate prose, which on a rule
    // with autoEscalate is worse than a miss — so the fold is deliberately one-way.
    expect(evaluateContent('story', 'اشتر متابعين على اى').map((o) => o.ruleId)).toContain('prohibited-terms');
    expect(evaluateContent('story', 'اشتر متابعين على في')).not.toContain('prohibited-terms');
  });

  it('leaves clean Arabic prose unflagged', () => {
    // The other half of the guarantee: ordinary Arabic must not trip anything, which it would have
    // done through minimum_length under the old normaliser.
    expect(evaluateContent('story', 'كان يا ما كان في زمن بعيد،那时候只有很少的人会讲故事')).toEqual([]);
  });

  it('keeps flagging link spam in Arabic', () => {
    // link_spam reads rawText and was never broken by the normaliser; this pins that a future
    // change to the shared text does not regress it silently.
    const outcomes = evaluateContent('story', 'اقرأ https://a.test و www.b.test');
    expect(outcomes.map((outcome) => outcome.ruleId)).toContain('link-spam');
  });
});
