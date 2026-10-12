/**
 * A zero-dependency, DOM-free HTML sanitizer for untrusted rich text.
 *
 * WHY THIS EXISTS (Principle #4 — a problem documented so it is not re-opened).
 *
 * `stories/[id]/page.tsx` renders `story.content` — HTML the API owns — through
 * `dangerouslySetInnerHTML`. `story.content` is author-supplied rich text, so it is exactly the
 * kind of input that carries a stored-XSS payload: a story whose body is `<img src=x
 * onerror=alert(1)>` executes for every reader who opens it. Rendering it raw is a release
 * blocker. This module is the allowlist that runs between the API response and
 * `dangerouslySetInnerHTML`.
 *
 * WHY A STRING PARSER AND NOT A DOM ONE. DOMPurify is the reference implementation, but the npm
 * registry is unreachable and the dependency budget is zero, so this parses the string directly.
 * A DOM parser would also be a second, divergent notion of "valid HTML" from the one browsers
 * tokenize with; this tokenizer mirrors the HTML spec where behaviour matters — especially that
 * entities are decoded EXACTLY ONCE, in the places a browser decodes them (text nodes and
 * attribute values) and NEVER on the raw stream. The document is not pre-decoded, because
 * pre-decoding would turn `&lt;script&gt;` into a real `<script>` and re-open the stored-XSS hole
 * this module exists to close. See `decodeEntities` and the TEXT/ATTRIBUTE note below.
 *
 * THE MODEL IS AN ALLOWLIST, NOT A DENYLIST. Only the whitelisted tags and attributes below are
 * emitted; everything else is dropped. A denylist of `<script>`/`onerror=` … is defeated the
 * moment a new tag or handler is shipped; an allowlist fails closed by construction.
 *
 * ⚠️ THIS IS THE RENDER LAYER, AND IT IS THE TWIN OF `backend/src/common/utils/sanitize-html.ts`.
 * The two files implement one contract, written down in `sanitize-html.test.ts` under "TWIN
 * CONTRACT". Where they differ, the difference is deliberate and asserted there: the render layer
 * MAY be more permissive than the write layer, because it has a page origin to resolve a relative
 * URL against that a write path does not have, and because rows written before the write-path
 * guard existed can carry spellings the write path now refuses (an `http:` image). It is never
 * LESS permissive — a render layer that accepted something the write layer refused would be the
 * filter that runs last, and running last is the only position that matters.
 */

/**
 * Tags that may appear in the output. Styling comes from `.hk-prose` descendant selectors in
 * `globals.css`, so no `class`/`style` attribute is ever needed on any of them.
 */
const ALLOWED_TAGS: ReadonlySet<string> = new Set([
  "p",
  "br",
  "strong",
  "b",
  "em",
  "i",
  "u",
  "s",
  "blockquote",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "ul",
  "ol",
  "li",
  "a",
  "img",
  "hr",
  "pre",
  "code",
  "span",
  "div",
  "table",
  "thead",
  "tbody",
  "tr",
  "th",
  "td",
  "figure",
  "figcaption",
]);

/** Void elements: no closing tag, nothing to push onto the stack. */
const VOID_TAGS: ReadonlySet<string> = new Set(["br", "hr", "img"]);

/**
 * Tags whose entire inner content is dropped, not merely un-tagged.
 *
 * ⚠️ RECONCILED WITH THE BACKEND: this set is `script` and `style` ONLY, and it is the whole
 * subtree rule on both sides. Every other non-allowlisted tag loses its TAGS and KEEPS its inner
 * text, because `<iframe>text</iframe>` is prose that a stripped wrapper was wrapped around and
 * discarding the prose with the wrapper loses content an author wrote in good faith. The two
 * exceptions are here because their content is not text at all — it is code and CSS — and
 * leaving the inner text of a `<style>li {list-style-image:url("javascript:…")}</style>` in the
 * output would be both wrong and, in the right context, re-openable.
 */
const CONTENT_DROPPED_TAGS: ReadonlySet<string> = new Set(["script", "style"]);

