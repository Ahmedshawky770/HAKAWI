/**
 * A zero-dependency, string-based HTML sanitizer (Principle #15 — input validation at the boundary,
 * defence in depth).
 *
 * WHY THIS EXISTS AND WHY IT SITS ON THE WRITE PATH RATHER THAN ON THE READ PATH. Story `content` is the
 * one field on this API that is stored as HTML and then rendered in somebody else's browser, so the
 * write is the last place a `<script>` can be refused. Sanitizing only on the way out would leave the
 * payload in the database, where every future consumer — the search indexer, the Sanity sync in
 * `stories/sanity/sanity.service.ts`, a mobile client — would each have to remember the same rule and
 * each could forget it differently. `StoriesService` calls this once, on create and on update, so what
 * is stored is already clean and nothing downstream has a decision to make.
 *
 * WHY A STRING SCANNER AND NOT A DOM. There is no parser available here — the registry is unreachable
 * and `jsdom`/`sanitize-html` are not installed — and a tree builder would still have to be told what
 * to drop. A character-level scan over the RAW spelling of the input is enough, and it has a property
 * a tree builder does not: `<` is a tag delimiter only in the raw spelling, so classification runs with
 * every entity still encoded, and each reference is decoded exactly ONCE at the point it is consumed —
 * text nodes when they are emitted, attribute values when their scheme is checked. That is the same
 * number of decodes a browser performs, which is what keeps prose an author deliberately escaped
 * (`the &lt;script&gt; tag`) prose instead of an element. See `decodeTextEntities` and
 * `decodeUrlEntities`.
 *
 * THE SHAPE IS AN ALLOWLIST. Everything not named in `ALLOWED_TAGS` is removed, so the question "what
 * happens to a tag nobody has considered yet?" has one safe answer instead of no answer. A blocklist
 * would have to enumerate `<script>`, `<SCRIPT>`, `<scr\0ipt>`, `<svg/onload=>` and every spelling the
 * next browser adds; the allowlist enumerates what an author can actually write.
 */

/**
 * The elements an author may use, and nothing else.
 *
 * Deliberately narrow: formatting, headings, lists, links, images, rules, code, tables, and
 * figure/figcaption. No `form`, no `input`, no `button`, no `iframe`, no `svg` — none of those is
 * prose, and each is a way to make the reader's browser DO something rather than SHOW something.
 */
const ALLOWED_TAGS: ReadonlySet<string> = new Set([
  'p',
  'br',
  'strong',
  'b',
  'em',
  'i',
  'u',
  's',
  'blockquote',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'ul',
  'ol',
  'li',
  'a',
  'img',
  'hr',
  'pre',
  'code',
  'span',
  'div',
  'table',
  'thead',
  'tbody',
  'tr',
  'th',
  'td',
  'figure',
  'figcaption',
]);

/**
 * Elements whose CONTENT is removed along with the tags: `script` and `style`, and nothing else.
 *
 * WHY THE SET IS EXACTLY THESE TWO, and why it used to be thirty long. `<script>` and `<style>` do not
 * render as text at all — their content is code — so keeping the children while dropping the tags
 * would turn `<script>alert(1)</script>` into the literal text `alert(1)`. Everything else that is not
 * allowlisted drops ONLY its tags and keeps the text between them, which is the rule
 * `frontend/src/lib/sanitize-html.ts` implements and the rule this file now matches: an author who
 * wrapped prose in `<label>`, `<iframe>`, `<form>` or `<title>` wrote prose, and a sanitizer that
 * deletes it is a sanitizer that loses a story body over a styling constraint. `<svg>` and `<math>`
 * used to be dropped with their subtree because their element names are NOT HTML element names; they
 * are simply not allowlisted now, and the `<script>` that can hide inside them is still caught, by
 * name, the moment it is reached.
 *
 * WHY AN UNCLOSED DROPPED ELEMENT STILL COSTS THE REST OF THE INPUT. `<script>alert(1)` with no closing
 * tag executes in every browser — the parser runs to the end of the document and then runs the script —
 * so keeping the remainder would be keeping the payload. This is the one place this sanitizer
 * deliberately trades content loss for a closed failure mode, and the reason the set is two entries
 * long: it costs nothing on input an author typed and everything on input an attacker typed.
 */
const DROPPED_WITH_CONTENT: ReadonlySet<string> = new Set(['script', 'style']);

/**
 * Dropped elements that have NO content, so only the tag itself is removed.
 *
 * Why these are separated out from `DROPPED_WITH_CONTENT`: the subtree scan looks for a matching
 * closing tag and, finding none, consumes the REST OF THE INPUT. `<meta charset>` or `<input>` in the
 * middle of a story body would therefore delete everything after it, which is data loss rather than
 * sanitization. These elements are void in HTML, so "remove the tag" is the whole of the rule.
 */
const DROPPED_VOID_TAGS: ReadonlySet<string> = new Set(['meta', 'link', 'base', 'input', 'param', 'source', 'track', 'area']);

/** Elements with no closing tag, so the balance stack must not wait for one. */
const VOID_TAGS: ReadonlySet<string> = new Set(['br', 'hr', 'img']);

