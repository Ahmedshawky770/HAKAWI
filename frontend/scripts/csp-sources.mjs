/**
 * Reading a Content-Security-Policy's source expressions.
 *
 * WHY THIS IS A MODULE AND NOT PART OF `verify-csp.mjs`. The parser here decides whether a
 * policy the BROWSER will serve is one the browser can actually read, and the two ways it can
 * be wrong are opposites: a source that looks fine and does not parse (the policy that reaches
 * the page is narrower than the one that was written), and a source that parses and is refused
 * because the parser is stricter than the browser (a build that fails for no reason). A parser
 * with no test is a coin flip between those, so the parser is here, with tests beside it.
 *
 * THE GRAMMAR BEING ENFORCED. CSP3 §2.3.1 — a host-source is
 * `[ scheme "://" ] host [ port ] [ path ]`, and the host is
 * `host-part = "*" / [ "*." ] 1*host-char *( "." 1*host-char )`. The rule that matters in
 * practice is that a WILDCARD MAY STAND FOR THE LEFTMOST LABEL AND FOR NOTHING ELSE: every
 * other label is a plain hostname label. `https://*.s3.*.amazonaws.com` is therefore not a
 * wildcard expression at all — the second `*` is not a wildcard — and a browser refuses the
 * whole source with "Content-Security-Policy: Couldn't parse invalid host" and drops it.
 *
 * THE RULES ARE THE BROWSER'S, NOT THE SPECIFICATION'S ALONE. A parser that is stricter
 * than the browser fails builds for no reason, and a parser that is laxer than the browser
 * misses the class of mistake it exists to catch. So each rule below is the one Chrome,
 * Firefox and Safari apply — a wildcard port is legal, a trailing dot is legal, a label
 * may begin with a dash, and a bracketed IPv6 literal is not.
 */

/**
 * The directives whose value is a SOURCE LIST, and therefore the ones whose
 * tokens are read as sources.
 *
 * `report-uri` and `report-to` are excluded: they take a URI and a report-group
 * name rather than a source list, so reading their tokens as host sources would
 * report a perfectly good reporting endpoint as a broken one.
 *
 * `trusted-types` and `require-trusted-types-for` are excluded for a different
 * reason: they take the NAMES of Trusted Types policies, not sources. A policy
 * named `my_policy` is legal, and reading it as a host source would report a
 * working policy as a broken one — and would fail the build over it.
 */
export const SOURCE_LIST_DIRECTIVES = [
  "default-src",
  "script-src",
  "script-src-elem",
  "script-src-attr",
  "style-src",
  "style-src-elem",
  "style-src-attr",
  "img-src",
  "connect-src",
  "font-src",
  "frame-src",
  "media-src",
  "worker-src",
  "child-src",
  "object-src",
  "manifest-src",
  "prefetch-src",
  "fenced-frame-src",
  "base-uri",
  "form-action",
  "frame-ancestors",
  "navigate-to",
];

/**
 * A hostname label: letters, digits and dashes.
 *
 * The browser does not require a label to start or end with a letter or a digit —
 * it requires every CHARACTER of the label to be one — so a label that starts with a
 * dash is accepted by Chrome and refused here. A parser that is stricter than the
 * browser fails builds for no reason, which is the other way this parser can be
 * wrong.
 */
const HOST_LABEL = /^[A-Za-z0-9-]+$/;

/**
 * The scheme of a host source: a letter, then letters, digits, `+`, `-` or `.`.
 *
 * The scheme is part of the source, and a browser that cannot read it drops the
 * whole source — so a source whose scheme is missing or malformed has to be
 * reported here too.
 */
const SCHEME = /^[A-Za-z][A-Za-z0-9+.-]*$/;

/**
 * The directive name of one `;`-separated CSP directive, or null if the chunk
 * carries no name (an empty or malformed chunk). Whitespace-separated and
 * anchored, so `script-src` does not match `script-src-elem` and vice versa.
 */
export function directiveName(directive) {
  const match = /^([a-zA-Z0-9-]+?)(?:\s+|$)/.exec(directive);
  // LOWER-CASED, because a browser does not distinguish `SCRIPT-SRC` from
  // `script-src`: Chrome's directive lookup is case-insensitive, so a policy that
  // names a directive in capitals is a policy the browser HONOURS — and a check
  // that read it as a different directive would report a policy that allows `eval`
  // as one that blocks it.
  return match === null ? null : match[1].toLowerCase();
}

/**
 * One CSP source-list token with its quoting removed, so the keyword
 * `'unsafe-eval'` compares as `unsafe-eval`. A token that is not quoted is
 * returned unchanged (a `*.example.com` host stays a host).
 */
export function stripQuotes(token) {
  return token.length >= 2 && token.startsWith("'") && token.endsWith("'") ? token.slice(1, -1) : token;
}

/**
 * The source-list tokens of one directive in one policy, quotes stripped so
 * `'unsafe-eval'` compares as `unsafe-eval`. Returns `null` when the policy does
 * not carry that directive at all, and an EMPTY array when it carries it with no
 * source list (`script-src` alone means "block every script"), which are
 * different answers for a fallback chain.
 */
