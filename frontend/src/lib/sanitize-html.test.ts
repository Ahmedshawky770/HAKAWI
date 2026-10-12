/// <reference types="@testing-library/jest-dom/vitest" />

import { describe, expect, it } from "vitest";

import { sanitizeHtml } from "@/lib/sanitize-html";

/**
 * The sanitizer is the only thing between untrusted `story.content` and `dangerouslySetInnerHTML`
 * on the story page, so its tests are the security gate. They are organised around the model, not
 * around a corpus of payloads: an allowlist that keeps what it should and drops everything else.
 */

/** Every tag the allowlist keeps, paired with the smallest input that should survive verbatim. */
const ALLOWED_CASES: Record<string, string> = {
  p: "<p>x</p>",
  strong: "<strong>x</strong>",
  b: "<b>x</b>",
  em: "<em>x</em>",
  i: "<i>x</i>",
  u: "<u>x</u>",
  s: "<s>x</s>",
  blockquote: "<blockquote>x</blockquote>",
  h1: "<h1>x</h1>",
  h2: "<h2>x</h2>",
  h3: "<h3>x</h3>",
  h4: "<h4>x</h4>",
  h5: "<h5>x</h5>",
  h6: "<h6>x</h6>",
  ul: "<ul><li>x</li></ul>",
  ol: "<ol><li>x</li></ol>",
  li: "<li>x</li>",
  hr: "<hr>",
  pre: "<pre>x</pre>",
  code: "<code>x</code>",
  span: "<span>x</span>",
  div: "<div>x</div>",
  figure: "<figure>x</figure>",
  figcaption: "<figcaption>x</figcaption>",
};

describe("sanitizeHtml — allowed tags survive", () => {
  for (const [tag, html] of Object.entries(ALLOWED_CASES)) {
    it(`keeps <${tag}>`, () => {
      expect(sanitizeHtml(html)).toBe(html);
    });
  }

  it("keeps a full table skeleton intact", () => {
    const table =
      "<table><thead><tr><th>a</th></tr></thead><tbody><tr><td>b</td></tr></tbody></table>";
    expect(sanitizeHtml(table)).toBe(table);
  });

  it("keeps nested formatting", () => {
    expect(sanitizeHtml("<div><p>hi <strong>there</strong></p></div>")).toBe(
      "<div><p>hi <strong>there</strong></p></div>",
    );
  });
});