/** The upper bound for a unitless `img` width/height attribute. Guards against `width=999999999`. */
const MAX_IMG_DIMENSION = 10000;

/**
 * THE SHARED DIMENSION SHAPE — the same regular expression appears verbatim in
 * `backend/src/common/utils/sanitize-html.ts` (Principle #9, one source of truth: the two
 * sanitizers must not grow two spellings of the same rule, and the spelling is short enough that
 * duplicating it is the cheaper of two bad options while the packages stay separate).
 *
 * An optional CSS length: up to five digits, an optional unit. `width="320px"`, `width="50%"` and
 * `width="320"` are all a width an author can set in any HTML editor, so refusing them was a
 * content bug rather than a security one — the frontend used to drop `width="320px"` and the
 * backend refused to store it. The unitless form is additionally bounded by
 * `MAX_IMG_DIMENSION`, because that is the form that has ever been used to blow out a layout.
 */
const DIMENSION_PATTERN = /^[0-9]{1,5}(px|em|%)?$/;

/**
 * Named entities that matter for scheme obfuscation, plus the structural ones and the
 * typographic spellings. Numeric entities (`&#106;`, `&#x6a;`) are decoded separately; this table
 * covers the named spellings an attacker might use to assemble `javascript:` (most importantly
 * `&colon;` for the `:`, `&Tab;` and `&NewLine;` to split the word). An unrecognised named
 * entity is left verbatim, which is what a browser does too — it cannot assemble a scheme.
 *
 * ⚠️ THE TRAILING SEMICOLON IS MANDATORY, and it is the point of the rule rather than an
 * implementation detail. `&reg;` decodes (a browser decodes it too), and `&reg=2` does NOT
 * decode — it is a query parameter that happens to start with an ampersand, and decoding it would
 * corrupt ordinary URLs such as `?a=1&sect=2`. The backend's write path takes the same position
 * with the same table, so a URL survives one write/read round trip unchanged.
 */
const NAMED_ENTITIES: Readonly<Record<string, string>> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: "\u00a0",
  colon: ":",
  semi: ";",
  sol: "/",
  bsol: "\\",
  tab: "\t",
  newline: "\n",
  cr: "\r",
  excl: "!",
  quest: "?",
  num: "#",
  dollar: "$",
  percnt: "%",
  commat: "@",
  period: ".",
  comma: ",",
  hyphen: "-",
  lowbar: "_",
  plus: "+",
  equals: "=",
  ast: "*",
  lpar: "(",
  rpar: ")",
  lsqb: "[",
  rsqb: "]",
  lcub: "{",
  rcub: "}",
  lbrace: "{",
  rbrace: "}",
  verbar: "|",
  circ: "^",
  grave: "`",
  tilde: "~",
  copy: "\u00a9",
  reg: "\u00ae",
  trade: "\u2122",
  hellip: "\u2026",
  mdash: "\u2014",
  ndash: "\u2013",
  lsquo: "\u2018",
  rsquo: "\u2019",
  ldquo: "\u201c",
  rdquo: "\u201d",
  bull: "\u2022",
  dagger: "\u2020",
  deg: "\u00b0",
  middot: "\u00b7",
  laquo: "\u00ab",
  raquo: "\u00bb",
  times: "\u00d7",
  divide: "\u00f7",
  euro: "\u20ac",
  pound: "\u00a3",
  yen: "\u00a5",
  cent: "\u00a2",
  sect: "\u00a7",
  para: "\u00b6",
  frac12: "\u00bd",
  sup2: "\u00b2",
  sup3: "\u00b3",
};

/**
 * Decodes HTML character references exactly the way the HTML tokenizer does: once.
 *
 * This runs on TEXT content and on ATTRIBUTE values — never on the raw stream, whose `<` bytes
 * must stay `bytes so tags are recognised before any `<` a `&lt;` might decode to. Decoding ONCE
 * is deliberate and is the security property: a single-encoded scheme (`&#106;avascript:`) decodes
 * to `javascript:` here is caught, and a double-encoded one (`&amp;#106;`) decodes to the literal
 * `&#106;avascript:` which is NOT a scheme — the same harmless string the browser ends up with, so
 * the two agents agree.
 */
