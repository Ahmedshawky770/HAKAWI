# `common/throttler` — layer 1 of the proactive defence stack

Rate limiting is the **first** line of defence (Principle #15). It is also the layer that
is easiest to get silently wrong, because a mis-wired throttler still _looks_ like a
throttler: the guard runs, headers are set, and the damage is a limit nobody intended.

The four bugs below were all of that kind — present, plausible, and wrong.

---

## 1. An undecorated route must get the `default` tier and nothing else

### What was wrong

`@nestjs/throttler` registers **every** named throttler as simultaneously active and only
skips one when `THROTTLER:SKIP<name>` metadata exists on the handler or controller it is
executing. From `node_modules/@nestjs/throttler/dist/throttler.guard.js`, `canActivate`:

```js
for (const namedThrottler of this.throttlers) {
    const skip = this.reflector.getAllAndOverride(throttler_constants_1.THROTTLER_SKIP + namedThrottler.name, [handler, classRef]);
    const skipIf = namedThrottler.skipIf || this.commonOptions.skipIf;
    if (skip || skipIf?.(context)) { continues.push(true); continue; }
    ...
}
```

Two facts follow from those six lines and they are what the bug rested on:

1. **`skipIf` is called WITHOUT `await`.** A promise-returning predicate is truthy on
   every request and would silently disable the tier it belongs to. Every `skipIf` here is
   therefore synchronous and typed `(context) => boolean`.
2. **Skip metadata can only come from the decorated handler/class.** There is no
   configuration path. So a controller with no `@ThrottleTier(...)` produced no skip
   metadata, all four tiers ran, and the tightest one decided the outcome.

`upload` is 5 requests/minute with a 60-second block. That was the effective limit of
`/stories`, `/users`, `/messages`, `/library`, `/books`, `/rentals`, `/contests` and every
other untiered route. The documented `default` tier (100/min) was **unreachable on any
production route** — it was registered, and nothing could ever be counted against it.

### The fix

Config-driven, not "decorate all ~20 controllers" (Principle #8):

- `FALLBACK_THROTTLE_TIER` in `config/throttle.config.ts` names the tier an undecorated
  route is limited by.
- `buildThrottleTierSkipIf(reflector, tier)` returns the predicate for one registered
  throttler: it enforces that tier only when the tier **is** the route's effective tier.
- `createThrottlerOptions` attaches the predicate to every throttler, so a tier runs only
  when it is selected and the fallback tier is selected when nothing is declared.

No controller had to change, and adding a fifth tier later needs no edits outside
`config/throttle.config.ts`.

### Proving it

`throttle-tier.decorator.spec.ts` drives the **real** `ThrottlerGuard` built by the
**real** `buildThrottleConfig` + `createThrottlerOptions` over `GET /stories`-shaped
contexts:

- an undecorated route records exactly `['default']` in the storage;
- twenty consecutive requests are allowed (the upload tier would have blocked the sixth);
- the hundred-and-first request is the first 429, at the documented limit of 100.

---

## 2. The "per user" tracker read a field that does not exist

### What was wrong

`JwtAuthGuard` assigns `request.user = payload`, where the payload is

```ts
interface JwtPayload {
  sub: string;
  email: string;
  accountType: string;
  adminRole?: string;
}
```

There is no `id`. The tracker read `(user as { id?: unknown }).id`, which can never be a
string on a verified request, so it always fell through to the IP branch. Every
`tracker: 'user'` tier was per-IP while the documentation claimed "per user". The unit
test hid it by faking `user: { id: 'user-1' }` — a shape the real type cannot produce.

### The fix

`authenticatedSubjectOf` reads `sub`, validates it as a non-empty string, and falls back
to the address otherwise. Falling back is deliberate: a tracker returning `user:undefined`
would collapse every caller into one shared bucket, which is strictly worse than per-IP.

The spec now uses a real `JwtPayload`, and asserts the legacy `{ id }` shape resolves to
`null` so the regression cannot come back.

### Documented fallback, and the gap that remains

> **The `default` tier is per-IP in practice today, and that is a known, reported gap.**

`@nestjs/throttler` is bound as a global `APP_GUARD`. Nest orders global enhancers
_before_ route-scoped ones (`GuardsContextCreator.create` concatenates
`[...globalMetadata, ...classMetadata, ...methodMetadata]`), so `JwtAuthGuard` — applied
with `@UseGuards` — has not populated `request.user` when the tracker runs.

Closing that properly needs either a globally registered `JwtAuthGuard` (changes
authorization for every endpoint) or token verification inside the tracker (duplicates the
auth path and verifies twice per request). Neither is a rate-limiter decision, so both are
reported rather than taken here. The tracker is correct the moment either happens.

---

## 3. `THROTTLE_BLOCK_DURATION` was parsed and then never read

Every tier's `blockDurationMs` was hardcoded and `buildThrottleConfig` ignored the
variable, so the documented knob did nothing.

`blockDurationMs: 0` is now documented as **"this tier declares no block window of its
own"** — not "never block". `@nestjs/throttler` resolves `blockDuration || ttl`, so a 0
falls through to the request window and the caller stays blocked for the remainder of the
minute it just exhausted. `THROTTLE_BLOCK_DURATION` supplies a positive window for every
tier that leaves it at 0.

---

## 4. `THROTTLE_LIMIT` / `THROTTLE_TTL` are an opt-in bypass, not a setting

Either variable replaces the limit or the window of **every** tier at once. That is a
rate-limit bypass, so it is now gated on `THROTTLE_ALLOW_GLOBAL_OVERRIDE=true`:

| `THROTTLE_ALLOW_GLOBAL_OVERRIDE` | `NODE_ENV`     | Result                                                                    |
| -------------------------------- | -------------- | ------------------------------------------------------------------------- |
| unset / falsy                    | not production | override **refused**, per-tier limits stand, one WARN queued              |
| unset / falsy                    | `production`   | **refuses to boot** with a message naming the variable                    |
| `true`                           | any            | override applied, one WARN queued saying rate limiting is effectively off |

The warnings live on `ThrottleConfig.globalOverrideWarnings` as data (not log calls), so
`buildThrottleConfig` stays pure and testable; `main.ts` prints them through the injected
Winston logger.

> **Escape hatch, documented:** `vitest.config.e2e.ts` sets `THROTTLE_LIMIT=100000` to
> switch throttling off for the suite. It must **also** set
> `THROTTLE_ALLOW_GLOBAL_OVERRIDE=true`, or the e2e suite runs against the production
> limits. That file belongs to the CI/test-infra stream and was reported, not edited.

---

## 5. Valkey outage degrades loudly, not silently

`WAF_FAIL_MODE=open` and the in-memory counter fallback are deliberate availability
trade-offs: failing closed on a Valkey outage would take the whole API down. The cost is
real and now stated everywhere it applies:

- the limiter still runs, but counters are **per process**, so a budget is not shared
  across replicas and the effective limit is multiplied by the replica count;
- the WAF blocklist cannot create or escalate any block.

Neither is silent any more. `DegradationTracker`
(`common/observability/degradation.ts`) emits **one WARN per episode** carrying a
`degradationId` that is repeated on every later line, plus one INFO on recovery, and
exposes a snapshot. `GET /api/v1/metrics/degradation` serves the same state for
deployments that alert on metrics rather than logs.

Alert on the WARN line, or on `degradationCount > 0` / `consecutiveFailures > 0` in the
metrics endpoint.

---

## File map

| File                                               | Responsibility                                                     |
| -------------------------------------------------- | ------------------------------------------------------------------ |
| `throttler-options.ts`                             | Tracker resolution and one tier → one `ThrottlerOptions`           |
| `valkey-throttler.storage.ts`                      | Valkey counters with an in-memory fallback, plus the health signal |
| `../decorators/throttle-tier.decorator.ts`         | Tier metadata and the `skipIf` predicate                           |
| `../observability/degradation.ts`                  | One WARN per degradation episode, plus a scrapeable snapshot       |
| `../config/throttle.config.ts` (repo `src/config`) | Tiers, limits, block windows, the opt-in override gate             |
