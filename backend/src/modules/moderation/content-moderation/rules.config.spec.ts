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