export function directiveTokens(policy, name) {
  const directive = String(policy)
    .split(";")
    .map((chunk) => chunk.trim())
    .find((chunk) => directiveName(chunk) === name);

  if (directive === undefined) {
    return null;
  }

  return directive.split(/\s+/).slice(1).map(stripQuotes);
}

/**
 * Whether a source-list token is a host source, a scheme source or a keyword.
 *
 * The three are told apart by shape, because each has a different grammar and a
 * different way of being wrong:
 *
 * - A KEYWORD is quoted: `'self'`, `'unsafe-inline'`, `'nonce-…'`, `'sha256-…'`.
 * - A SCHEME SOURCE is a bare scheme with a colon and no `//`: `https:`, `data:`.
 * - A HOST SOURCE is anything else: `example.com`, `*.example.com`,
 *   `https://example.com:8443/path`.
 *
 * A bare `*` is a host source whose host is the single wildcard label.
 */
export function classifySource(token) {
  if (token.startsWith("'") && token.endsWith("'") && token.length >= 2) {
    return "keyword";
  }

  if (/^[A-Za-z][A-Za-z0-9+.-]*:$/.test(token)) {
    return "scheme";
  }

  return "host";
}

/**
 * The reason a host source does not parse, or null when it does.
 *
 * The scheme and the path are checked too, but only for SHAPE: a policy that
 * names a host the deployment does not own is a configuration question and not a
 * parse question, and this is about the second.
 *
 * WHAT THE BROWSER ACTUALLY ACCEPTS, AND WHY THIS MIRRORS IT:
 *
 * - a port is digits or `*` (`port-part = 1*DIGIT / "*"`), so `example.com:*`
 *   is a legal source and a wildcard port is how a source says "any port";
 * - a host may end in a dot, because a fully qualified name may;
 * - a label may begin or end with a dash, because the browser checks the
 *   CHARACTERS of a label and not its ends;
 * - an IPv6 literal in brackets is NOT accepted: the browser's host parser
 *   reads `[` and `]` as characters a label may not carry, and CSP has no
 *   bracketed-host form to fall back on.
 */
export function hostSourceProblem(token) {
  if (classifySource(token) !== "host") {
    // A keyword or a scheme source is a legal thing to find in a source list, and
    // this function is about HOST sources. Reading a scheme as a host would report
    // `https:` as a broken hostname.
    return null;
  }

  let rest = token;

  if (rest.includes("://")) {
    const scheme = rest.slice(0, rest.indexOf("://"));
    if (!SCHEME.test(scheme)) {
      return `'${scheme}' is not a scheme`;
    }
    rest = rest.slice(rest.indexOf("://") + 3);
  }

  const slash = rest.indexOf("/");
  const hostAndPort = slash === -1 ? rest : rest.slice(0, slash);
  const path = slash === -1 ? "" : rest.slice(slash);

  if (path.length > 0 && !path.startsWith("/")) {
    return "the path must start with '/'";
  }

  if (hostAndPort.startsWith("[") || hostAndPort.endsWith("]")) {
    return "an IPv6 literal is not a host source a browser can read";
  }

  let host = hostAndPort;
  const portSeparator = hostAndPort.lastIndexOf(":");
  if (portSeparator !== -1) {
    host = hostAndPort.slice(0, portSeparator);
    const port = hostAndPort.slice(portSeparator + 1);
    if (port !== "*" && !/^\d+$/.test(port)) {
      return `the port '${port}' is not a number`;
    }
  }

  if (host.length === 0) {
    return "the host is empty";
  }

  const labels = host.split(".");

  for (let index = 0; index < labels.length; index += 1) {
    const label = labels[index];

    if (label === "*") {
      if (index !== 0) {
        return "'*' is not a valid label here: a CSP host source may carry a wildcard in its leftmost label only";
      }
      continue;
    }

    if (label.length === 0) {
      // The only empty label a browser accepts is the trailing dot of a fully
      // qualified name, and it may only be the last one.
      if (index === labels.length - 1) continue;
      return "an empty label is not a hostname label";
    }

    if (!HOST_LABEL.test(label)) {
      return `'${label}' is not a valid hostname label`;
    }
  }

  return null;
}

/**
 * The directives in `policy` whose source list carries a token that does not
 * parse, with the reason for each.
 *
 * The RAW token decides the shape: a keyword is quoted, and the quotes are what
 * tell it apart from a host that happens to be spelled `self`.
 */
export function unparseableSources(policy) {
  const problems = [];

  for (const chunk of String(policy).split(";")) {
    const trimmed = chunk.trim();
    const name = directiveName(trimmed);
    if (name === null || !SOURCE_LIST_DIRECTIVES.includes(name)) {
      continue;
    }

    for (const token of trimmed.split(/\s+/).slice(1)) {
      if (token.length === 0) {
        continue;
      }

      if (classifySource(token) !== "host") {
        continue;
      }

      const problem = hostSourceProblem(token);
      if (problem !== null) {
        problems.push(`${name}: '${token}' — ${problem}`);
      }
    }
  }

  return problems;
}