function decodeEntities(value: string): string {
  return value.replace(/&(#[0-9]+|#x[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g, (match, entity: string) => {
    if (entity[0] === "#") {
      const isHex = entity[1] === "x" || entity[1] === "X";
      const codePoint = Number.parseInt(isHex ? entity.slice(2) : entity.slice(1), isHex ? 16 : 10);
      if (!Number.isInteger(codePoint) || codePoint < 0 || codePoint > 0x10ffff) {
        return "";
      }
      try {
        return String.fromCodePoint(codePoint);
      } catch {
        return "";
      }
    }
    return NAMED_ENTITIES[entity] ?? NAMED_ENTITIES[entity.toLowerCase()] ?? match;
  });
}

/** Strips the control and whitespace characters a browser drops while resolving a URL scheme. */
function stripControlChars(value: string): string {
  return value.replace(/[\u0000-\u0020\u007f-\u009f]/g, "");
}

/**
 * Whether a decoded URL value is safe for the given element.
 *
 * DENY-BY-DEFAULT FOR ABSOLUTE URLS. If the value carries a scheme it must be in the allowed set
 * for the element; anything else — `javascript:`, `vbscript:`, `data:`, `file:` — is refused.
 * A value with no scheme is relative (a path, fragment or query) and is allowed. The scheme is
 * read AFTER entity decoding and control-char stripping, so `" &#14;  javascript:…"` and
 * `"java\tscript:…"` are both caught.
 *
 * ⚠️ PROTOCOL-RELATIVE VALUES ARE REFUSED, NOT RESOLVED. `//evil.example/x.png` and
 * `/\evil.example/x.png` are not relative URLs: they INHERIT the ambient scheme, so a link that
 * looked relative navigates the reader off-origin, and an image that looked local is fetched from
 * a host this policy has not allowlisted. The backend refuses them too — this pair was the
 * frontend/backend divergence flagged in review, and the backend's reason (it has no page context
 * to inherit from) applies with equal force here, where the page context IS the story page and
 * inheriting it silently is the attack. A leading `\` is refused for the same reason: browsers
 * treat `\` as `/` while resolving, and `&bsol;` decodes to it.
 *
 * @param schemeAllowlist the schemes permitted for this element: `a` allows http/https/mailto,
 * `img` allows https plus http (see `IMG_SRC_SCHEMES` for the legacy-row reasoning).
 */
function isSafeUrl(value: string, schemeAllowlist: ReadonlySet<string>): boolean {
  const normalized = stripControlChars(value);
  if (
    normalized.startsWith("//") ||
    normalized.startsWith("/\\") ||
    normalized.startsWith("\\")
  ) {
    return false;
  }
  const scheme = /^([a-z][a-z0-9+.\-]*):/.exec(normalized.toLowerCase());
  if (!scheme) return true; // relative — no scheme to abuse
  return schemeAllowlist.has(scheme[1]);
}

/** Schemes an `a href` may carry. */
const HREF_SCHEMES: ReadonlySet<string> = new Set(["http", "https", "mailto"]);

/**
 * Schemes an `img src` may carry, on the RENDER layer.
 *
 * WHY `http` IS ACCEPTED HERE. This layer runs over what the database ALREADY holds, and a row
 * written before the write-path guard existed can legitimately carry an `http:` image URL.
 * Refusing it would turn a mixed-content downgrade — which the browser already blocks on an https
 * page, by itself — into a broken image, which is a content regression the reader cannot tell
 * apart from a bug in this application. The write path in
 * `backend/src/common/utils/sanitize-html.ts` owns what NEW rows may contain, and that set is
 * allowed to be narrower than this one: a stricter write path must not silently start breaking
 * older rows on the way out.
 */
const IMG_SRC_SCHEMES: ReadonlySet<string> = new Set(["https", "http"]);