/**
 * The attributes that survive, per element. Every other attribute is dropped, which is why this is a
 * `Map` rather than a global set: `href` on `<a>` is a navigation target, `href` on `<div>` is
 * nothing, and a global set would need a reason to remember that distinction.
 *
 * Note what is NOT here: `class`, `id`, `style`, `data-*`, `target`, `rel`, `srcset`. `class` and `id`
 * are the vector for CSS-based content injection and for colliding with the host application's own
 * selectors; `style` is where `expression()` lives; `srcset` and `data-*` are unbounded. The cost is
 * real — an author loses the ability to style a paragraph — and it is the right trade on a field whose
 * authors are strangers.
 */
const ALLOWED_ATTRIBUTES: ReadonlyMap<string, ReadonlySet<string>> = new Map<string, ReadonlySet<string>>([
  ['a', new Set(['href'])],
  ['img', new Set(['src', 'alt', 'width', 'height'])],
]);

const URL_ATTRIBUTES: ReadonlySet<string> = new Set(['href', 'src']);

/**
 * The URL policy, spelled out because the READ path and the WRITE path are deliberately not identical.
 *
 * An `<a>` may point at `http`, `https` or `mailto` — an absolute target with a scheme this deployment
 * recognises. An `<img>` may point at those AND at a path relative to this deployment's own origin:
 * a story cover rendered by the frontend may sit behind either spelling, and legacy rows in the
 * database carry `http` image URLs that a stricter write path would have to delete rather than keep.
 *
 * What is refused in both cases is a PROTOCOL-RELATIVE URL (`//evil.com`, and the `\\` spelling of the
 * same trick). It is not a relative URL — it inherits the ambient scheme from whatever origin the
 * document happens to be served from — and this function has no page context to inherit from, so it
 * cannot tell `//evil.com` apart from an attack.
 */
const ALLOWED_URL_SCHEMES: ReadonlySet<string> = new Set(['http', 'https', 'mailto']);

/**
 * A scheme per RFC 3986: a letter, then letters/digits/`+`/`-`/`.`, then a colon.
 *
 * Anchored at the start because the check extracts the scheme from the FRONT of the value. A value
 * with no scheme produces no match, which is the relative-URL case handled separately.
 */
const SCHEME_PATTERN = /^([a-zA-Z][a-zA-Z0-9+.-]*):/;

/**
 * C0 controls, DEL and C1 controls — everything a browser strips while resolving a URL.
 *
 * A code-point FILTER and not a regular expression: the range it describes is invisible in a source
 * file, so a pattern written for it is unreadable in review and cannot be re-checked by anyone reading
 * the diff. Comparing code points states the same rule in a form a reviewer can verify, and it removes
 * the literals from the source entirely.
 */
function isIgnoredUrlCodePoint(codePoint: number): boolean {
  return codePoint <= 0x20 || (codePoint >= 0x7f && codePoint <= 0x9f);
}

/** Drops every character a browser ignores while resolving a URL. */
function stripIgnoredUrlChars(value: string): string {
  let stripped = '';
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (!isIgnoredUrlCodePoint(codePoint)) {
      stripped += character;
    }
  }
  return stripped;
}

/** An attribute name's shape. `on*` is refused by the per-element allowlist; this only bounds the name. */
const ATTRIBUTE_NAME_PATTERN = /^[a-zA-Z_:][a-zA-Z0-9:._-]*$/;

/** `width`/`height`: an optional CSS length. Anything else is dropped rather than guessed at. */
const DIMENSION_PATTERN = /^[0-9]{1,5}(px|em|%)?$/;

/**
 * A tag name at the head of `<`, `</` or `<tag `.
 *
 * STICKY (`/y`) rather than anchored (`/^` with `source.slice`). The two are equivalent as matchers —
 * both only match at one position — but the sticky form takes the position as `lastIndex` and reads the
 * string in place, where the anchored form needs a COPY of everything from that position to the end of
 * the document. On a million-character story that copy is a million characters per tag, and a
 * thousand tags is a gigabyte of copying, which is the quadratic shape this file now avoids everywhere
 * else. See `readTag`.
 */
const TAG_NAME_PATTERN = /[a-zA-Z][a-zA-Z0-9:._-]*/y;

/**
 * One attribute as it appears between a tag's name and its `>`.
 *
 * `value` is the RAW spelling, exactly as the author typed it: no reference in it has been resolved,
 * so a check that needs the resolved form asks for it (`decodeUrlEntities` for a URL,
 * `decodeTextEntities` for `alt` text).
 */
interface ParsedAttribute {
  readonly name: string;
  readonly value: string;
}

/** One tag as it appears in the source, with its end offset. */
interface ParsedTag {
  readonly name: string;
  readonly closing: boolean;
  readonly attributes: readonly ParsedAttribute[];
  /** The index of the `>` that closes this tag. */
  readonly end: number;
}

