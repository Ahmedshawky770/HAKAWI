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

/**
 * Matched against the NORMALISED text, so each entry must be written in its normalised form:
 * lowercase, no harakat, no tatweel, alef/yeh/teh-marbuta folded to their canonical code point
 * (see `normalizeForTermSearch`), punctuation collapsed to single spaces. A writer who adds a
 * diacritic, stretches a letter, or types a different alef variant cannot fork the match.
 *
 * The Arabic entries are the direct equivalents of the Latin ones, and they only became matchable
 * once the normaliser stopped emptying every Arabic word. Before that they were dead text in a list
 * the rule could never act on.
 */
const PROHIBITED_TERMS = [
  'buy followers',
  'free money',
  'casino bonus',
  'crypto giveaway',
  'work from home income',
  'click here now',
  'اشتر متابعين',
  'متابعين مجانا',
  'مال مجاني',
  'مكافاهه كازينو',
  'هديه عملات رقميه',
  'اكسب من المنزل',
  'اضغط هنا الان',
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

/**
 * Arabic harakat (tashkeel) and the Quranic marks. A writer may or may not type them, so they must
 * not decide whether a word matches.
 *
 * WRITTEN AS `\u` ESCAPES ON PURPOSE. A hand-typed literal range around the marks block is easy to
 * fatten until it swallows U+0620-U+064A — which is the Arabic LETTER range, not the marks range.
 * A fattened range does not fail loudly: it silently normalises every Arabic word to the empty
 * string again, which is the exact bug this function exists to fix.
 */
const ARABIC_HARAKAT = /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED]/g;

/** Tatweel (kashida, U+0640) — the visual stretching character, an obfuscation with no meaning. */
const ARABIC_TATWEEL = /\u0640/g;

/**
 * Arabic orthographic variants of the same letter, folded to one form.
 *
 * WHY THIS EXISTS. Alef, yeh and teh-marbuta are each written several ways and the choice varies
 * by writer, by keyboard and by how fast someone typed: alef as U+0627 / U+0622 (madda) / U+0623
 * (hamza above) / U+0625 (hamza below), yeh as U+064A / U+0649 (alef maqsura), teh marbuta as
 * U+0629 / U+0647. They are the same letter, not different ones — but as raw code points they are
 * different strings, so without this a writer who typed a different variant silently evaded a term
 * match, and the term list would need one entry per spelling.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO. It does not fold hamza carriers (U+0621 U+0624 U+0626) into
 * bare alef, and it does not fold qaf (U+0642) to feh or alef maqsura to yeh in the position where
 * the qaf/ya distinction is phonemic. Those are genuinely different words, and folding them would
 * put false positives on legitimate content — which for a rule with `autoEscalate: true` is worse
 * than a miss.
 */
const ARABIC_LETTER_FOLD = /[\u0622\u0623\u0625\u0671]/g;

/**
 * WHY THIS EXISTS AT ALL, AND WHY IT IS NOT `[a-z0-9]`.
 *
 * The rule set has to be able to SEE the text it is judging. The previous class `[^a-z0-9\s]`
 * replaced every character outside it with a space, and every Arabic letter is outside it — so for
 * an Arabic corpus it replaced the entire string, and `"قصة"` normalised to `""`. The failure was
 * not uniform across the four rules that consume this value:
 *
 *  - `comment-minimum-length` measured `0 < 2` and auto-reported EVERY Arabic comment as
 *    `auto:comment_too_short`. That is a false positive per comment, not a missed detection.
 *  - `prohibited_terms` searched `""` and so never matched anything written in Arabic.
 *
 * `link_spam` and `character_repetition` were always fine: they read `rawText`, not this.
 *
 * `\p{L}` / `\p{N}` is what replaces `[a-z0-9]`: every Unicode letter and every Unicode digit, so
 * Latin, Arabic, Cyrillic, Greek and Arabic-Indic digits (٠-٩) all survive. NFKC folds the
 * compatibility forms that Arabic keyboards and copy-paste actually produce (full-width and
 * presentation forms) onto their canonical letters; it does not remove harakat or tatweel, which
 * is why those two are stripped explicitly above.
 *
 * CONSEQUENCE, STATED RATHER THAN HIDDEN: a comment made only of punctuation or emoji is still `""`
 * and still trips `comment-minimum-length`. That is the rule working as designed — and now it
 * distinguishes `"!!!"` from a real Arabic sentence, because only the former is empty.
 */
function normalizeForTermSearch(text: string): string {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .replace(ARABIC_HARAKAT, '')
    .replace(ARABIC_TATWEEL, '')
    .replace(ARABIC_LETTER_FOLD, '\u0627')
    .replace(/\u0649/g, '\u064A')
    .replace(/\u0629/g, '\u0647')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
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