/** Escapes a text node for output. The decoded value is escaped so it renders as the same text. */
function escapeText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Escapes an attribute value for a double-quoted attribute in the output. */
function escapeAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Serializes ONLY the allowlisted attributes for a tag, or `null` when the tag itself must not be
 * emitted at all.
 *
 * `a` keeps a safe `href`; `img` keeps a safe `src`, plus `alt`, and `width`/`height` when they
 * are in-bounds dimensions. EVERYTHING else — every `on*` handler, `style`, `srcset`, `class`,
 * `target`, `rel` — is omitted by not being read here, so it cannot leave this function.
 *
 * WHY `null` MEANS "DROP THE ELEMENT", AND ONLY FOR `img`. An `<a>` whose `href` was refused is
 * still emitted without it: that is a removed navigation, and the author's words around it stay.
 * An `<img>` with no usable `src` is dropped instead of emitted as a bare `<img>`, because an
 * image with no source is a broken-image placeholder that reads as a bug in this application, and
 * the `alt` text is then the only thing a sighted reader sees. The backend makes the same choice,
 * which is what keeps the two outputs byte-identical on the payloads in the TWIN CONTRACT block.
 */
function renderAttributes(tag: string, attrs: Readonly<Record<string, string | undefined>>): string | null {
  let out = "";
  if (tag === "a") {
    const href = decodeEntities(attrs.href ?? "");
    if (href.length > 0 && isSafeUrl(href, HREF_SCHEMES)) {
      out += ` href="${escapeAttr(href)}"`;
    }
  } else if (tag === "img") {
    const src = decodeEntities(attrs.src ?? "");
    if (src.length === 0 || !isSafeUrl(src, IMG_SRC_SCHEMES)) {
      return null;
    }
    out += ` src="${escapeAttr(src)}"`;
    if (attrs.alt !== undefined) {
      out += ` alt="${escapeAttr(decodeEntities(attrs.alt))}"`;
    }
    for (const dimension of ["width", "height"] as const) {
      const raw = attrs[dimension];
      if (raw === undefined) continue;
      const value = raw.trim();
      const match = DIMENSION_PATTERN.exec(value);
      if (match === null) continue;
      // The unit form is already bounded by the five digits in the shared pattern; the unitless
      // form gets the explicit range, because `width="999999999999"` is the one that blows out a
      // layout and it is the one that is not a CSS length anyone meant to write.
      if (match[1] === undefined) {
        const size = Number.parseInt(value, 10);
        if (size < 1 || size > MAX_IMG_DIMENSION) continue;
      }
      out += ` ${dimension}="${escapeAttr(value)}"`;
    }
  }
  return out;
}

/**
 * Parses the attribute text of a tag (the slice between the tag name and its `>`) into a map.
 *
 * Values are decoded so callers work with the true attribute value. A stray `/` (the
 * `<script/xss …>` trick) and boolean attributes without a value are both tolerated and absorbed.
 */