/**
 * The named references a browser resolves while reading an ATTRIBUTE.
 *
 * This list is short on purpose and it is not the HTML5 entity table. It holds the entities whose
 * decoded form attacks actually use — `&colon;` to smuggle the `:` of `javascript:`, `&Tab;` and
 * `&NewLine;` to split `java<TAB>script:` into something a naive matcher misses — plus the four that
 * escape into this sanitizer's own output. Numeric references (`&#106;`, `&#x6A;`) are handled
 * separately and need no table at all.
 *
 * The lookup is case-insensitive on purpose. `&COLON;` is not a valid HTML5 reference and a browser
 * leaves it as literal text, so decoding it over-decodes; that direction is safe here (it refuses a URL
 * that would have rendered as text) and the other direction is not.
 */
const NAMED_ENTITIES: Readonly<Record<string, string>> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  colon: ':',
  semi: ';',
  tab: '\t',
  newline: '\n',
  cr: '\r',
  sol: '/',
  bsol: '\\',
  period: '.',
  comma: ',',
  excl: '!',
  quest: '?',
  num: '#',
  percnt: '%',
  dollar: '$',
  ast: '*',
  plus: '+',
  hyphen: '-',
  lowbar: '_',
  equals: '=',
  commat: '@',
  grave: '`',
  tilde: '~',
  lpar: '(',
  rpar: ')',
  lsqb: '[',
  rsqb: ']',
  lcub: '{',
  rcub: '}',
  verbar: '|',
  circ: '^',
  copy: '©',
  reg: '®',
  trade: '™',
  hellip: '…',
  mdash: '—',
  ndash: '–',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
  bull: '•',
  dagger: '†',
  deg: '°',
  middot: '·',
  laquo: '«',
  raquo: '»',
  times: '×',
  divide: '÷',
  euro: '€',
  pound: '£',
  yen: '¥',
  cent: '¢',
  sect: '§',
  para: '¶',
  frac12: '½',
  sup2: '²',
  sup3: '³',
};

/**
 * A reference: decimal, hex, or a name. The trailing semicolon is optional for all three.
 *
 * WHY THE SEMICOLON IS OPTIONAL HERE. The HTML5 tokenizer treats `&#106` without one as a parse error
 * and STILL substitutes the codepoint, and `<IMG SRC=&#106avascript:alert(1)>` is on the OWASP filter
 * evasion list precisely because of it. Requiring the semicolon would leave that vector readable by a
 * browser and unreadable by this sanitizer.
 *
 * It is NOT optional when a NAMED reference is resolved inside an attribute value — see
 * `decodeUrlEntities`, which is a different rule for a different reason.
 */
