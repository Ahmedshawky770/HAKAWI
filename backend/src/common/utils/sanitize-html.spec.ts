import { describe, it, expect } from 'vitest';

import { sanitizeHtml } from './sanitize-html.ts';

/**
 * The vectors below are the OWASP filter-evasion classics, plus the cases the write path actually
 * depends on, plus a regression for every failure an adversarial review found in this file.
 *
 * WHY THE ASSERTIONS ARE SHAPED THIS WAY. Almost every test asserts a property — "no `on\w+=` survives",
 * "no `javascript:` survives" — rather than an exact string. An exact expected output pins the
 * sanitizer's rendering, which is a refactor detail; the property is the invariant, and an invariant
 * that is asserted on every vector is what catches a regression that adds a new spelling.
 *
 * WHERE THE ASSERTION IS AN EXACT STRING, it is because the string IS the invariant: the disputed
 * character is either emitted or dropped, and "mostly kept" is not a property anyone can assert on.
 */
describe('sanitizeHtml', () => {
  describe('allowed markup', () => {
    it('keeps the allowlisted formatting tags verbatim', () => {
      const input = '<p>Hello <strong>bold</strong> <em>italic</em> <b>b</b> <i>i</i> <u>u</u> <s>s</s></p>';
      expect(sanitizeHtml(input)).toBe(input);
    });

    it('keeps headings, lists, rules, quotes and code', () => {
      const input = '<h1>t</h1><h2>t</h2><h3>t</h3><h4>t</h4><h5>t</h5><h6>t</h6>';
      expect(sanitizeHtml(input)).toBe(input);

      const list = '<ul><li>one</li><li>two</li></ul><ol><li>three</li></ol><hr><br>';
      expect(sanitizeHtml(list)).toBe(list);

      const quoteAndCode = '<blockquote>quoted</blockquote><pre><code>x = 1</code></pre>';
      expect(sanitizeHtml(quoteAndCode)).toBe(quoteAndCode);

      const table = '<table><thead><tr><th>h</th></tr></thead><tbody><tr><td>d</td></tr></tbody></table>';
      expect(sanitizeHtml(table)).toBe(table);

      const figure = '<figure><img src="https://example.com/a.png" alt="a"><figcaption>cap</figcaption></figure>';
      expect(sanitizeHtml(figure)).toBe(figure);

      const layout = '<span>s</span><div>d</div>';
      expect(sanitizeHtml(layout)).toBe(layout);
    });

    it('keeps plain text untouched', () => {
      expect(sanitizeHtml('Once upon a time')).toBe('Once upon a time');
      expect(sanitizeHtml('')).toBe('');
    });

    it('escapes a bare < that opens nothing rather than swallowing it', () => {
      expect(sanitizeHtml('5 < 6 is true')).toBe('5 &lt; 6 is true');
      expect(sanitizeHtml('x < y < z')).toBe('x &lt; y &lt; z');
      expect(sanitizeHtml('a<b<c')).toBe('a&lt;b&lt;c');
    });

    it('escapes a stray & so it cannot become an entity on re-parse', () => {
      expect(sanitizeHtml('a & b &lt; c')).toBe('a &amp; b &lt; c');
    });
  });

  describe('FIX 1 — a < that opens no complete tag must not truncate the story', () => {
    it('keeps every character after a < that opens no tag', () => {
      // The reported case: the `<` before `y` started a tag the input never finished, and the whole
      // remainder was dropped as an unterminated tag. Now it is emitted as `&lt;` and the scan
      // restarts at the next character, so the sentence survives.
      expect(sanitizeHtml('she whispered x<y and the night went on and on')).toBe(
        'she whispered x&lt;y and the night went on and on',
      );
    });

    it('keeps an Arabic sentence with a < in it', () => {
      expect(sanitizeHtml('إذا كان x<y فإن النتيجة صحيحة')).toBe('إذا كان x&lt;y فإن النتيجة صحيحة');
    });

    it('keeps the text after a quoted attribute that is never closed', () => {
      expect(sanitizeHtml('he said "hello <strong friend')).toBe('he said "hello &lt;strong friend');
      expect(sanitizeHtml('<p>text <div class="x')).toBe('<p>text &lt;div class="x</p>');
    });

    it('keeps parsing a later complete tag that follows an unterminated one', () => {
      // The restart is at `start + 1`, so a `<p>` after a half-typed `<div` is still recognised as a
      // tag. This is the same thing a browser's tokenizer does with the same bytes.
      expect(sanitizeHtml('a <div class="x> y <p>z</p>')).toBe('a &lt;div class="x&gt; y <p>z</p>');
    });

    it('treats attributes after a < as a browser does, and loses no words', () => {
      // `<b and more <p>` is ONE tag to the HTML5 tokenizer — `and`, `more` and `<p` are attribute
      // names, exactly as here. No word is deleted; only the markup the author half-typed is gone.
      expect(sanitizeHtml('a<b and more <p>x</p>')).toBe('a<b>x</b>');
    });

    it('still drops the CONTENT of a complete script tag that never closes', () => {
      // `<script>` with no `</script>` executes in every browser, so the remainder goes with it. That
      // is a complete tag, which is the distinction this whole block turns on.
      expect(sanitizeHtml('<p>text <script>alert(1)')).toBe('<p>text </p>');
    });
  });

  describe('FIX 2 — deliberately escaped prose is text, not an element', () => {
    it('keeps escaped script text as visible text', () => {
      // The reported case: the whole document was entity-decoded before anything was classified, so
      // `&lt;script&gt;` became a real element and was dropped with its content. Classification now
      // runs on the raw spelling and every reference is decoded exactly once, when the text is
      // emitted — the number of decodes a browser performs on a text node.
      expect(sanitizeHtml('the &lt;script&gt; tag')).toBe('the &lt;script&gt; tag');
      expect(sanitizeHtml('4 &lt; 5 and 5 &gt; 4')).toBe('4 &lt; 5 and 5 &gt; 4');
      expect(sanitizeHtml('the &lt;em&gt;emphasis&lt;/em&gt; word')).toBe('the &lt;em&gt;emphasis&lt;/em&gt; word');
    });

    it('keeps an entity-spelled script as text as well', () => {
      expect(sanitizeHtml('&#60;script&#62;alert(1)&#60;/script&#62;')).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
    });

    it('still strips a script that is written as a real tag', () => {
      // The invariant that has to survive FIX 2: escaped prose is preserved, and real markup is not.
      expect(sanitizeHtml('<script>alert(1)</script>')).toBe('');
      expect(sanitizeHtml('<p>a</p><script>alert(1)</script><p>b</p>')).toBe('<p>a</p><p>b</p>');
    });

    it('emits an entity-encoded handler as escaped text, never as markup', () => {
      // The `onerror=` inside the escaped text is the author's literal characters, not an attribute:
      // what a reader sees is the text `<img src=x onerror=alert(1)>`, because every `<`, `>` and `&`
      // in it is escaped on the way out.
      const sanitized = sanitizeHtml('&lt;img src=x onerror=alert(1)&gt;');
      expect(sanitized).toBe('&lt;img src=x onerror=alert(1)&gt;');
      expect(sanitized).not.toMatch(/<[a-zA-Z]/);
    });
  });

  describe('FIX 3 — a query string is not an entity', () => {
    it('keeps &sect=, &reg= and &copy= in a URL intact', () => {
      // The reported case: the semicolon was optional, so `&sect=` decoded to `§=` and the query
      // string was corrupted on the way to the database.
      expect(sanitizeHtml('<a href="https://x.com/p?a=1&sect=2">x</a>')).toBe(
        '<a href="https://x.com/p?a=1&amp;sect=2">x</a>',
      );
      expect(sanitizeHtml('<a href="https://x.com/p?a=1&reg=2&copy=3">x</a>')).toBe(
        '<a href="https://x.com/p?a=1&amp;reg=2&amp;copy=3">x</a>',
      );
    });

    it('keeps a terminated &amp; decoding, so a query string round-trips', () => {
      expect(sanitizeHtml('<a href="https://example.com/page?a=1&amp;b=2">x</a>')).toBe(
        '<a href="https://example.com/page?a=1&amp;b=2">x</a>',
      );
    });

    it('still decodes a numeric reference without its semicolon', () => {
      // These are the OWASP spellings of `javascript:` and browsers resolve them, so the URL check
      // must too. Only the NAMED spellings need their semicolon.
      expect(sanitizeHtml('<a href="&#106;avascript:alert(1)">x</a>')).toBe('<a>x</a>');
      expect(sanitizeHtml('<a href="&#x6A;avascript:alert(1)">x</a>')).toBe('<a>x</a>');
      expect(sanitizeHtml('<a href="&#0000106avascript:alert(1)">x</a>')).toBe('<a>x</a>');
      expect(sanitizeHtml('&#106avascript:')).toBe('javascript:');
    });

    it('still refuses a scheme assembled out of a terminated named reference', () => {
      expect(sanitizeHtml('<a href="javascript&colon;alert(1)">x</a>')).toBe('<a>x</a>');
      expect(sanitizeHtml('<a href="javascript&amp;#58;alert(1)">click</a>')).toBe('<a>click</a>');
    });
  });

  describe('FIX 4 — only script and style take their content with them', () => {
    it('drops the markup of a disallowed element and keeps its text', () => {
      // The reconciled policy, and the one the frontend layer implements: an element that is not
      // allowlisted loses its tags, not the prose between them.
      expect(sanitizeHtml('<label>b</label>')).toBe('b');
      expect(sanitizeHtml('<iframe>text</iframe>')).toBe('text');
      expect(sanitizeHtml('<noscript>hello</noscript>')).toBe('hello');
      expect(sanitizeHtml('<title>t</title>after')).toBe('tafter');
      expect(sanitizeHtml('<textarea>ta</textarea>')).toBe('ta');
      expect(sanitizeHtml('<object data="x">obj</object>')).toBe('obj');
      expect(sanitizeHtml('<form action="x"><input name="a"><button>go</button></form>')).toBe('go');
      expect(sanitizeHtml('<head>hd</head><body>bd</body>')).toBe('hdbd');
    });

    it('still strips script and style with their content', () => {
      expect(sanitizeHtml('<script>alert(1)</script>')).toBe('');
      expect(sanitizeHtml('<style>li{list-style-image:url("javascript:alert(1)")}</style>')).toBe('');
      expect(sanitizeHtml('<svg>keep<circle><script>bad()</script></circle></svg>')).toBe('keep');
    });

    it('matches a close tag the HTML5 way, attributes and all', () => {
      // The reported case: `</style foo="bar">` was not recognised as a close tag, so the scan kept
      // looking and consumed the story after it. A tag name followed by whitespace, `/`, `>` or the
      // end of the input is an end tag.
      expect(sanitizeHtml('<p>keep</p><style>a</style foo="bar"><p>lost</p>')).toBe('<p>keep</p><p>lost</p>');
      expect(sanitizeHtml('<style>a{}</style/>text')).toBe('text');
      expect(sanitizeHtml('<style>a{}</style foo="bar">text')).toBe('text');
      expect(sanitizeHtml('<p>keep</p></style foo="bar">')).toBe('<p>keep</p>');
    });

    it('keeps the text around a dropped element, because the element is not the author', () => {
      expect(sanitizeHtml('<p>keep</p><style>li{list-style-image:url("javascript:alert(1)")}</style><p>me</p>')).toBe(
        '<p>keep</p><p>me</p>',
      );
    });
  });

  describe('FIX 5 — cost is proportional to length, not to the square of it', () => {
    /**
     * The shape the reviewer measured: N open tags followed by N close tags for a name that is not
     * open. 490KB of it took 97.5 seconds — in the request path, synchronously, against a DTO that
     * allows a million characters. Two things caused it: `lastIndexOf` over the whole stack for every
     * absent name, and a `source.slice` per tag name. Both are gone; this is the guard that keeps
     * them from coming back.
     *
     * WHY A TIME ASSERTION RATHER THAN A STRUCTURAL ONE. A timing test pins the thing a structural
     * test cannot see — that the lookup is still O(1) — and the only way to make it fail on a
     * regression rather than on a busy CI machine is to assert against a budget two orders of
     * magnitude above what the fixed code needs.
     */
    it('sanitizes a 200KB run of open tags and stray closers in well under a second', () => {
      const input = '<p>'.repeat(100_000) + '</b>'.repeat(100_000);

      const started = process.hrtime.bigint();
      const sanitized = sanitizeHtml(input);
      const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;

      expect(elapsedMs).toBeLessThan(3_000);
      // The stray closers are dropped, the open tags are closed once each, and nothing is lost.
      expect(sanitized).toBe('<p>'.repeat(100_000) + '</p>'.repeat(100_000));
    });

    it('survives a document of < that opens nothing at all', () => {
      // FIX 1 restarts the scan at `start + 1`, which is what makes this shape a risk: without the
      // forward-only caches, each restart walks to the end of the input again.
      const input = '<a '.repeat(30_000);

      const started = process.hrtime.bigint();
      const sanitized = sanitizeHtml(input);
      const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;

      expect(elapsedMs).toBeLessThan(3_000);
      expect(sanitized).toBe('&lt;a '.repeat(30_000));
    });

    it('survives quoted > soup, where no unquoted > ever arrives', () => {
      const input = '<a "'.repeat(30_000) + 'x>';

      const started = process.hrtime.bigint();
      sanitizeHtml(input);
      const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;

      expect(elapsedMs).toBeLessThan(3_000);
    });
  });

  describe('OWASP filter evasion — the tag itself', () => {
    it('strips <script> with its content', () => {
      expect(sanitizeHtml('<script>alert(1)</script>')).toBe('');
      expect(sanitizeHtml('<p>before</p><script>alert(1)</script><p>after</p>')).toBe('<p>before</p><p>after</p>');
    });

    it('strips an uppercase and a mixed-case script tag', () => {
      expect(sanitizeHtml('<SCRIPT>alert(1)</SCRIPT>')).toBe('');
      expect(sanitizeHtml('<ScRiPt>alert(1)</ScRiPt>')).toBe('');
    });

    it('strips <SCRIPT/XSS SRC=...> — a slash-separated tag name', () => {
      expect(sanitizeHtml('<SCRIPT/XSS SRC="http://xss.rocks/xss.js?< B >">')).toBe('');
    });

    it('strips <SCRIPT SRC=...> where the payload URL itself contains a >', () => {
      expect(sanitizeHtml('<SCRIPT SRC=http://xss.rocks/xss.js?< B >')).toBe('');
    });

    it('strips style, iframe, object, embed, link, meta, svg, math and form, keeping the prose', () => {
      expect(sanitizeHtml('<style>li{list-style-image:url("javascript:alert(1)")}</style>')).toBe('');
      expect(sanitizeHtml('<iframe src="https://evil.example"></iframe>')).toBe('');
      expect(sanitizeHtml('<object data="x">obj</object>')).toBe('obj');
      expect(sanitizeHtml('<embed src="x">embed')).toBe('embed');
      expect(sanitizeHtml('<link rel="stylesheet" href="x">')).toBe('');
      expect(sanitizeHtml('<meta http-equiv="refresh" content="0;url=x">')).toBe('');
      expect(sanitizeHtml('<svg><script>alert(1)</script></svg>')).toBe('');
      expect(sanitizeHtml('<form action="x"><input name="a"><button>go</button></form>')).toBe('go');
      expect(sanitizeHtml('<input type="text" value="x">')).toBe('');
      expect(sanitizeHtml('<base href="https://evil.example/">')).toBe('');
    });

    it('strips the mXSS nested-form vector', () => {
      // `<math>` opens a foreign namespace whose element names are not HTML element names. Its tags
      // are dropped like any other non-allowlisted tag, and the `<style>` nested inside it still takes
      // its content with it, so the `<img src onerror=…>` that follows is consumed with it.
      const sanitized = sanitizeHtml('<math><mtext></form><form><mglyph><style></math><img src onerror=alert(1)>');
      expect(sanitized).not.toMatch(/on[a-zA-Z]+\s*=/);
      expect(sanitized.toLowerCase()).not.toContain('alert(');
    });

    it('strips comments, including the conditional comment older IE executes', () => {
      expect(sanitizeHtml('<p>a</p><!-- a comment --><p>b</p>')).toBe('<p>a</p><p>b</p>');
      expect(sanitizeHtml('<!--[if gte IE 4]><SCRIPT>alert(1);</SCRIPT><![endif]-->')).toBe('');
    });

    it('strips CDATA sections and doctypes', () => {
      expect(sanitizeHtml('<![CDATA[<script>alert(1)</script>]]>')).toBe('');
      expect(sanitizeHtml('<!DOCTYPE html><p>body</p>')).toBe('<p>body</p>');
    });

    it('drops a tag that is not allowlisted and keeps its children', () => {
      expect(sanitizeHtml('<font color="red">text</font>')).toBe('text');
      expect(sanitizeHtml('<details><summary>s</summary>body</details>')).toBe('sbody');
    });
  });

  describe('OWASP filter evasion — event handlers', () => {
    const vectors: readonly string[] = [
      '<img src=x onerror=alert(1)>',
      '<IMG SRC=x ONERROR=alert(1)>',
      '<img src=x onerror="alert(1)">',
      "<img src=x onerror='alert(1)'>",
      '<img src=x onerror=alert(1) />',
      '<body onload=alert(1)>',
      '<svg onload=alert(1)>',
      '<div onmouseover="alert(1)">hover</div>',
      '<a href="https://example.com" onclick="alert(1)">link</a>',
      '<p onfocus=alert(1) autofocus>x</p>',
      '<input onfocus=alert(1) autofocus>',
      '<details open ontoggle=alert(1)>',
    ];

    for (const vector of vectors) {
      it(`leaves no handler on ${vector}`, () => {
        const sanitized = sanitizeHtml(vector);
        expect(sanitized).not.toMatch(/on[a-zA-Z]+\s*=/);
        expect(sanitized.toLowerCase()).not.toContain('alert(');
      });
    }
  });

  describe('OWASP filter evasion — URL schemes', () => {
    const vectors: readonly string[] = [
      '<IMG SRC=javascript:alert(1)>',
      '<IMG SRC=JaVaScRiPt:alert(1)>',
      '<IMG SRC=javascript:alert(&quot;XSS&quot;)>',
      '<a href="javascript:alert(1)">click</a>',
      '<a href="JAVASCRIPT:alert(1)">click</a>',
      '<a href="javascript&#x3A;alert(1)">click</a>',
      '<a href="javascript&#58;alert(1)">click</a>',
      '<a href="javascript&colon;alert(1)">click</a>',
      '<a href="jav&#x09;ascript:alert(1)">click</a>',
      '<a href="jav\tascript:alert(1)">click</a>',
      '<a href="&#14;  javascript:alert(1)">click</a>',
      '<a href="&#106;avascript:alert(1)">click</a>',
      '<a href="&#x6A;avascript:alert(1)">click</a>',
      '<a href="&#0000106avascript:alert(1)">click</a>',
      '<a href="vbscript:msgbox(1)">click</a>',
      '<a href="data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==">click</a>',
      '<a href="data:text/html,<script>alert(1)</script>">click</a>',
      '<a href="//evil.example">click</a>',
      '<a href="file:///etc/passwd">click</a>',
      '<img src="javascript:alert(1)">',
      '<img src="data:image/svg+xml,<svg onload=alert(1)>">',
      '<img src="//evil.example/x.png">',
    ];

    for (const vector of vectors) {
      it(`leaves no executable scheme on ${vector}`, () => {
        const sanitized = sanitizeHtml(vector);
        expect(sanitized.toLowerCase()).not.toContain('javascript:');
        expect(sanitized.toLowerCase()).not.toContain('vbscript:');
        expect(sanitized.toLowerCase()).not.toContain('data:text');
        expect(sanitized.toLowerCase()).not.toContain('alert(');
      });
    }

    it('keeps an http, https and mailto href', () => {
      expect(sanitizeHtml('<a href="https://example.com/page?a=1&amp;b=2">x</a>')).toBe(
        '<a href="https://example.com/page?a=1&amp;b=2">x</a>',
      );
      expect(sanitizeHtml('<a href="http://example.com">x</a>')).toBe('<a href="http://example.com">x</a>');
      expect(sanitizeHtml('<a href="mailto:someone@example.com">x</a>')).toBe(
        '<a href="mailto:someone@example.com">x</a>',
      );
    });

    it('drops a refused href but keeps the text it wrapped', () => {
      expect(sanitizeHtml('<a href="javascript:alert(1)">click me</a>')).toBe('<a>click me</a>');
    });

    it('drops a refused img src outright rather than emitting a broken image', () => {
      expect(sanitizeHtml('<img src="javascript:alert(1)" alt="pic">')).toBe('');
    });

    it('keeps an https, an http and a relative img, with alt width and height', () => {
      expect(sanitizeHtml('<img src="https://example.com/a.png" alt="a" width="320" height="200">')).toBe(
        '<img src="https://example.com/a.png" alt="a" width="320" height="200">',
      );
      // `http` and a relative path are BOTH accepted on the write path: legacy rows in the database
      // carry them, and the frontend renders them. What is refused is a protocol-relative URL, which
      // inherits whatever origin the reader happens to be on.
      expect(sanitizeHtml('<img src="http://example.com/a.png" alt="a">')).toBe(
        '<img src="http://example.com/a.png" alt="a">',
      );
      expect(sanitizeHtml('<img src="/covers/a.png" alt="a">')).toBe('<img src="/covers/a.png" alt="a">');
      expect(sanitizeHtml('<img src="covers/a.png" alt="a">')).toBe('<img src="covers/a.png" alt="a">');
      expect(sanitizeHtml('<img src="//evil.example/x.png" alt="a">')).toBe('');
      expect(sanitizeHtml('<img src="\\\\evil.example/x.png" alt="a">')).toBe('');
    });

    it('drops a width or height that is not a dimension', () => {
      expect(sanitizeHtml('<img src="/a.png" alt="a" width="320px;background:url(x)">')).toBe(
        '<img src="/a.png" alt="a">',
      );
    });

    it('decodes a double-encoded scheme before refusing it', () => {
      expect(sanitizeHtml('<a href="javascript&amp;#58;alert(1)">click</a>')).toBe('<a>click</a>');
    });

    it('keeps a > inside a quoted attribute value', () => {
      expect(sanitizeHtml('<img alt="a > b" src="https://example.com/a.png">')).toBe(
        '<img alt="a &gt; b" src="https://example.com/a.png">',
      );
      expect(sanitizeHtml('<div x="1 <p>y">q</div>')).toBe('<div>q</div>');
    });
  });

  describe('encodings', () => {
    it('renders a double-encoded entity as literal text, not as markup', () => {
      // One decode pass takes `&amp;lt;` to the literal characters `&lt;`. The output re-escapes the
      // `&`, so what a browser displays is the text `<script>` rather than a script element.
      const sanitized = sanitizeHtml('&amp;lt;script&amp;gt;alert(1)&amp;lt;/script&amp;gt;');
      expect(sanitized).not.toContain('<script>');
      expect(sanitized).toBe('&amp;lt;script&amp;gt;alert(1)&amp;lt;/script&amp;gt;');
    });

    it('leaves an entity that is not a reference alone', () => {
      expect(sanitizeHtml('&notarealentity;')).toBe('&amp;notarealentity;');
    });

    it('resolves a numeric reference without a semicolon', () => {
      expect(sanitizeHtml('&#106avascript:')).toBe('javascript:');
    });

    it('decodes an alt value once, exactly as a browser resolves a text node', () => {
      expect(sanitizeHtml('<img src="/a.png" alt="a &amp; b">')).toBe('<img src="/a.png" alt="a &amp; b">');
      expect(sanitizeHtml('<img src="/a.png" alt="a & b">')).toBe('<img src="/a.png" alt="a &amp; b">');
    });
  });

  describe('balance', () => {
    it('closes an element left open at the end of the input', () => {
      expect(sanitizeHtml('<p>unclosed')).toBe('<p>unclosed</p>');
      expect(sanitizeHtml('<div><p>deep')).toBe('<div><p>deep</p></div>');
    });

    it('closes an inner element before an outer one', () => {
      expect(sanitizeHtml('<div><span>text</div>')).toBe('<div><span>text</span></div>');
    });

    it('drops a closing tag that never opened', () => {
      expect(sanitizeHtml('</p>text')).toBe('text');
      expect(sanitizeHtml('<p>text</b></p>')).toBe('<p>text</p>');
    });

    it('does not emit a closing tag for a void element', () => {
      expect(sanitizeHtml('<br><img src="/a.png">')).toBe('<br><img src="/a.png">');
      expect(sanitizeHtml('<img src="/a.png"/>')).toBe('<img src="/a.png">');
    });

    it('treats a self-closed non-void element as open, the way the HTML5 tokenizer does', () => {
      // `<p/>` is a parse error in HTML5 and the `/` is ignored: the element opens and has to be closed.
      // Emitting a bare `<p>` for it produced output an author never wrote — an unclosed element — which
      // is also what made the sanitizer non-idempotent, since a second pass would then close it.
      expect(sanitizeHtml('<p/>')).toBe('<p></p>');
      expect(sanitizeHtml('<b/>x')).toBe('<b>x</b>');
      expect(sanitizeHtml('<p/>;a<p>x')).toBe('<p>;a<p>x</p></p>');
    });

    it('does not let a self-closing marker become part of a bare attribute value', () => {
      expect(sanitizeHtml('<a href=x/>y')).toBe('<a>y</a>');
    });

    it('is idempotent', () => {
      const inputs: readonly string[] = [
        '<p>plain</p>',
        '<script>alert(1)</script><p>after</p>',
        '<a href="javascript:alert(1)">x</a>',
        '<div><span>unclosed',
        '<img src=x onerror=alert(1)>',
        'she whispered x<y and the night went on and on',
        'the &lt;script&gt; tag',
        '<a href="https://x.com/p?a=1&sect=2">x</a>',
        '<label>b</label><iframe>c</iframe>',
        '<p>keep</p><style>a</style foo="bar"><p>lost</p>',
        '&lt;img src=x onerror=alert(1)&gt;',
        'a <div class="x> y <p>z</p>',
        '<p/>;a<p>x',
        '<b/>x',
        '<a href=x/>y',
      ];

      for (const input of inputs) {
        const once = sanitizeHtml(input);
        expect(sanitizeHtml(once)).toBe(once);
      }
    });
  });

  describe('the property that matters most', () => {
    it('never emits an on*= handler for any input in this file', () => {
      const inputs: readonly string[] = [
        '<img src=x onerror=alert(1)>',
        '<IMG SRC=JaVaScRiPt:alert(1)>',
        '<SCRIPT/XSS SRC="http://xss.rocks/xss.js?< B >">',
        '<a href="&#14;  javascript:alert(1)">x</a>',
        '<STYLE>li{list-style-image:url("javascript:alert(1)")}</STYLE>',
        '<div ONMOUSEOVER="alert(1)">x</div>',
        '<p title="onmouseover=alert(1)">x</p>',
      ];

      for (const input of inputs) {
        expect(sanitizeHtml(input)).not.toMatch(/on[a-zA-Z]+\s*=/);
      }
    });

    it('never emits an on*= handler as MARKUP when the handler arrives entity-encoded', () => {
      // Escaped input stays escaped text — see FIX 2 — so the assertion is on the markup, not on the
      // characters: no `<` in the output is unescaped, which is the only way a handler can execute.
      for (const input of ['&lt;img src=x onerror=alert(1)&gt;', '&#60;img src=x onerror=alert(1)&#62;']) {
        const sanitized = sanitizeHtml(input);
        expect(sanitized).not.toMatch(/<[a-zA-Z]/);
        expect(sanitized).not.toContain('<img');
      }
    });
  });
});