function parseAttributes(source: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const attribute = /([^\s/=>"']+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]*)))?/g;
  let match = attribute.exec(source);
  while (match !== null) {
    const name = match[1].toLowerCase();
    if (name.length > 0) {
      // An attribute present without a value yields `""`; the `?? ""` keeps that distinct from a
      // quoted empty string only in intent — both are `""`, which is correct downstream.
      attrs[name] = match[2] ?? match[3] ?? match[4] ?? "";
    }
    // Guard against zero-width matches stalling the scan.
    if (match[0].length === 0) {
      attribute.lastIndex += 1;
    }
    match = attribute.exec(source);
  }
  return attrs;
}

/**
 * Finds the end of a tag started at `start` (the index of `<`), respecting quoted attribute
 * values that may themselves contain `>`.
 *
 * Returns the index just past the closing `>`, or `-1` if the tag is unterminated.
 *
 * WHY `lastGt` IS PASSED IN. A tag that never closes makes this scan the rest of the document,
 * and a document with N unterminated `<`s therefore cost N full scans — quadratic, which is a
 * denial of service reachable from a story body. `input.lastIndexOf(">")` is computed ONCE per
 * `sanitizeHtml` call and answers the question in O(1): no `>` exists after that index, so no tag
 * starting at or after it can have an end. The quote walk below is unchanged, so a `>` inside a
 * quoted attribute value still does not count as a terminator.
 */
function findTagEnd(input: string, start: number, lastGt: number): number {
  if (start >= lastGt) return -1; // no `>` exists after `start`, so no tag can be closed here
  let quote = "";
  for (let i = start + 1; i < input.length; i += 1) {
    const char = input[i];
    if (quote !== "") {
      if (char === quote) quote = "";
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === ">") return i + 1;
  }
  return -1;
}

/** Whether the byte at `at` is ASCII whitespace, the set a tag name may be followed by. */
function isTagNameTerminator(char: string | undefined): boolean {
  return char === undefined || char === ">" || char === "/" || /\s/.test(char);
}

/**
 * Whether the `<` at `at` closes the element named `name`.
 *
 * ⚠️ BOUNDED BY CONSTRUCTION, AND THAT IS THE WHOLE POINT. The previous implementation called
 * `input.slice(next).toLowerCase()` — a copy of the REST OF THE DOCUMENT — for every `<` inside a
 * `<script>`/`<style>`. A 400KB body of `<x` repeated measured 118 seconds on the main thread, and
 * the render path is on the main thread. This version copies at most `name.length` characters and
 * reads the terminator straight out of `input`, so the dropped-content scan is linear in the size
 * of the dropped region rather than quadratic in the size of the document.
 */
function isClosingTagFor(input: string, at: number, name: string): boolean {
  // `at` points at `<`; a closing tag needs `</` next, then the tag name, then a terminator.
  const nameStart = at + 2;
  if (input.slice(nameStart, nameStart + name.length).toLowerCase() !== name) return false;
  return isTagNameTerminator(input[nameStart + name.length]);
}

/**
 * The sanitizer. Takes untrusted HTML and returns HTML containing only allowlisted markup, with
 * disallowed tags stripped (their inner text kept, except `<script>`/`<style>` whose text is
 * dropped), every `on*` handler and unsafe URL gone, and all text and attribute values escaped.
 *
 * ENTITIES ARE CLASSIFIED INTACT, NEVER DOCUMENT-WIDE. A browser decodes entities in TEXT and in
 * ATTRIBUTE VALUES, and this module decodes them in exactly those two places and nowhere else.
 * `the &lt;script&gt; tag` is therefore text on the way in and the same escaped text on the way
 * out; pre-decoding the input would have made it a real `<script>` for the scanner to classify.
 * That is the bug the write path had, and it is not one this layer is allowed to reintroduce.
 *
 * THE SCAN IS ONE LINEAR PASS. Runs of non-`<` characters are taken with `indexOf` and appended in
 * one slice, so a 300KB body is a few hundred slices rather than a few hundred thousand
 * concatenations, and no step ever copies more of the document than the token it is looking at.
 */
export function sanitizeHtml(input: string): string {
  let out = "";
  // Names of the allowed, non-void elements currently open, for balanced auto-closing.
  const stack: string[] = [];
  // When inside a `<script>`/`<style>`, the tag name we are skipping until closed.
  let dropping: string | null = null;
  // Raw text accumulated between tags; flushed (decoded + escaped) at each tag boundary.
  let text = "";
  // The index of the last `>` in the input. See `findTagEnd` for why it is computed once.
  const lastGt = input.lastIndexOf(">");

  const flushText = (): void => {
    if (text.length === 0) return;
    out += escapeText(decodeEntities(text));
    text = "";
  };

  let i = 0;
  while (i < input.length) {
    // Inside `<script>`/`<style>`: emit nothing — not even text — until the matching close tag.
    // Checked FIRST so dropped content never reaches the text buffer.
    if (dropping !== null) {
      const next = input.indexOf("<", i);
      if (next === -1) {
        i = input.length;
        break;
      }
      if (isClosingTagFor(input, next, dropping)) {
        const end = findTagEnd(input, next, lastGt);
        if (end === -1) {
          i = input.length;
          break;
        }
        i = end;
        dropping = null;
      } else {
        i = next + 1;
      }
      continue;
    }

    // Everything up to the next `<` is text. Taking it in one bounded slice is what keeps the
    // pass linear: the previous implementation appended one character at a time.
    const tagStart = input.indexOf("<", i);
    if (tagStart === -1) {
      text += input.slice(i);
      break;
    }
    if (tagStart > i) {
      text += input.slice(i, tagStart);
      i = tagStart;
    }

    // Comment `<!-- -->`: dropped entirely (Principle: a comment cannot smuggle markup past a
    // downstream re-parse, and a half-open one swallows the rest, which is the safe direction).
    if (input.startsWith("<!--", i)) {
      const end = input.indexOf("-->", i + 4);
      flushText();
      i = end === -1 ? input.length : end + 3;
      continue;
    }

    // CDATA `<![CDATA[ … ]]>`: dropped entirely.
    if (input.startsWith("<![CDATA[", i)) {
      const end = input.indexOf("]]>", i);
      flushText();
      i = end === -1 ? input.length : end + 3;
      continue;
    }

    // Any other declaration (`<!DOCTYPE>`, `<![…]`): dropped through its `>`.
    if (input[i + 1] === "!") {
      const end = findTagEnd(input, i, lastGt);
      flushText();
      i = end === -1 ? input.length : end;
      continue;
    }

    // A processing-instruction / stray `<` that does not open a tag (`<<`, `<3`, `< `) is text.
    // This is what neutralises the `<<SCRIPT>` nested-angle-bracket trick: the leading `<` is
    // emitted as `&lt;` and the real `<SCRIPT>` behind it is tokenized on the next iteration.
    const after = input[i + 1];
    const isOpen = after !== undefined && /[a-zA-Z]/.test(after);
    const isClose = after === "/";
    if (!isOpen && !isClose) {
      text += "<";
      i += 1;
      continue;
    }

    const end = findTagEnd(input, i, lastGt);
    if (end === -1) {
      // Unterminated tag: no `>` ahead, so this `<` cannot open a tag after all. It is emitted as
      // escaped text and scanning continues after it, which is the only reading that loses
      // nothing: dropping the remainder of the document to avoid half-emitting a tag is a content
      // loss on input an author typed (`<p class="x` at the end of a draft) and a byte-swallowing
      // hole on input an attacker typed. The backend applies the same rule.
      text += "<";
      i += 1;
      continue;
    }

    const inner = input.slice(i + 1, end - 1); // between the angle brackets, minus `<` and `>`
    flushText();
    i = end;

    if (isClose) {
      const name = /^\/?\s*([a-zA-Z][a-zA-Z0-9-]*)/.exec(inner)?.[1].toLowerCase() ?? "";
      if (name === "" || VOID_TAGS.has(name)) continue; // stray or void close — ignore
      const at = stack.lastIndexOf(name);
      if (at === -1) continue; // stray close for an element we never opened
      // Close everything opened after it, then it — keeps the output balanced on misnesting.
      while (stack.length > at) {
        const closing = stack.pop() ?? "";
        out += `</${closing}>`;
      }
      continue;
    }

    const name = /^([a-zA-Z][a-zA-Z0-9-]*)/.exec(inner)?.[1].toLowerCase() ?? "";
    if (name === "") continue;

    if (CONTENT_DROPPED_TAGS.has(name)) {
      dropping = name; // inner text is dropped too
      continue;
    }

    if (!ALLOWED_TAGS.has(name)) {
      continue; // strip the tag; its inner text keeps flowing as text
    }

    const attrs = parseAttributes(inner.slice(name.length));
    const rendered = renderAttributes(name, attrs);
    if (rendered === null) continue; // no usable `src` — the element is dropped, not emitted bare
    // A void tag is emitted without a self-closing marker (`<br>` and `<img …>` are complete in
    // HTML5) and is never pushed on the stack. A non-void tag is opened and tracked for closing.
    out += `<${name}${rendered}>`;
    if (!VOID_TAGS.has(name)) {
      stack.push(name);
    }
  }

  flushText();
  // Auto-close anything left open so the output is well-formed.
  while (stack.length > 0) {
    out += `</${stack.pop() ?? ""}>`;
  }

  return out;
}
