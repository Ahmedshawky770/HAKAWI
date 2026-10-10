# `common/waf` and the WAF middleware — layer 2 of the proactive defence stack

The WAF sits **behind** rate limiting and **in front of** input validation (Principle #15).
Two things in it were capable of taking the whole service down while looking correct, and
two were capable of being turned off by a single environment variable. Both classes of
problem are documented here, in the config, and in the code.

---

## The forwarding-header rule is opt-in, and why it cannot be otherwise

`header-forbidden-forwarding-headers` rejects any request carrying `X-Forwarded-Host`,
`X-Original-URL`, `X-Rewrite-URL`, `X-Originating-IP`, `X-Custom-IP-Authorization` or
`X-Forwarded-Server`.

**The intent is sound**: those headers are only trustworthy when a reverse proxy overwrites
them, and a public client that supplies them can bypass route authorization, poison
password-reset links and forge audit logs.

**It cannot be active by default**: those six names are _exactly_ what a reverse proxy or
load balancer emits, and the WAF has no way to tell a header the ingress added from one a
client forged. With `WAF_BLOCK_SEVERITY=high` (the default) it 403'd **every** request
behind any proxy and incremented the per-IP violation counter toward a temporary and then a
permanent block. A proxied deployment locked itself out.

So it is declared with `optInControl: 'blockForwardingHeaders'` and is inert until an
operator decides:

| Deployment                                      | Setting                             |
| ----------------------------------------------- | ----------------------------------- |
| direct to the internet                          | `WAF_BLOCK_FORWARDING_HEADERS=true` |
| behind an ingress that **strips** these headers | `WAF_BLOCK_FORWARDING_HEADERS=true` |
| behind a proxy that **forwards** them           | leave it **off**                    |

The mechanism is declarative, not a special case in the middleware: a rule with an
`optInControl` fires only when that control appears in `WafConfig.enabledOptInControls`.
Adding a second opt-in rule means adding a name to `WAF_OPT_IN_CONTROLS`, not touching
evaluation logic (Principle #8).

---

## The client address is not trusted by default, and the flag is shared with the limiter

`resolveClientIp(req, trustProxy)` returns `{ ip, source, trustProxy }`.

Before this change it was `req.ip ?? req.socket?.remoteAddress` with no condition. That is
only safe while nothing calls `app.set('trust proxy', true)`: Express then derives `req.ip`
from `X-Forwarded-For`, a header any client can set, so a forged value would let an
attacker walk straight through the blocklist — a fresh address per request, never a
violation, never blocked.

Both the WAF and the throttle tracker key on an address. If they disagreed about whether
that address is forgeable, one of the two protections would be bypassable. So there is
**one** flag, `THROTTLE_TRUST_PROXY`, read by both, and `app.set('trust proxy', …)` is
deliberately **not** called anywhere (`main.ts` says so at the call site). The consequence
is stated rather than assumed:

> Behind a reverse proxy with `THROTTLE_TRUST_PROXY=false`, every request keys on the
> proxy's address. One shared rate-limit budget, one shared blocklist entry. That is the
> safe direction, but it is not per-client.

---

## Fail-open is a deliberate trade-off, and it is never silent

`WAF_FAIL_MODE` defaults to `'open'`. That is not an oversight: a WAF that fails closed on
a Valkey outage takes the whole API down with it. The cost:

| Degraded               | Consequence                                                               |
| ---------------------- | ------------------------------------------------------------------------- |
| blocklist lookup fails | no IP is blocked                                                          |
| violation write fails  | the temporary/permanent escalation ladder stops advancing for that caller |

`IpBlocklistService.recordViolation` returns `0` on failure, which is indistinguishable
from "counted nothing" to a caller that does not read logs. `WafMiddleware` therefore
treats a falsy count and a falsy `block()` result as a degradation and announces it.

`DegradationTracker` (`common/observability/degradation.ts`) emits **one WARN per episode**,
carrying a `degradationId` that is repeated on every later line, plus one INFO on recovery,
and exposes a snapshot. `GET /api/v1/metrics/degradation` serves the same state. Alert on
either.

The default is unchanged on purpose — the point of the fix was to make the risk visible and
alertable, not to silently flip a production default.

---

## `WAF_BLOCKED_COUNTRIES` is reserved, not a control

Geo-blocking is not implemented: there is no GeoIP source, no country matching, and no
code path reads the list. The value is still parsed — so an existing deployment setting it
is not silently discarded — and the field is named `reservedBlockedCountries` so it cannot
be read as something that is on. Setting it has no effect on any request.

---

## Known limits, recorded rather than hidden

These are the things the rules do **not** do. They are written down because a security
control that is quietly incomplete is worse than one that is absent.

### The SSRF rules match host *shapes*, they are not a URL parser

`ssrf-private-network` and `ssrf-encoded-host` cover RFC1918, loopback, link-local
`169.254/16`, CGNAT `100.64/10`, IPv6 loopback, IPv6 ULA `fc00::/7`, IPv6 link-local,
IPv4-mapped IPv6 loopback, the inet_aton short forms, and the decimal / hex / octal integer
encodings of `127.0.0.1`.

A **mixed** form such as `http://0x7f.0x0.0x0.0x1/` is not matched. Enumerating every
per-octet encoding inside a regex is not a finite exercise, and pretending otherwise would
make the rule look stronger than it is.

The durable fix is to normalise the host with `new URL(...).hostname` before the rules run,
which yields a canonical form once instead of guessing at encodings forever. That is not
built. Hakawi has **no user-supplied URL fetch sink** today — `fetchJson`'s only callers are
the fixed Paymob and OAuth hosts — so the gap is latent rather than live, and it becomes a
real hole the moment someone adds a webhook or a "fetch this image" feature. That change
should add the host-normalisation step in the same commit.

### Detection is not prevention on the body-size rule

`body-size-limit` measures bytes actually received, so a `Transfer-Encoding: chunked` request
can no longer skip it by omitting `Content-Length`. But by the time the WAF runs, the body is
**already in memory**: `express.json` and `express.urlencoded` are mounted first, in
`backend/src/main.ts`.

The control that *prevents* an oversized upload is `express.json({ limit: '10mb' })`, which
aborts the stream mid-upload. `requestSizeLimit` in the same file is a fast reject for the
honest case where a client did send `Content-Length`.

### The forwarding-header rule is opt-in, permanently

`header-forbidden-forwarding-headers` cannot be enabled by default. The WAF has no way to
distinguish a header from a trusted ingress from one a public client sent, and enabling it by
default locked proxied deployments out entirely. `WAF_BLOCK_FORWARDING_HEADERS` is documented
in `.env.example`; until an operator sets it, `X-Original-URL` / `X-Rewrite-URL` route
override and password-reset-link poisoning are not mitigated at this layer.

### The blocklist is soft while Valkey is unavailable

`WAF_FAIL_MODE` defaults to `open`. During an outage: no IP is blocked, no violation is
recorded, no escalation happens. That is the deliberate availability choice (Principle #14),
and it is never silent — the degradation is logged at WARN on every request and is
scrapeable at `GET /api/v1/metrics/degradation`. An operator who wants the opposite sets
`WAF_FAIL_MODE=closed` and accepts that a Valkey outage then takes the API down.

### Cost per request

Roughly 35 rules are evaluated against up to 200 collected values, bounded at 4096
characters each, after the body has been parsed. The patterns use bounded quantifiers and no
catastrophic backtracking was found, but this is a real constant factor on every
unauthenticated request. A blocking violation additionally awaits one or two Valkey
operations per rule that tripped.

---

## File map

| File                                             | Responsibility                                                  |
| ------------------------------------------------ | --------------------------------------------------------------- |
| `rules.ts`                                       | The rule catalogue, including `optInControl` metadata           |
| `ip-blocklist.service.ts`                        | Block records, violation counters, store health                 |
| `headers.ts`                                     | Correlation ids, response headers, the structured violation log |
| `../middleware/waf.middleware.ts`                | Evaluation, blocking, escalation, client-IP resolution          |
| `../../config/waf.config.ts` (repo `src/config`) | Every `WAF_*` switch, plus the shared trust-proxy flag          |