describe("sanitizeHtml — attribute policy", () => {
  it("keeps http/https/mailto and same-document relative href on a link", () => {
    expect(sanitizeHtml('<a href="https://example.com">x</a>')).toContain('href="https://example.com"');
    expect(sanitizeHtml('<a href="http://example.com">x</a>')).toContain('href="http://example.com"');
    expect(sanitizeHtml('<a href="mailto:a@b.com">x</a>')).toContain('href="mailto:a@b.com"');
    // A same-document relative href is resolved by the browser against the story page, which is a
    // page origin the RENDER layer has and the write path does not. That is the one deliberate
    // asymmetry between the two sanitizers, and it is in the safe direction.
    expect(sanitizeHtml('<a href="/relative/path">x</a>')).toContain('href="/relative/path"');
  });

  it("decodes entities before the scheme check, and only with a trailing semicolon", () => {
    // Named references decode only when terminated (`&reg;` decodes; `&reg=2` is a query
    // parameter, not a reference) — the rule that keeps ordinary URLs intact.
    expect(sanitizeHtml('<a href="/search?a=1&reg;2">x</a>')).toContain('href="/search?a=1\u00ae2"');
    expect(sanitizeHtml('<a href="/search?a=1&reg=2">x</a>')).toContain('href="/search?a=1&amp;reg=2"');
    expect(sanitizeHtml('<a href="https://x.com/p?a=1&sect=2">x</a>')).toContain(
      'href="https://x.com/p?a=1&amp;sect=2"',
    );
    // Numeric references decode with or without a semicolon in a browser, so they do here too.
    expect(sanitizeHtml('<a href="&#106;avascript:alert(1)">x</a>')).toBe("<a>x</a>");
    expect(sanitizeHtml('<a href="&#x6A;avascript:alert(1)">x</a>')).toBe("<a>x</a>");
    expect(sanitizeHtml('<a href="java&#x09;script:alert(1)">x</a>')).toBe("<a>x</a>");
    expect(sanitizeHtml('<a href="java&Tab;script:alert(1)">x</a>')).toBe("<a>x</a>");
    expect(sanitizeHtml('<a href="java&colon;script:alert(1)">x</a>')).toBe("<a>x</a>");
    expect(sanitizeHtml('<a href="&Tab;javascript:alert(1)">x</a>')).toBe("<a>x</a>");
  });

  it("refuses protocol-relative and backslash-relative href values", () => {
    // The frontend/backend divergence flagged in review. `//host` and `/\host` inherit the
    // ambient scheme, so a link that looked relative navigates the reader off-origin.
    expect(sanitizeHtml('<a href="//evil.example">x</a>')).toBe("<a>x</a>");
    expect(sanitizeHtml('<a href="/\\evil.example">x</a>')).toBe("<a>x</a>");
    expect(sanitizeHtml('<a href="\\evil.example">x</a>')).toBe("<a>x</a>");
    expect(sanitizeHtml('<a href="&sol;&sol;evil.example">x</a>')).toBe("<a>x</a>");
    expect(sanitizeHtml('<a href="&bsol;&sol;evil.example">x</a>')).toBe("<a>x</a>");
    // A control character in front of the scheme does not hide it either.
    expect(sanitizeHtml('<a href=" \tjavascript:alert(1)">x</a>')).toBe("<a>x</a>");
  });

  it("drops a scheme that is not http/https/mailto from href", () => {
    expect(sanitizeHtml('<a href="ftp://example.com">x</a>')).toBe("<a>x</a>");
    expect(sanitizeHtml('<a href="tel:+123">x</a>')).toBe("<a>x</a>");
  });

  it("drops every on* handler, class, style and srcset; keeps the safe attrs", () => {
    expect(
      sanitizeHtml('<a href="https://example.com" onclick="steal()" style="color:red" class="x">t</a>'),
    ).toBe('<a href="https://example.com">t</a>');
    expect(
      sanitizeHtml('<img src="https://x.test/a.png" srcset="javascript:alert(1)" alt="c" width="120" height="240">'),
    ).toBe('<img src="https://x.test/a.png" alt="c" width="120" height="240">');
  });

  it("keeps alt/width/height on an image within the shared dimension policy", () => {
    expect(sanitizeHtml('<img src="https://x.test/a.png" alt="cover">')).toContain('alt="cover"');
    expect(sanitizeHtml('<img src="https://x.test/a.png" width="10" height="20">')).toContain('width="10"');
    // An optional unit is part of the value, not a rejection reason: `width="320px"` is what every
    // HTML editor emits, and the frontend used to drop it while the backend stored it. The pattern
    // is the same one in `backend/src/common/utils/sanitize-html.ts`.
    expect(sanitizeHtml('<img src="https://x.test/a.png" width="320px">')).toContain('width="320px"');
    expect(sanitizeHtml('<img src="https://x.test/a.png" width="50%">')).toContain('width="50%"');
    expect(sanitizeHtml('<img src="https://x.test/a.png" height="12em">')).toContain('height="12em"');
    // Refused: not a number at all, more than five digits, a unit that is not one of the three.
    expect(sanitizeHtml('<img src="https://x.test/a.png" width="auto">')).not.toContain("width");
    expect(sanitizeHtml('<img src="https://x.test/a.png" width="123456px">')).not.toContain("width");
    expect(sanitizeHtml('<img src="https://x.test/a.png" width="10vw">')).not.toContain("width");
    // Refused: the unitless form is bounded, because that is the one that blows out a layout.
    expect(sanitizeHtml('<img src="https://x.test/a.png" width="999999999999">')).not.toContain("width");
    expect(sanitizeHtml('<img src="https://x.test/a.png" width="0">')).not.toContain("width");
    expect(sanitizeHtml('<img src="https://x.test/a.png" width="10001">')).not.toContain("width");
    expect(sanitizeHtml('<img src="https://x.test/a.png" width="10000">')).toContain('width="10000"');
  });

  it("allows https, http and relative image src; refuses data:, javascript: and protocol-relative", () => {
    expect(sanitizeHtml('<img src="https://x.test/a.png">')).toContain('src="https://x.test/a.png"');
    expect(sanitizeHtml('<img src="/local.png">')).toContain('src="/local.png"');
    // RENDER-LAYER POLICY: http is accepted. A row written before the write-path guard existed can
    // carry an http image, and this layer runs over what the database already holds. Refusing it
    // would trade a mixed-content downgrade — which the browser blocks on its own — for a broken
    // image. What new rows may carry is the write path's decision, in
    // `backend/src/common/utils/sanitize-html.ts`. Asserted here so the reading is read as a
    // decision and not as a regression.
    expect(sanitizeHtml('<img src="http://x.test/a.png">')).toContain('src="http://x.test/a.png"');
    expect(sanitizeHtml('<img src="data:image/png;base64,AAAA">')).toBe("");
    expect(sanitizeHtml('<img src="javascript:alert(1)">')).toBe("");
    // Protocol-relative and backslash-relative values inherit the ambient scheme, so they are
    // refused rather than resolved — on BOTH paths, which is the divergence this pins down.
    expect(sanitizeHtml('<img src="//evil.example/x.png">')).toBe("");
    expect(sanitizeHtml('<img src="/\\evil.example/x.png">')).toBe("");
    expect(sanitizeHtml('<img src="&sol;&sol;evil.example/x.png">')).toBe("");
    expect(sanitizeHtml('<img src="&bsol;&bsol;evil.example/x.png">')).toBe("");
    // An `img` with no usable `src` is dropped rather than emitted bare, matching the backend.
    expect(sanitizeHtml("<img>")).toBe("");
    expect(sanitizeHtml('<img alt="orphan">')).toBe("");
  });
});

