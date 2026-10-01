import { describe, it, expect } from 'vitest';

import {
  BADGE_METRICS,
  BADGE_RULES,
  BADGE_TRIGGER_EVENTS,
  badgeKeysForTrigger,
  meetsThreshold,
  rulesForTrigger,
  type BadgeRule,
} from './badge-rules.config.ts';

function rule(overrides: Partial<BadgeRule>): BadgeRule {
  return {
    badgeKey: 'test-badge',
    name: 'Test Badge',
    description: 'A test badge',
    icon: 'star',
    trigger: 'story.published',
    metric: 'published_stories',
    comparator: 'gte',
    threshold: 1,
    ...overrides,
  };
}

describe('badge rules config', () => {
  it('should give every rule a unique badge key', () => {
    const keys = BADGE_RULES.map((entry) => entry.badgeKey);

    expect(new Set(keys).size).toBe(keys.length);
  });

  it('should only trigger on events the event bus already publishes', () => {
    for (const entry of BADGE_RULES) {
      expect(BADGE_TRIGGER_EVENTS).toContain(entry.trigger);
    }
  });

  it('should only measure metrics the service can count', () => {
    for (const entry of BADGE_RULES) {
      expect(BADGE_METRICS).toContain(entry.metric);
    }
  });

  it('should never use a negative threshold', () => {
    for (const entry of BADGE_RULES) {
      expect(entry.threshold).toBeGreaterThanOrEqual(0);
    }
  });

  it('should cover contest wins, publication, followers and moderation', () => {
    const metrics = new Set(BADGE_RULES.map((entry) => entry.metric));

    expect(metrics).toContain('contest_wins');
    expect(metrics).toContain('published_stories');
    expect(metrics).toContain('follower_count');
    expect(metrics).toContain('moderation_actions');
  });

  describe('rulesForTrigger', () => {
    it('should return only the rules bound to that trigger', () => {
      const rules = rulesForTrigger('user.followed');

      expect(rules.length).toBeGreaterThan(0);
      for (const entry of rules) {
        expect(entry.trigger).toBe('user.followed');
      }
    });

    it('should return an empty list for a trigger with no rules', () => {
      expect(rulesForTrigger('contest.completed')).toEqual([]);
    });

    it('should expose the badge keys for a trigger', () => {
      expect(badgeKeysForTrigger('moderation.action.taken')).toEqual(['guardian', 'steward']);
    });
  });

  describe('meetsThreshold', () => {
    it('should accept a value at the threshold for gte', () => {
      expect(meetsThreshold(3, rule({ comparator: 'gte', threshold: 3 }))).toBe(true);
    });

    it('should reject a value below the threshold for gte', () => {
      expect(meetsThreshold(2, rule({ comparator: 'gte', threshold: 3 }))).toBe(false);
    });

    it('should reject a value equal to the threshold for gt', () => {
      expect(meetsThreshold(3, rule({ comparator: 'gt', threshold: 3 }))).toBe(false);
    });

    it('should accept a value above the threshold for gt', () => {
      expect(meetsThreshold(4, rule({ comparator: 'gt', threshold: 3 }))).toBe(true);
    });

    it('should only accept an exact match for eq', () => {
      expect(meetsThreshold(3, rule({ comparator: 'eq', threshold: 3 }))).toBe(true);
      expect(meetsThreshold(4, rule({ comparator: 'eq', threshold: 3 }))).toBe(false);
    });
  });
});
