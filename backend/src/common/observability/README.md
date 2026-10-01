# `common/observability` — what leaves the process, and what state it is in

Two concerns, one module:

1. **Error reporting** (`sentry.config.ts`) — what may leave this process.
2. **Operational signals** (`metrics.controller.ts`, `degradation.ts`) — how a deployment
   finds out that a security control is on its fallback path.

---

## Sentry: nothing that can be a credential leaves the process

`AllExceptionsFilter` captures the full request URL on every 5xx, and the Sentry Node
integration copies `req.originalUrl` into `event.request.url`. For this API that means, on
any unhandled error:

- `GET /api/v1/auth/oauth/google/callback?code=…&state=…` — a single-use OAuth
  authorization code, exchangeable for tokens by whoever reads it first;
- any paging or search query string — user content that the operator's Sentry project has
  no need to hold;
- the day a reset link becomes path-based, the reset token itself.

A Sentry project with read access is a credential store with a UI. So `beforeSend` and
`beforeSendTransaction` both run `scrubSentryEvent`, which:

- strips the **entire query string** — no query parameter in this API is safe for a third
  party, and a key-allowlist is a blocklist the next endpoint will extend;
- redacts credential-named path segments, and the segment after a credential-bearing route
  (`reset`, `verify`, `activate`, `callback`, …);
- drops `request.cookies` and the `cookie` / `authorization` / `x-api-key` headers;
- keeps the rest of the path, so an event still answers _which route broke_;
- replaces an unparseable URL wholesale rather than passing it through, so an
  unrecognised URL shape cannot become an exfiltration channel.

The function is generic over the event type, so it satisfies `beforeSend` (`ErrorEvent`)
and `beforeSendTransaction` (`TransactionEvent`) with no cast and without narrowing `type`:
a transaction must leave as a transaction.

### On `sendDefaultPii: false`

The review asked for it to be set explicitly. **It is not passed**, and the reason is
recorded in `scrubSentryEvent` and asserted in `sentry.config.spec.ts`:

`sendDefaultPii` was a browser-SDK flag, removed in `@sentry/*` v10/v11 in favour of
per-integration options. `NodeOptions` (`@sentry/node/build/types/types.d.ts`) does not
declare it and nothing under `@sentry/**` reads it. Passing it would be dead config that
TypeScript rejects, and a comment claiming a flag was set would be precisely the "false
assurance" this change exists to remove. `@sentry/node` never collected default PII, so the
intent is enforced concretely instead: cookies and credential headers are stripped from
every outgoing event.

---

## `GET /api/v1/metrics/cache` and `GET /api/v1/metrics/degradation`

Both are served by `CacheMetricsController`, declared on `CommonModule`. The cache route
used to be registered on the **raw Express adapter** in `main.ts`, after the WAF
middleware. A handler on the raw adapter is not in the Nest routing tree, so it bypassed
`JwtAuthGuard`, `RolesGuard`, the global `ValidationPipe`, the global
`AllExceptionsFilter`, the `LoggingInterceptor` and the `api/v1` prefix — and answered any
anonymous `GET` with the cache counters.

Both routes are now behind the same chain as every other route, guarded by
`JwtAuthGuard` + `RolesGuard` and requiring the **super-admin** role. It fails closed: no
token is 401, a non-super-admin is 403, and there is no branch that returns a snapshot to
an unverified caller.

### The degradation report is the alert hook

Both security controls degrade rather than fail closed when Valkey is unavailable, on
purpose — an outage must not take the API down. The cost, which used to be invisible:

- `rateLimiter.storage === 'in-memory-fallback'` — the limiter still runs, but counters
  are per process, so a budget is not shared across replicas and the effective limit is
  multiplied by the replica count;
- `wafBlocklist.consecutiveFailures > 0` — with the default `WAF_FAIL_MODE=open`, no IP is
  blocked and no violation is recorded, so temporary and permanent blocks cannot be
  created or escalated at all.

Alert on the single WARN line carrying `degradationId`, or on
`degradation.degradationCount > 0` / `consecutiveFailures > 0` here.
`probed === false` and `wafBlocklist.available === null` mean "not exercised yet", which
is deliberately distinguishable from "exercised and broken".

## File map

| File                    | Responsibility                                               |
| ----------------------- | ------------------------------------------------------------ |
| `sentry.config.ts`      | SDK init, the URL/credential scrubber, exception capture     |
| `degradation.ts`        | One WARN per degradation episode, plus a scrapeable snapshot |
| `metrics.controller.ts` | The two admin-only metric routes                             |