describe("sanitizeHtml — disallowed tags and their content", () => {
  // Tags whose INNER TEXT is dropped along with the tag.
  for (const tag of ["script", "style"]) {
    it(`drops <${tag}> and its contents`, () => {
      const out = sanitizeHtml(`<${tag}>secretPayload();</${tag}>`);
      expect(out).toBe("");
      expect(out.toLowerCase()).not.toContain("payload");
    });
  }

  // Tags that are stripped but whose inner text is kept as escaped text.
  for (const tag of ["iframe", "object", "embed", "svg", "math", "form", "title", "font", "bgsound"]) {
    it(`strips <${tag}> but keeps its inner text`, () => {
      const out = sanitizeHtml(`<${tag}>keptText</${tag}>`).toLowerCase();
      expect(out).not.toContain(`<${tag}`);
      expect(out).toContain("kepttext");
    });
  }

  // Void / standalone disallowed elements: gone entirely, nothing inside to keep.
  for (const tag of ["input", "base", "meta", "link", "marquee", "video", "audio", "canvas"]) {
    it(`drops <${tag}>`, () => {
      const out = sanitizeHtml(`<${tag} src="x">`).toLowerCase();
      expect(out).not.toContain(`<${tag}`);
    });
  }
});

/**
 * The OWASP XSS Filter Evasion Cheat Sheet, plus the distinctive notables. Each asserts the
 * dangerous construct is absent — never that a specific string survived, because the safe output
 * shape is an implementation detail, the absence of the vector is the contract.
 */
