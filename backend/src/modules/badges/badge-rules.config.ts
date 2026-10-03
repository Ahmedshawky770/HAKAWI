export const BADGE_TRIGGER_EVENTS = [
  'winner.selected',
  'contest.completed',
  'story.published',
  'user.followed',
  'moderation.action.taken',
] as const;

export type BadgeTriggerEvent = (typeof BADGE_TRIGGER_EVENTS)[number];

export const BADGE_COMPARATORS = ['gte', 'gt', 'eq'] as const;

export type BadgeComparator = (typeof BADGE_COMPARATORS)[number];

export const BADGE_METRICS = ['contest_wins', 'published_stories', 'follower_count', 'moderation_actions'] as const;

export type BadgeMetric = (typeof BADGE_METRICS)[number];

export interface BadgeRule {
  readonly badgeKey: string;
  readonly name: string;
  readonly description: string;
  readonly icon: string;
  readonly trigger: BadgeTriggerEvent;
  readonly metric: BadgeMetric;
  readonly comparator: BadgeComparator;
  readonly threshold: number;
}

export const BADGE_RULES: readonly BadgeRule[] = [
  {
    badgeKey: 'contest-champion',
    name: 'Contest Champion',
    description: 'Won a writing contest',
    icon: 'trophy',
    trigger: 'winner.selected',
    metric: 'contest_wins',
    comparator: 'gte',
    threshold: 1,
  },
  {
    badgeKey: 'contest-legend',
    name: 'Contest Legend',
    description: 'Won three writing contests',
    icon: 'crown',
    trigger: 'winner.selected',
    metric: 'contest_wins',
    comparator: 'gte',
    threshold: 3,
  },
  {
    badgeKey: 'first-publication',
    name: 'First Publication',
    description: 'Published a first story',
    icon: 'feather',
    trigger: 'story.published',
    metric: 'published_stories',
    comparator: 'gte',
    threshold: 1,
  },
  {
    badgeKey: 'prolific-author',
    name: 'Prolific Author',
    description: 'Published five stories',
    icon: 'books',
    trigger: 'story.published',
    metric: 'published_stories',
    comparator: 'gte',
    threshold: 5,
  },
  {
    badgeKey: 'rising-author',
    name: 'Rising Author',
    description: 'Gained ten followers',
    icon: 'users',
    trigger: 'user.followed',
    metric: 'follower_count',
    comparator: 'gte',
    threshold: 10,
  },
  {
    badgeKey: 'community-pillar',
    name: 'Community Pillar',
    description: 'Gained one hundred followers',
    icon: 'star',
    trigger: 'user.followed',
    metric: 'follower_count',
    comparator: 'gte',
    threshold: 100,
  },
  {
    badgeKey: 'guardian',
    name: 'Guardian',
    description: 'Took a first moderation action',
    icon: 'shield',
    trigger: 'moderation.action.taken',
    metric: 'moderation_actions',
    comparator: 'gte',
    threshold: 1,
  },
  {
    badgeKey: 'steward',
    name: 'Steward',
    description: 'Took ten moderation actions',
    icon: 'shield-check',
    trigger: 'moderation.action.taken',
    metric: 'moderation_actions',
    comparator: 'gte',
    threshold: 10,
  },
];

export function meetsThreshold(value: number, rule: BadgeRule): boolean {
  switch (rule.comparator) {
    case 'gte':
      return value >= rule.threshold;
    case 'gt':
      return value > rule.threshold;
    case 'eq':
      return value === rule.threshold;
    default:
      return false;
  }
}

export function rulesForTrigger(trigger: BadgeTriggerEvent): readonly BadgeRule[] {
  return BADGE_RULES.filter((rule) => rule.trigger === trigger);
}

export function badgeKeysForTrigger(trigger: BadgeTriggerEvent): readonly string[] {
  return rulesForTrigger(trigger).map((rule) => rule.badgeKey);
}