const ENTITY_PATTERN = /&(#[0-9]+|#[xX][0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);?/g;

/**
 * Resolves every entity reference in `value` exactly once.
 *
 * WHY `String.fromCodePoint` AND NOT `fromCharCode`: the numeric range runs to `0x10FFFF`, and
 * `fromCharCode` silently produces the wrong character above the BMP.
 *
 * WHY AN UNREPRESENTABLE CODEPOINT BECOMES U+FFFD rather than being dropped: dropping would shift
 * every character after it, and a check that is out of step with the browser by even one position is a
 * check that can be walked around.
 */
function decodeNumericReference(reference: string): string {
  const isHex = reference[1] === 'x' || reference[1] === 'X';
  const digits = isHex ? reference.slice(2) : reference.slice(1);
  const codePoint = isHex ? Number.parseInt(digits, 16) : Number.parseInt(digits, 10);
  if (!Number.isFinite(codePoint) || codePoint < 0 || codePoint > 0x10ffff) {
    return '�';
  }
  return String.fromCodePoint(codePoint);
}

/**
 * Resolves references in TEXT, where the semicolon is optional for all three spellings.
 *
 * WHY THIS RUNS AT THE MOMENT TEXT IS EMITTED AND NOT BEFORE THE SCAN. Classification has to happen on
 * the raw spelling, because `&lt;script&gt;` is an escaped `<` in text and only a real `<` opens a
 * tag. Decoding the whole document first made the two indistinguishable:
 * `sanitizeHtml('the &lt;script&gt; tag')` returned `"the "`, silently deleting prose an author had
 * deliberately escaped — and it deleted the rest of the document with it whenever the decoded form
 * happened to be an element whose content is dropped. Decoding once, at the point of emission, is also
 * the number of decodes a browser performs on a text node, so what the reader sees is what the author
 * wrote.
 */
function decodeTextEntities(value: string): string {
  return value.replace(ENTITY_PATTERN, (match: string, reference: string) => {
    if (reference.startsWith('#')) {
      return decodeNumericReference(reference);
    }
    const decoded = NAMED_ENTITIES[reference.toLowerCase()];
    return decoded ?? match;
  });
}

/**
 * Resolves references in an ATTRIBUTE value, where a NAMED reference requires its semicolon.
 *
 * WHY THE ASYMMETRY WITH `decodeTextEntities`. A query string is full of `&name=value` pairs, and a
 * URL attribute with the semicolon optional turns `?a=1&sect=2` into `?a=1§=2` — the one attachment
 * an author cares about on a story link is corrupted by the sanitizer, not by the author. A browser
 * makes exactly this distinction: in an attribute value a named reference without its semicolon that
 * is followed by `=` or an alphanumeric is left as literal text, and this function is that rule
 * without the follow-on condition, which is the stricter and therefore safer spelling of it.
 *
 * WHY NUMERIC REFERENCES STILL DECODE WITHOUT A SEMICOLON. `&#106avascript:` and `&#x6A;avascript:`
 * are the OWASP spellings of `javascript:` and browsers resolve both. A rule that left them alone
 * would blind this sanitizer to a vector a browser executes.
 */
function decodeUrlEntities(value: string): string {
  return value.replace(ENTITY_PATTERN, (match: string, reference: string) => {
    if (reference.startsWith('#')) {
      return decodeNumericReference(reference);
    }
    if (!match.endsWith(';')) {
      return match;
    }
    const decoded = NAMED_ENTITIES[reference.toLowerCase()];
    return decoded ?? match;
  });
}

/** Escapes the characters that are regex metacharacters, so a tag name can be embedded in a pattern. */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Normalizes a URL down to the characters that decide its scheme.
 *
 * The strip is the whole point: the HTML tokenizer removes a leading TAB, LF, CR or FF from an
 * attribute value, and browsers strip NUL and control characters anywhere in a URL before resolving
 * it. `jav&#9;ascript:` is `javascript:` by the time it executes, so a check that does not strip them
 * is checking a string the browser will never read.
 */
function normalizeUrl(value: string): { scheme: string | null; cleaned: string } {
  const cleaned = stripIgnoredUrlChars(value);
  const match = SCHEME_PATTERN.exec(cleaned);
  if (!match) {
    return { scheme: null, cleaned };
  }
  return { scheme: match[1].toLowerCase(), cleaned };
}

/**
 * The one decision an `a`/`img` URL gets: kept, or dropped.
 *
 * WHY THIS DECODES TWICE. The value arrives raw, and a browser resolves one round of references in an
 * attribute. The second round is deliberately STRICTER than a browser: `href="javascript&amp;#58;x"`
 * resolves to `javascript&#58;x` for a browser, which is a relative URL and therefore inert, and this
 * function refuses it anyway. That is the intended direction — the failure mode of over-decoding is a
 * dropped link, and the failure mode of under-decoding is an executed script.
 *
 * A protocol-relative URL (`//evil.com`) is refused rather than resolved. It is not a relative URL —
 * it inherits the ambient scheme — and this function has no page context to inherit from.
 */
function isUrlAllowed(rawValue: string, elementName: string): boolean {
  const { scheme, cleaned } = normalizeUrl(decodeUrlEntities(decodeUrlEntities(rawValue)));

  if (cleaned.startsWith('//') || cleaned.startsWith('\\')) {
    return false;
  }

  if (scheme === null) {
    // An `<a>` is restricted to absolute http/https/mailto; an `<img>` may also point at a path
    // relative to this deployment's own origin, and at an `http` origin for legacy rows.
    return elementName === 'img';
  }

  return ALLOWED_URL_SCHEMES.has(scheme);
}

/** Escapes text so it can be emitted between tags. Without this, a `<` that opened nothing starts one. */
function escapeText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Escapes a value that will sit inside a double-quoted attribute. */
function escapeAttributeValue(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Emits one run of text, decoded once and escaped, exactly as a browser resolves a text node. */
function renderText(source: string, from: number, to: number): string {
  if (from >= to) {
    return '';
  }
  return escapeText(decodeTextEntities(source.slice(from, to)));
}

/**
 * The forward-only caches that keep a malformed document from costing O(n²).
 *
 * They exist because of how a stray `<` is handled: it is emitted as `&lt;` and the scan RESTARTS one
 * character later, so the same text is reached again from a new tag start. Without these caches a
 * document of N repeated half-typed tags costs N scans of N characters, and the DTO allows a million
 * characters. Each field is a fact about the string, which never changes during a scan, so each one is
 * computed once and then read in O(1).
 */
interface TagScanCache {
  readonly source: string;
  /**
   * The index at or after which the input contains NO `>` at all, quoted or not, or `-1` while that is
   * unknown.
   *
   * Set from a scan that walked the whole tail and found no `>` it could close on. No tag that starts at
   * or after this index can be complete, so one is refused without a second walk — which is what keeps a
   * document made of repeated half-typed tags from being re-walked once per `<`.
   */
  gtFloor: number;
  /**
   * The start of the region where a failed scan is known to have been OUTSIDE a quoted attribute value,
   * or `-1` if no scan has failed yet.
   *
   * This is the whole trick, and it is a property of the state machine rather than of the characters: a
   * scan is memoryless once it is outside a quote, so a scan that starts anywhere the failed scan was
   * outside a quote retraces exactly the same path and hits exactly the same wall. See
   * `wouldTagScanFail`.
   */
  failedScanFrom: number;
  /**
   * Where the failed scan stopped: the end of the input, or the unterminated quote that ended it.
   *
   * The region from `failedScanFrom` to here is the region the failed scan actually walked, outside a
   * quoted value throughout. Beyond it the scan read nothing, so no claim may be made there and a
   * restart must walk for itself.
   */
  failedScanUntil: number;
  /**
   * The last `>` in the whole document, or `null` until something needs it.
   *
   * Read once and then reused: the string does not change during a scan, and a backward search over a
   * million characters costs a million characters.
   */
  documentLastGreaterThan: number | null;
}

/**
 * Whether a tag scan starting at `from` is already known to find no unquoted `>`.
 *
 * WHY THIS IS SOUND. The failed scan walked from somewhere to the wall it hit, and it was outside a
 * quoted value for every position from `failedScanFrom` onward. A scan is memoryless outside a quote —
 * quote state is the only state it keeps — so a scan starting anywhere in that region makes exactly the
 * same decisions, enters exactly the same quoted runs, and arrives at exactly the same wall. It cannot
 * find a `>` the failed scan skipped, because the failed scan skipped it for a reason that still holds.
 *
 * WHY IT MATTERS. Without it, a document of N repeated `<tag ` prefixes followed by an unterminated
 * quoted value is N walks to the same wall: the scan restarts once per `<` and each restart walks to the
 * end again.
 */
function wouldTagScanFail(cache: TagScanCache, from: number): boolean {
  if (cache.failedScanFrom === -1) {
    return false;
  }
  return from >= cache.failedScanFrom && from < cache.failedScanUntil;
}

/**
 * Records that a scan found no unquoted `>` and where it stopped.
 *
 * `outsideRunFrom` is the position from which the scan was outside a quoted value for the rest of its
 * walk. `stoppedAt` is the end of the input, or the unterminated quote that ended it; `walkStart` is
 * where the walk began, which is what decides whether the whole tail was read.
 *
 * WHY ONE WINDOW RATHER THAN EVERY FAILURE. Restarts arrive in increasing order, so the useful window is
 * the one that still covers the next restart. A new window replaces the old one when it starts earlier
 * (more of the near future is covered) or when the old one has already been walked past.
 */
function rememberFailedScan(cache: TagScanCache, walkStart: number, outsideRunFrom: number, stoppedAt: number): void {
  if (stoppedAt >= cache.source.length) {
    if (cache.documentLastGreaterThan === null) {
      cache.documentLastGreaterThan = cache.source.lastIndexOf('>');
    }
    // The walk read every character from `walkStart` onward, so the document's own last `>` is also the
    // last one this walk could have closed on: no tag starting at or after it can be complete. When that
    // `>` is before the walk even started, `walkStart` is the bound instead.
    const documentLast = cache.documentLastGreaterThan;
    const floor = documentLast < walkStart ? walkStart : documentLast + 1;
    cache.gtFloor = cache.gtFloor === -1 ? floor : Math.min(cache.gtFloor, floor);
  }

  if (cache.failedScanFrom === -1 || outsideRunFrom < cache.failedScanFrom || walkStart >= cache.failedScanUntil) {
    cache.failedScanFrom = outsideRunFrom;
    cache.failedScanUntil = stoppedAt;
  }
}

/**
 * Finds the `>` that closes a tag whose name ended at `from`, or `-1` if there is none.
 *
 * WHY THIS SCANS CHARACTER BY CHARACTER INSTEAD OF MATCHING ONE REGEX. Attribute values may contain
 * `>`: `<img alt="a > b" src="x">` is one tag, and a pattern that stops at the first `>` cuts it in
 * half, reading `alt="a >` as the attribute and leaving `b" src="x">` to be re-parsed as a tag. The
 * quote state below is the only thing that gets that right, and it is the same state the HTML tokenizer
 * keeps.
 *
 * WHY QUOTED RUNS ARE SKIPPED WITH `indexOf` AND NOT EXAMINED ONE CHARACTER AT A TIME: a quoted value
 * can be long, and nothing between its quotes can close this tag. Skipping the run whole keeps the cost
 * of one tag proportional to the number of quote characters in it rather than to its length — and it
 * keeps the walk from searching backwards, which is what a per-run `lastIndexOf('>')` would do, at a
 * cost proportional to the whole document.
 */
function findTagEnd(cache: TagScanCache, from: number): number {
  const source = cache.source;
  let position = from;
  // Every position from here until the next quote is one the scan reaches OUTSIDE a quoted value, so
  // a scan starting at any of them takes exactly the path this one takes.
  let outsideRunFrom = from;

  while (position < source.length) {
    const character = source[position];
    if (character === '"' || character === "'") {
      const closingQuote = source.indexOf(character, position + 1);
      if (closingQuote === -1) {
        // An unterminated quoted value swallows the rest of the document, so no unquoted `>` can
        // follow it. The walk is over at the quote that opened it, and the quote is the boundary of
        // what it examined: everything after it is text it never read.
        rememberFailedScan(cache, from, outsideRunFrom, position);
        return -1;
      }
      position = closingQuote + 1;
      outsideRunFrom = position;
      continue;
    }
    if (character === '>') {
      return position;
    }
    position += 1;
  }

  // Every character from `from` onward has now been accounted for, quoted runs included.
  rememberFailedScan(cache, from, outsideRunFrom, source.length);
  return -1;
}

/**
 * Reads one tag starting at `start`, where `source[start]` is known to be `<`.
 *
 * Returns `null` when the `<` does not open a COMPLETE tag — a stray `<` in prose, a `<` that opens a
 * name the input never finishes, or a tag that reaches the end of the document without its `>`. The
 * caller emits it as visible text and restarts at `start + 1`, which is the property that keeps a
 * half-typed `<` from deleting the rest of a story: `she whispered x<y and the night went on` keeps
 * every word, where dropping the remainder kept one.
 */
function readTag(cache: TagScanCache, start: number): ParsedTag | null {
  const source = cache.source;
  let index = start + 1;
  let closing = false;

  if (source[index] === '/') {
    closing = true;
    index += 1;
  }

  // Nothing after this point can close a tag, so no tag starts here at all.
  if (cache.gtFloor !== -1 && start >= cache.gtFloor) {
    return null;
  }

  TAG_NAME_PATTERN.lastIndex = index;
  const nameMatch = TAG_NAME_PATTERN.exec(source);
  if (nameMatch === null) {
    return null;
  }

  const name = nameMatch[0].toLowerCase();
  index += nameMatch[0].length;

  if (wouldTagScanFail(cache, index)) {
    return null;
  }

  const end = findTagEnd(cache, index);
  if (end === -1) {
    return null;
  }

  let inner = source.slice(start + 1 + (closing ? 1 : 0) + name.length, end);
  // A trailing `/` is the author's self-closing marker and is not part of any attribute. It is removed
  // HERE rather than ignored by the attribute reader because a bare value runs to the next whitespace:
  // `<a href=x/>` would otherwise store `x/` as the URL, which is not the URL the author typed.
  //
  // The marker itself is then DISCARDED, which is what the HTML5 tokenizer does with it: a self-closing
  // start tag on an element that is not void, and not in a foreign namespace, is a parse error and the
  // `/` is ignored — the element opens. `<p/>` therefore opens a `<p>` that has to be closed, and an
  // output that dropped it would be unbalanced HTML an author never wrote.
  if (inner.endsWith('/')) {
    inner = inner.slice(0, -1);
  }

  return { name, closing, attributes: parseAttributes(inner), end };
}

/**
 * Splits the inside of a tag into attributes.
 *
 * Each is a name, an optional `=`, and a value that is double-quoted, single-quoted or bare. A bare
 * value runs to the next whitespace, which is the whole trick behind `<IMG SRC=javascript:alert(1)>`.
 *
 * A value-less attribute (`<a href>`) becomes `''`. The alternative — treating `''` as "not provided" —
 * would let `<a href>` through as if the attribute were absent, and it is not.
 */
function parseAttributes(inner: string): ParsedAttribute[] {
  const attributes: ParsedAttribute[] = [];
  const pattern = /([a-zA-Z_:][a-zA-Z0-9:._-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'`=<>]*)))?/g;

  let match = pattern.exec(inner);
  while (match !== null) {
    attributes.push({ name: match[1].toLowerCase(), value: match[2] ?? match[3] ?? match[4] ?? '' });
    match = pattern.exec(inner);
  }

  return attributes;
}

/** What survived of one element's attributes. */
interface RenderedAttributes {
  /** The rendered attribute string, either empty or already prefixed with a space. */
  readonly text: string;
  /**
   * `img` only: the element carries no usable `src`, either because the one supplied was refused or
   * because none was supplied at all.
   */
  readonly srcUnusable: boolean;
}

/**
 * Renders the attributes that survive for one element.
 *
 * WHY A URL IS RENDERED FROM ITS DECODED SPELLING. The value between the author's quotes is what the
 * author typed; the value a browser navigates to is that string with its references resolved. Writing
 * the decoded spelling back out, escaped, means the browser resolves our output to the same target it
 * would have resolved the author's input to. Writing the raw spelling back out would double-encode
 * every `&amp;` in a query string.
 */
function renderAttributes(elementName: string, attributes: readonly ParsedAttribute[]): RenderedAttributes {
  const allowed = ALLOWED_ATTRIBUTES.get(elementName);
  if (allowed === undefined) {
    // An element with no attribute allowlist keeps none of them, and has no `src` to be usable.
    return { text: '', srcUnusable: elementName === 'img' };
  }

  const rendered: string[] = [];
  let srcPresent = false;
  let srcAllowed = false;

  for (const attribute of attributes) {
    if (!allowed.has(attribute.name) || !ATTRIBUTE_NAME_PATTERN.test(attribute.name)) {
      continue;
    }

    // `on*` cannot be reached through the allowlist. It is asserted rather than assumed: the day an
    // element's allowlist is built from a variable instead of a literal, this is the line that holds.
    if (attribute.name.startsWith('on')) {
      continue;
    }

    if (URL_ATTRIBUTES.has(attribute.name)) {
      const value = attribute.value.trim();
      if (attribute.name === 'src') {
        srcPresent = true;
      }
      if (value.length === 0 || !isUrlAllowed(value, elementName)) {
        continue;
      }
      if (attribute.name === 'src') {
        srcAllowed = true;
      }
      rendered.push(`${attribute.name}="${escapeAttributeValue(decodeUrlEntities(value))}"`);
      continue;
    }

    if (attribute.name === 'width' || attribute.name === 'height') {
      const value = attribute.value.trim();
      if (!DIMENSION_PATTERN.test(value)) {
        continue;
      }
      rendered.push(`${attribute.name}="${escapeAttributeValue(value)}"`);
      continue;
    }

    if (attribute.name === 'alt') {
      rendered.push(`alt="${escapeAttributeValue(decodeTextEntities(attribute.value))}"`);
    }
  }

  return {
    text: rendered.length === 0 ? '' : ` ${rendered.join(' ')}`,
    srcUnusable: elementName === 'img' && !(srcPresent && srcAllowed),
  };
}

/**
 * Renders an open tag, or `null` when the element itself should not be emitted.
 *
 * An `<a>` whose `href` was refused is emitted WITHOUT the `href`: that is a removed navigation, not a
 * removed element, and the text it wraps is still the author's.
 *
 * An `<img>` with no usable `src` is dropped rather than emitted as a bare `<img>`: an `img` with no
 * `src` is a broken-image placeholder, which reads as a bug in this application rather than as a URL
 * that was removed, and its `alt` text is then the only thing a sighted reader sees.
 */
function renderOpenTag(elementName: string, attributes: readonly ParsedAttribute[]): string | null {
  const rendered = renderAttributes(elementName, attributes);
  if (rendered.srcUnusable) {
    return null;
  }
  return `<${elementName}${rendered.text}>`;
}

/** How many elements of each name are currently open, so "is this name open?" is O(1). */
interface OpenElementStack {
  /** The elements currently open, innermost last. Closed in reverse on the way out. */
  readonly names: string[];
  readonly counts: Map<string, number>;
}

/** Opens one element. */
function openElement(stack: OpenElementStack, name: string): void {
  stack.names.push(name);
  stack.counts.set(name, (stack.counts.get(name) ?? 0) + 1);
}

/**
 * Closes the innermost element with this name, and everything opened inside it.
 *
 * WHY THIS IS NOT `lastIndexOf`. `Array.lastIndexOf` walks the whole stack when the name is absent,
 * which is the common case for a document that ends with N stray `</b>` closers against N open `<p>`s:
 * each one costs a walk of a stack that only grows. A 490KB story of that shape took 97.5 seconds on
 * this function alone, in the request path, against a DTO that allows a million characters. The count
 * answers "is this name open at all?" in O(1), and the stack is walked only when the answer is yes —
 * and then only as far as the element being closed, which is work the output has to do anyway.
 *
 * Returns the closing tags to emit, innermost first, or `null` when the name is not open.
 */
function closeElement(stack: OpenElementStack, name: string): string[] | null {
  if (!(stack.counts.get(name) ?? 0)) {
    return null;
  }

  const closings: string[] = [];
  for (let depth = stack.names.length - 1; depth >= 0; depth -= 1) {
    const candidate = stack.names[depth];
    const remaining = (stack.counts.get(candidate) ?? 0) - 1;
    stack.counts.set(candidate, remaining);
    closings.push(`</${candidate}>`);
    if (candidate === name) {
      stack.names.length = depth;
      return closings;
    }
  }

  return null;
}

/**
 * Skips a dropped element and its content, starting after its open tag.
 *
 * Why this counts nesting instead of stopping at the first closing tag: `<svg><script>…</script></svg>`
 * has a `</script>` inside it, and stopping there would leave `</svg>` in the output to be closed
 * against nothing.
 *
 * WHY THE CLOSING TAG IS MATCHED THE HTML5 WAY. `</style foo="bar">` and `</style/>` are both end tags:
 * the tokenizer accepts a tag name followed by whitespace, `/`, `>` or the end of the input, and it
 * does not care what follows. A pattern that required `</style\s*>` did not match them, so a stray
 * close tag with an attribute left the scan looking for a close that was already there and consumed
 * the rest of the story instead.
 *
 * The match is therefore a LOOKAHEAD, which means it stops at the name and not at the `>`: the rest of
 * the tag is consumed with `findTagEnd`, so an attribute on a close tag is skipped with it rather than
 * leaking into the output as visible text.
 */
function skipDroppedElement(cache: TagScanCache, from: number, elementName: string): number {
  const source = cache.source;
  const openPattern = new RegExp(`<${escapeRegExp(elementName)}(?=[\\s/>])|<${escapeRegExp(elementName)}$`, 'gi');
  const closePattern = new RegExp(`</${escapeRegExp(elementName)}(?=[\\s/>])|</${escapeRegExp(elementName)}$`, 'gi');

  let depth = 1;
  let cursor = from;

  while (cursor < source.length) {
    openPattern.lastIndex = cursor;
    closePattern.lastIndex = cursor;

    const nextOpen = openPattern.exec(source);
    const nextClose = closePattern.exec(source);

    if (nextClose === null) {
      return source.length;
    }

    if (nextOpen !== null && nextOpen.index < nextClose.index) {
      depth += 1;
      cursor = nextOpen.index + 1;
      continue;
    }

    depth -= 1;
    if (depth === 0) {
      const closeEnd = findTagEnd(cache, nextClose.index + 2 + elementName.length);
      return closeEnd === -1 ? source.length : closeEnd + 1;
    }
    cursor = nextClose.index + 2 + elementName.length;
  }

  return source.length;
}

/**
 * Sanitizes an untrusted HTML fragment.
 *
 * THE PIPELINE, and why it is in this order:
 *
 * 1. **Classify on the raw spelling.** `<` opens a tag, and nothing else does. Every entity is still
 *    encoded at this point, so prose an author escaped (`the &lt;script&gt; tag`) is text and not an
 *    element, and a real `<script>` is a script.
 * 2. **Scan left to right with one forward-only cursor.** Allowed tags are emitted; `script` and
 *    `style` take their subtree with them; a tag that is not allowlisted loses only its tags and keeps
 *    its children; a `<` that opens no complete tag is emitted as `&lt;` and the scan restarts one
 *    character later, so no malformed byte can take the rest of the story with it; everything else is
 *    emitted as text, decoded once, so the reader sees what the author wrote.
 * 3. **Balance at the end.** Whatever is still open is closed in reverse order, so an unclosed `<b>`
 *    cannot swallow the rest of the page; and a stray `</b>` is dropped rather than closing an element
 *    this sanitizer never opened.
 *
 * WHAT IT COSTS: one pass, one stack, one count map, and — only on input that has already proved it is
 * malformed — one quote-parity prefix. No DOM, no per-node allocation, no dependency, and no
 * quadratic path: the cost of a story is proportional to its length, which is what makes it safe to
 * call on every write rather than on a sampled subset of them.
 *
 * @param input Untrusted HTML, exactly as it arrived on a write path.
 * @returns An HTML fragment of allowlisted elements, allowlisted attributes and escaped text. Safe to
 *          store and to render with no further processing.
 */
export function sanitizeHtml(input: string): string {
  const source = input;
  const output: string[] = [];

  /** The elements currently open, innermost last, with an O(1) per-name count beside them. */
  const openElements: OpenElementStack = { names: [], counts: new Map<string, number>() };

  const cache: TagScanCache = {
    source,
    gtFloor: -1,
    failedScanFrom: -1,
    failedScanUntil: -1,
    documentLastGreaterThan: null,
  };

  let cursor = 0;

  while (cursor < source.length) {
    const tagStart = source.indexOf('<', cursor);

    if (tagStart === -1) {
      output.push(renderText(source, cursor, source.length));
      break;
    }

    if (tagStart > cursor) {
      output.push(renderText(source, cursor, tagStart));
    }

    // Comments, CDATA sections, PIs and doctypes are removed wholesale. `<!--[if gte IE 4]><script>` is
    // a conditional comment that older IE executes; a doctype can switch a browser into quirks mode;
    // and no story body has a reason to carry any of them.
    if (source.startsWith('<!--', tagStart)) {
      const commentEnd = source.indexOf('-->', tagStart + 4);
      cursor = commentEnd === -1 ? source.length : commentEnd + 3;
      continue;
    }

    if (source.startsWith('<![CDATA[', tagStart)) {
      const cdataEnd = source.indexOf(']]>', tagStart + 9);
      cursor = cdataEnd === -1 ? source.length : cdataEnd + 3;
      continue;
    }

    if (source[tagStart + 1] === '!' || source[tagStart + 1] === '?') {
      const declarationEnd = source.indexOf('>', tagStart);
      cursor = declarationEnd === -1 ? source.length : declarationEnd + 1;
      continue;
    }

    const tag = readTag(cache, tagStart);
    if (tag === null) {
      // A `<` that opened no complete tag is text, not markup. Emitting it escaped and restarting at
      // the next character is what keeps `x<y and the night went on` whole: the alternative — dropping
      // everything from the `<` onward — deletes the rest of the story over one stray character.
      output.push('&lt;');
      cursor = tagStart + 1;
      continue;
    }

    cursor = tag.end + 1;

    if (DROPPED_VOID_TAGS.has(tag.name)) {
      continue;
    }

    if (DROPPED_WITH_CONTENT.has(tag.name)) {
      // A `</script>` arriving on its own has no open element to match and would otherwise be
      // re-processed as a stray closing tag.
      if (tag.closing) {
        continue;
      }
      cursor = skipDroppedElement(cache, cursor, tag.name);
      continue;
    }

    if (tag.closing) {
      const closings = closeElement(openElements, tag.name);
      if (closings === null) {
        // Stray closing tag, `<p>text</b></p>`. Dropped, because emitting it would close an element
        // this sanitizer never opened.
        continue;
      }
      for (const closing of closings) {
        output.push(closing);
      }
      continue;
    }

    if (!ALLOWED_TAGS.has(tag.name)) {
      // Not allowlisted: the tags go, the children stay. `<font>` wrapping real prose is a styling
      // constraint rather than a payload, and discarding the text with it would make this sanitizer
      // lossy for content an author wrote in good faith. Its own closing tag is dropped the same way
      // when it arrives, so the document stays balanced.
      continue;
    }

    const openTag = renderOpenTag(tag.name, tag.attributes);
    if (openTag !== null) {
      output.push(openTag);
    }

    // Everything that is not a VOID element waits for a closing tag, including one the author wrote
    // with a trailing `/` — see the note in `readTag`. Only `br`, `hr` and `img` are void in HTML.
    if (openTag !== null && !VOID_TAGS.has(tag.name)) {
      openElement(openElements, tag.name);
    }
  }

  for (let depth = openElements.names.length - 1; depth >= 0; depth -= 1) {
    output.push(`</${openElements.names[depth]}>`);
  }

  return output.join('');
}