describe("sanitizeHtml — OWASP filter-evasion classics", () => {
  const payloads: { name: string; html: string; forbidden: RegExp }[] = [
    { name: "IMG SRC=javascript", html: `<IMG SRC=javascript:alert('XSS')>`, forbidden: /javascript/i },
    { name: "IMG SRC=JaVaScRiPt", html: `<IMG SRC=JaVaScRiPt:alert(1)>`, forbidden: /javascript/i },
    { name: "img src=x onerror", html: `<img src=x onerror=alert(1)>`, forbidden: /onerror/i },
    { name: "nested <<SCRIPT", html: `<<SCRIPT>alert("XSS");//<</SCRIPT>`, forbidden: /script|alert/i },
    { name: "SCRIPT/XSS SRC", html: `<SCRIPT/XSS SRC="http://x.test/xss.js"></SCRIPT>`, forbidden: /script/i },
    { name: "SCRIPT SRC=...?<B>", html: `<SCRIPT SRC=http://x.test/xss.js?<B>`, forbidden: /script|<b/i },
    { name: "</TITLE><SCRIPT>", html: `</TITLE><SCRIPT>alert(1)</SCRIPT>`, forbidden: /script|alert/i },
    { name: "BODY ONLOAD", html: `<BODY ONLOAD=alert(1)>`, forbidden: /onload|\bon\w+=/i },
    { name: "INPUT IMAGE javascript", html: `<INPUT TYPE="IMAGE" SRC="javascript:alert(1);">`, forbidden: /javascript|<input/i },
    { name: "LINK stylesheet javascript", html: `<LINK REL="stylesheet" HREF="javascript:alert(1);">`, forbidden: /javascript|<link/i },
    {
      name: "STYLE list-style-image javascript",
      html: `<STYLE>li {list-style-image: url("javascript:alert(1)");}</STYLE>`,
      forbidden: /javascript|list-style|expression/i,
    },
    {
      name: "entity-encoded javascript (&#14;)",
      html: `<IMG SRC=" &#14;  javascript:alert(1);">`,
      forbidden: /javascript|<img src$/,
    },
    { name: "XSS STYLE expression", html: `<XSS STYLE="xss:expression(alert(1))">`, forbidden: /expression|<xss|style/i },
    { name: "vbscript href", html: `<a href="vbscript:msgbox(1)">x</a>`, forbidden: /vbscript|href="vbscript/i },
    { name: "data:text/html href", html: `<a href="data:text/html,<script>alert(1)</script>">x</a>`, forbidden: /data:text|script/i },
    { name: "meta refresh javascript url", html: `<meta http-equiv="refresh" content="0;url=javascript:alert(1)">`, forbidden: /javascript|<meta/i },
    { name: "svg onload", html: `<svg onload=alert(1)></svg>`, forbidden: /onload|svg/i },
  ];

  for (const { name, html, forbidden } of payloads) {
    it(`neutralises: ${name}`, () => {
      const out = sanitizeHtml(html);
      expect(out).not.toMatch(forbidden);
      // Regardless of the specific payload, no event handler attribute may ever remain.
      expect(out).not.toMatch(/\bon[a-z]+\s*=/i);
    });
  }
});

describe("sanitizeHtml — comments, CDATA, malformed and encoding", () => {
  it("drops HTML comments entirely, including script inside them", () => {
    expect(sanitizeHtml(`<!-- <script>alert(1)</script> -->done`)).toBe("done");
  });

  it("drops CDATA sections entirely", () => {
    expect(sanitizeHtml(`<![CDATA[<script>alert(1)</script>]]>ok`)).toBe("ok");
  });

  it("drops doctype and other declarations", () => {
    expect(sanitizeHtml(`<!DOCTYPE html><p>x</p>`)).toBe("<p>x</p>");
  });

  it("auto-closes unclosed tags into balanced markup", () => {
    expect(sanitizeHtml("<div><p>hi")).toBe("<div><p>hi</p></div>");
    // A string sanitizer does not perform HTML5 implied-end-tag normalisation; it guarantees
    // well-formed (balanced) output, which the browser then tree-parses correctly on render.
    expect(sanitizeHtml("<ul><li>a</li><li>b</li></ul>")).toBe("<ul><li>a</li><li>b</li></ul>");
    expect(sanitizeHtml("<ul><li>a")).toBe("<ul><li>a</li></ul>");
  });

  it("closes misnested tags safely", () => {
    expect(sanitizeHtml("<b>bold<i>x</b>")).toBe("<b>bold<i>x</i></b>");
  });

  it("treats a stray < that cannot open a tag as text, and emits an unterminated < as escaped text", () => {
    // `< b` cannot open a tag (a letter must follow `<`), so it is literal text.
    expect(sanitizeHtml("5 < 3 and a < b")).toBe("5 &lt; 3 and a &lt; b");
    // RECONCILED RULE (e): a `<` with no `>` ahead cannot open a complete tag, so it is emitted as
    // escaped text and scanning continues after THAT `<` — the tail is kept as text rather than
    // being dropped to the end of the document. The old "drop to the end" behaviour lost
    // everything an author typed after the incomplete tag, and it was reachable from a story body.
    // The backend applies the same rule, so the two layers agree on this input.
    expect(sanitizeHtml("keep a<b onerror=alert(1)")).toBe("keep a&lt;b onerror=alert(1)");
    // It stays TEXT — the `<` is escaped — so the handler-looking bytes are characters a reader
    // sees rather than an attribute inside a tag a browser would parse.
    expect(sanitizeHtml("keep a<b onerror=alert(1)")).toContain("&lt;b onerror=alert(1)");
    expect(sanitizeHtml("keep a<b onerror=alert(1)")).not.toMatch(/<b\s+onerror/i);
    expect(sanitizeHtml("<div><p hi")).toBe("<div>&lt;p hi</div>");
    expect(sanitizeHtml("<ul><li a")).toBe("<ul>&lt;li a</ul>");
  });

  it("escapes text content rather than dropping it", () => {
    expect(sanitizeHtml("a < b & c > d")).toBe("a &lt; b &amp; c &gt; d");
  });

  it("renders already-escaped text as the text it represents, not double-escaped", () => {
    expect(sanitizeHtml("<p>R&amp;D</p>")).toBe("<p>R&amp;D</p>");
    expect(sanitizeHtml("<p>&lt;script&gt;hi&lt;/script&gt;</p>")).toBe("<p>&lt;script&gt;hi&lt;/script&gt;</p>");
  });

  it("classifies text with entities INTACT — never decodes the document before scanning it", () => {
    // RECONCILED RULE (f), and the reason this test exists in this exact shape. A pre-decode of
    // the whole input — which is what the write path used to do — would turn `&lt;script&gt;`
    // into a real `<script>` for the scanner to classify, so an author writing ABOUT the script
    // tag would have their prose deleted and a payload hidden behind an entity would be
    // recognised by the sanitizer but never by the browser that follows it. Here the entities are
    // still encoded at classification time, so they stay text.
    expect(sanitizeHtml("the &lt;script&gt; tag")).toBe("the &lt;script&gt; tag");
    expect(sanitizeHtml("<p>the &lt;script&gt; tag</p>")).toBe("<p>the &lt;script&gt; tag</p>");
    // …and it is not merely preserved, it is preserved as SAFE text: no tag is opened by it.
    expect(sanitizeHtml("&lt;img src=x onerror=alert(1)&gt;")).toBe(
      "&lt;img src=x onerror=alert(1)&gt;",
    );
    // The same entity in an attribute still decodes exactly once, which is what catches
    // `href="&#106;avascript:…"`. Text and attributes are decoded; the raw stream never is.
    expect(sanitizeHtml("a < b &amp; c")).toBe("a &lt; b &amp; c");
  });

  it("defeats single-encoded scheme entities but is consistent with the browser on double-encoding", () => {
    // Single-encoded: the browser decodes &#106; → 'j' once, giving javascript:. So do we, and drop it.
    expect(sanitizeHtml(`<a href="&#106;avascript:alert(1)">x</a>`)).toBe("<a>x</a>");
    expect(sanitizeHtml(`<a href="&#x6a;avascript:alert(1)">x</a>`)).toBe("<a>x</a>");
    // Double-encoded: decodes once to the literal `&#106;avascript:` in BOTH us and the browser,
    // which is not a scheme — so it survives as a harmless relative href and never becomes javascript:.
    const out = sanitizeHtml(`<a href="&amp;#106;avascript:alert(1)">x</a>`);
    expect(out).not.toMatch(/javascript:/i);
  });

  it("keeps a & inside a URL working after the round trip", () => {
    expect(sanitizeHtml('<a href="https://x.test/s?a=1&b=2">x</a>')).toContain('href="https://x.test/s?a=1&amp;b=2"');
  });
});

describe("sanitizeHtml — a whole payload set leaves no handler behind", () => {
  it("never emits an on* attribute across a battery of inputs", () => {
    const inputs = [
      "<img src=x onerror=alert(1)>",
      "<a href=# onclick=alert(1)>x</a>",
      "<div onmouseover='alert(1)'>x</div>",
      "<BODY ONLOAD=alert(1)>",
      "<svg/onload=alert(1)>",
      "<p onfocus=alert(1) autofocus>x</p>",
    ];
    for (const html of inputs) {
      expect(sanitizeHtml(html)).not.toMatch(/\bon[a-z]+\s*=/i);
    }
  });

  it("returns the empty string for a body that is only a script", () => {
    expect(sanitizeHtml("<script>while(1){}</script>")).toBe("");
  });
});

/**
 * ⚠️⚠️ TWIN CONTRACT — THE AGREED POLICY OF THE TWO SANITIZERS ⚠️⚠️
 *
 * This block is the single place the render-layer policy in `src/lib/sanitize-html.ts` and the
 * write-layer policy in `backend/src/common/utils/sanitize-html.ts` are written down side by side.
 * Every row is an input BOTH sanitizers must classify the same way, and every row is asserted with
 * the render layer's exact output.
 *
 * WHY IT IS A LIST AND NOT A SHARED MODULE (Principle #9). The two files cannot import one table
 * without moving it into `packages/shared-types` and giving the backend a build dependency on the
 * shared package for one regex and one policy — which is a bigger change than the duplication it
 * would remove, and the packages are versioned separately on purpose. So the rule is kept in sync
 * by being written down in one place and cross-checked by hand on every change to either file.
 * This block IS that place: if you change a rule here, change it there, and move the row.
 *
 * THE TWO DELIBERATE ASYMMETRIES, both in the safe direction (the render layer is never LESS
 * permissive than the write layer, because it is the filter that runs last):
 *
 *   1. `img src` with an `http:` scheme is accepted HERE, on the render layer, and the write path
 *      is the authority for what new rows may contain. Rows written before the write-path guard
 *      existed can carry an http image, and the render layer runs over what the database already
 *      holds, so refusing it would turn a mixed-content downgrade — which the browser blocks by
 *      itself — into a broken image. This row is pinned to the render layer only and marked as
 *      such below, so nobody cross-checks it as an agreement.
 *   2. `<a href>` pointing at a same-document relative URL is ACCEPTED here. A relative href is
 *      resolved by the browser against the story page, and the render layer HAS that page
 *      context; the write path does not, so it refuses rather than guess.
 *
 * Protocol-relative refusal, the dimension shape, the entity-semicolon rule, the script/style
 * subtree rule and the unterminated-`<` rule are IDENTICAL on both sides — those rows are the
 * contract, not an observation.
 */
describe("sanitizeHtml — TWIN CONTRACT with backend/src/common/utils/sanitize-html.ts", () => {
  const contract: { input: string; expected: string; why: string; renderOnly?: boolean }[] = [
    // ── URL scheme policy ────────────────────────────────────────────────────────────────────────
    {
      input: '<a href="https://example.com/x">l</a>',
      expected: '<a href="https://example.com/x">l</a>',
      why: "https is allowed for href on both sides",
    },
    {
      input: '<a href="javascript:alert(1)">l</a>',
      expected: "<a>l</a>",
      why: "an unsupported scheme loses the href, never the element or its text",
    },
    {
      input: '<a href="vbscript:msgbox(1)">l</a>',
      expected: "<a>l</a>",
      why: "same, for the vbscript spelling",
    },
    {
      input: '<a href="&#106;avascript:alert(1)">l</a>',
      expected: "<a>l</a>",
      why: "numeric entities decode once before the scheme check, on both sides",
    },
    {
      input: '<a href="java&colon;script:alert(1)">l</a>',
      expected: "<a>l</a>",
      why: "named entities decode once, with the semicolon, before the scheme check",
    },
    // ── protocol-relative refusal: the divergence that was flagged in review ────────────────────
    {
      input: '<a href="//evil.example">l</a>',
      expected: "<a>l</a>",
      why: "`//host` inherits the ambient scheme, so it is REFUSED by both sanitizers",
    },
    {
      input: '<a href="/\\evil.example">l</a>',
      expected: "<a>l</a>",
      why: "`/\\host` is the same URL spelled differently; refused by both",
    },
    {
      input: '<img src="//evil.example/x.png">',
      expected: "",
      why: "protocol-relative image src is refused by both, and an `img` with no usable src is dropped",
    },
    // ── entity decoding: one decode, semicolon required for named references ─────────────────────
    {
      input: '<a href="https://x.com/p?a=1&sect=2">l</a>',
      expected: '<a href="https://x.com/p?a=1&amp;sect=2">l</a>',
      why: "`&sect=2` has no semicolon, so it is NOT a reference: it survives as a query parameter",
    },
    {
      input: '<a href="https://x.com/p?a=1&reg;2">l</a>',
      expected: '<a href="https://x.com/p?a=1\u00ae2">l</a>',
      why: "`&reg;` HAS the semicolon, so it decodes — exactly as a browser decodes it",
    },
    // ── dimensions: one shared pattern, one shared outcome ──────────────────────────────────────
    {
      input: '<img src="https://x.test/a.png" width="320px">',
      expected: '<img src="https://x.test/a.png" width="320px">',
      why: "`<int>px` / `<int>%` up to five digits is a dimension both sanitizers keep",
    },
    {
      input: '<img src="https://x.test/a.png" width="50%">',
      expected: '<img src="https://x.test/a.png" width="50%">',
      why: "percentage widths are the common editor spelling",
    },
    {
      input: '<img src="http://x.test/a.png">',
      expected: '<img src="http://x.test/a.png">',
      why: "RENDER-ONLY ASYMMETRY: http images are accepted here because legacy rows can carry them; the write path owns what new rows may contain",
      renderOnly: true,
    },
    // ── which content survives when a tag is not allowlisted ────────────────────────────────────
    {
      input: "<iframe>kept text</iframe>",
      expected: "kept text",
      why: "a disallowed tag loses its TAGS and keeps its TEXT — `script`/`style` are the only subtree drops",
    },
    {
      input: "<script>alert(1)</script>after",
      expected: "after",
      why: "`script` drops its whole subtree, including its text, on both sides",
    },
    {
      input: "<style>li{color:red}</style><p>ok</p>",
      expected: "<p>ok</p>",
      why: "`style` drops its whole subtree too; the prose after it is untouched",
    },
    // ── text handling: a `<` that opens nothing, and entities left intact ───────────────────────
    {
      input: "she whispered x<y and the night went on and on",
      expected: "she whispered x&lt;y and the night went on and on",
      why: "a `<` that opens no tag becomes escaped text, and the rest of the sentence survives",
    },
    {
      input: "the &lt;script&gt; tag",
      expected: "the &lt;script&gt; tag",
      why: "text is classified with entities INTACT on both sides — never a pre-decoded document",
    },
    {
      input: "<div><p hi",
      expected: "<div>&lt;p hi</div>",
      why: "a `<` with no `>` ahead is escaped text; the tail is kept, not dropped to EOF",
    },
  ];

  for (const { input, expected, why, renderOnly } of contract) {
    it(`${renderOnly ? "[render-only] " : ""}${why}`, () => {
      expect(sanitizeHtml(input)).toBe(expected);
      if (renderOnly) {
        // A row pinned to the render layer only, because the write path is the authority for what
        // NEW rows may contain and its set is allowed to be narrower than this one — narrowing it
        // must not start breaking rows that already exist. Pinned here so the asymmetry reads as
        // a decision; see the block comment for the reasoning.
        return;
      }
      // No row in the contract may leave an event handler, a `<script`, or a javascript: URL
      // behind, whatever else it keeps.
      const out = sanitizeHtml(input);
      expect(out).not.toMatch(/\bon[a-z]+\s*=/i);
      expect(out).not.toMatch(/javascript:/i);
      expect(out).not.toMatch(/<script/i);
    });
  }
});

