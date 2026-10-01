import { BadRequestException } from '@nestjs/common';

/**
 * WHY this file exists and where the callers are.
 *
 * This is the derivation RULE for a field in the mutation contract, not a wire shape, so it is not
 * in `types.ts` (the module's typing/mapper file). Its only caller is `StoriesService.create`,
 * because the service is what owns the insert and therefore the one party that can decide whether a
 * candidate slug was actually free. The DTO only decides whether a slug the client *sent* is
 * well-formed; it never derives one.
 */

/**
 * WHY 100 and not the 255 the column allows (`stories.schema.ts:51` `varchar('slug', { length: 255 })`).
 *
 * A slug is a public URL segment, so its real cost is not the column — it is that people read it,
 * paste it, and it ends up in logs, referrers and the `GET /stories/slug/:slug` route. 100
 * characters is long enough that no ordinary title is truncated into meaninglessness, and it leaves
 * headroom under the column limit for the `-<suffix>` a collision appends, so a derived slug can
 * never overflow the column no matter how many collisions it walks through.
 *
 * The column limit stays as the DTO's `@MaxLength` for a *client-supplied* slug: a client may
 * still legitimately hand us a long one, and that is its choice to make.
 */
export const MAX_STORY_SLUG_LENGTH = 100;

/**
 * WHY a bounded walk. Two stories with the same title are normal (a re-run, a partial duplicate, a
 * popular phrase), and silently overwriting is never acceptable, so a derived slug has to be made
 * unique. Ten attempts is generous for a human-scale corpus and small enough that a genuinely
 * poisoned title cannot turn one POST into an unbounded sequence of `SELECT`s.
 */
export const MAX_SLUG_COLLISION_ATTEMPTS = 10;

/**
 * Letters that survive `NFKD` decomposition because Unicode has no combining form for them.
 * Every one of these is a real character in a European title that would otherwise be deleted by
 * the `[^a-z0-9]` filter and silently produce a wrong slug ("Straße" -> "strae", not "strasse").
 *
 * Deliberately NOT included: any letter that NFKD *does* decompose (e.g. `é` -> `e` + U+0301,
 * `ñ` -> `n` + U+0303). Those are already handled generically by the mark-stripping step, and
 * listing them here would be a second, drifting copy of that knowledge.
 */
const NON_DECOMPOSING_LETTERS: Readonly<Record<string, string>> = {
  ß: 'ss',
  æ: 'ae',
  œ: 'oe',
  ø: 'o',
  đ: 'd',
  ð: 'd',
  ł: 'l',
  þ: 'th',
  ħ: 'h',
  ŧ: 't',
  ı: 'i',
  ĸ: 'k',
  ƒ: 'f',
};

/**
 * Derives a story's public slug from its title.
 *
 * WHY the server does this at all (Principle #8). Requiring every client to author a slug pushes
 * three jobs onto every caller forever: transliteration of non-Latin scripts, the choice of a
 * readable separator, and collision handling. The server already holds the title, it holds the
 * uniqueness check, and it is the only party that can be consistent about all of it. A client that
 * still sends a slug is still honoured — see `StoriesService.create`.
 *
 * The result is deterministic: the same title always derives the same base slug, so the final value
 * is a pure function of the title plus (only if taken) the first free `-<n>` suffix. There is no
 * randomness and no clock anywhere in here, which is what makes the derived value a single source
 * of truth rather than a second one that can drift (Principle #9).
 *
 * Steps, in order, and why each one is needed:
 *   1. `NFKD` + strip Unicode marks — turns "Café" into "cafe" instead of deleting the `é` and
 *      yielding "caf".
 *   2. lowercase — the DTO's `/^[a-z0-9-]+$/` accepts only lowercase, so folding here means a
 *      derived slug can never fail its own validation.
 *   3. the explicit letter map — for the letters NFKD leaves alone (see above).
 *   4. `[^a-z0-9]+` -> `-` — every run of punctuation, whitespace and untransliterated script
 *      collapses to ONE hyphen. The `+` is what stops "Hello,  World!" from becoming
 *      "hello--world".
 *   5. trim `-` from both ends — no leading or trailing separator, because `GET /stories/slug/:slug`
 *      and the generated links should never have to encode one.
 *   6. truncate, then trim again — step 5's guarantee does not survive a cut, and cutting
 *      "the-quick-brown-fox-jumps" at 100 can land on the hyphen before "jumps".
 *
 * Throws a `BadRequestException` when nothing survives, rather than returning `''`. An empty slug
 * would satisfy the column's `NOT NULL` and every uniqueness lookup would then match every other
 * empty slug at once, so a title that cannot be slugified has to be a 400 with a usable message,
 * not a row.
 */
export function deriveStorySlug(title: string): string {
  const base = title
    .normalize('NFKD')
    .toLowerCase()
    .replace(/\p{M}+/gu, '')
    .replace(/[ßæœøđðłþħŧıĸƒ]/g, (letter) => NON_DECOMPOSING_LETTERS[letter] ?? letter)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  const truncated = base.slice(0, MAX_STORY_SLUG_LENGTH).replace(/-+$/g, '');

  if (truncated.length === 0) {
    throw new BadRequestException(
      `Title "${title}" has no characters that can form a URL slug. ` +
        'A story URL can only be built from Latin letters, digits and hyphens, so this title ' +
        'cannot be published as-is. Send an explicit "slug" to choose the URL yourself.',
    );
  }

  return truncated;
}

/**
 * The ordered slugs a derived base may occupy: `base`, `base-2`, `base-3`, ... `base-<n>`.
 *
 * WHY a short numeric suffix and not, say, a random or timestamped one: the slug has to stay
 * derivable from the title (Principle #9), and `-2` is what a human would have typed. A random
 * suffix would make the URL unguessable-but-unexplainable and would break the "same title, same
 * slug" property that makes the derivation auditable. The walk is bounded by
 * `MAX_SLUG_COLLISION_ATTEMPTS` so a hostile title cannot fan out into an unbounded query loop.
 */
export function storySlugCandidates(base: string, maxAttempts: number = MAX_SLUG_COLLISION_ATTEMPTS): string[] {
  return Array.from({ length: maxAttempts }, (_, index) => (index === 0 ? base : `${base}-${index + 1}`));
}
