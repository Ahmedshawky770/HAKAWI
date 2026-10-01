export const CONTENT_MODERATION_TARGET_TYPES = ['story', 'comment'] as const;

export type ContentModerationTargetType = (typeof CONTENT_MODERATION_TARGET_TYPES)[number];

export const CONTENT_MODERATION_RULE_KINDS = [
  'prohibited_terms',
  'link_spam',
  'character_repetition',
  'minimum_length',
] as const;

export type ContentModerationRuleKind = (typeof CONTENT_MODERATION_RULE_KINDS)[number];

export const CONTENT_MODERATION_SEVERITIES = ['low', 'medium', 'high'] as const;

export type ContentModerationSeverity = (typeof CONTENT_MODERATION_SEVERITIES)[number];

export interface ContentModerationRule {
  readonly id: string;
  readonly kind: ContentModerationRuleKind;
  readonly targetTypes: readonly ContentModerationTargetType[];
  readonly reason: string;
  readonly severity: ContentModerationSeverity;
  readonly autoEscalate: boolean;
  readonly terms?: readonly string[];
  readonly maxMatches?: number;
  readonly maxLinks?: number;
  readonly repetitionRunLength?: number;
  readonly minimumLength?: number;
}

export interface RuleViolation {
  readonly ruleId: string;
  readonly reason: string;
  readonly severity: ContentModerationSeverity;
  readonly autoEscalate: boolean;
  readonly detail: string;
}

const PROHIBITED_TERMS = [
  'buy followers',
  'free money',
  'casino bonus',
  'crypto giveaway',
  'work from home income',
  'click here now',
] as const;

export const CONTENT_MODERATION_RULES: readonly ContentModerationRule[] = [
  {
    id: 'prohibited-terms',
    kind: 'prohibited_terms',
    targetTypes: CONTENT_MODERATION_TARGET_TYPES,
    reason: 'auto:prohibited_terms',
    severity: 'high',
    autoEscalate: true,
    terms: PROHIBITED_TERMS,
    maxMatches: 1,
  },
  {
    id: 'link-spam',
    kind: 'link_spam',
    targetTypes: CONTENT_MODERATION_TARGET_TYPES,
    reason: 'auto:link_spam',
    severity: 'medium',
    autoEscalate: true,
    maxLinks: 2,
  },
  {
    id: 'character-repetition',
    kind: 'character_repetition',
    targetTypes: CONTENT_MODERATION_TARGET_TYPES,
    reason: 'auto:character_repetition',
    severity: 'low',
    autoEscalate: false,
    repetitionRunLength: 12,
  },
  {
    id: 'comment-minimum-length',
    kind: 'minimum_length',
    targetTypes: ['comment'],
    reason: 'auto:comment_too_short',
    severity: 'low',
    autoEscalate: false,
    minimumLength: 2,
  },
];

export function rulesForTarget(targetType: ContentModerationTargetType): readonly ContentModerationRule[] {
  return CONTENT_MODERATION_RULES.filter((rule) => rule.targetTypes.includes(targetType));
}

function normalizeForTermSearch(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const URL_PATTERN = /https?:\/\/|www\./gi;

function longestRepetitionRun(text: string): number {
  let longest = 0;
  let current = 1;
  for (let index = 1; index < text.length; index += 1) {
    if (text[index] === text[index - 1]) {
      current += 1;
      if (current > longest) {
        longest = current;
      }
    } else {
      current = 1;
    }
  }
  return longest;
}

function evaluateRule(rule: ContentModerationRule, rawText: string): RuleViolation | null {
  const searchable = normalizeForTermSearch(rawText);

  switch (rule.kind) {
    case 'prohibited_terms': {
      const matched = (rule.terms ?? []).filter((term) => searchable.includes(term));
      const limit = rule.maxMatches ?? 1;
      if (matched.length < limit) {
        return null;
      }
      return {
        ruleId: rule.id,
        reason: rule.reason,
        severity: rule.severity,
        autoEscalate: rule.autoEscalate,
        detail: `matched prohibited terms: ${matched.join(', ')}`,
      };
    }
    case 'link_spam': {
      const links = rawText.match(URL_PATTERN) ?? [];
      const limit = rule.maxLinks ?? 1;
      if (links.length < limit) {
        return null;
      }
      return {
        ruleId: rule.id,
        reason: rule.reason,
        severity: rule.severity,
        autoEscalate: rule.autoEscalate,
        detail: `contained ${links.length} link(s), limit is ${limit}`,
      };
    }
    case 'character_repetition': {
      const run = longestRepetitionRun(rawText);
      const limit = rule.repetitionRunLength ?? 10;
      if (run < limit) {
        return null;
      }
      return {
        ruleId: rule.id,
        reason: rule.reason,
        severity: rule.severity,
        autoEscalate: rule.autoEscalate,
        detail: `contained a run of ${run} repeated characters, limit is ${limit}`,
      };
    }
    case 'minimum_length': {
      const minimum = rule.minimumLength ?? 1;
      if (searchable.length >= minimum) {
        return null;
      }
      return {
        ruleId: rule.id,
        reason: rule.reason,
        severity: rule.severity,
        autoEscalate: rule.autoEscalate,
        detail: `content was ${searchable.length} characters after normalisation, minimum is ${minimum}`,
      };
    }
    default:
      return null;
  }
}

export function evaluateContent(
  targetType: ContentModerationTargetType,
  text: string,
  rules: readonly ContentModerationRule[] = rulesForTarget(targetType),
): RuleViolation[] {
  if (text.length === 0) {
    return [];
  }
  return rules
    .map((rule) => evaluateRule(rule, text))
    .filter((violation): violation is RuleViolation => violation !== null);
}
