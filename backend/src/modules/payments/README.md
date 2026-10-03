# Payments module

Payment lifecycle, Paymob gateway integration, refunds and webhook handling.

Payments are a **named critical island** (Principle #14). Availability may be traded away for
correctness here; every decision below that looks conservative is deliberate because of that.

## Amounts

`payments.amount`, `refunds.amount` and every Paymob `amount_cents` are **integers in the
minor unit** of the currency (piastres for EGP, cents for USD). A decimal amount is
rejected by the DTO (`@IsInt`) and again by Zod in the service before any network call.

No float ever touches a money value on this path. Refund capacity is a running **integer**
sum compared against the captured amount; it is not a percentage and not a decimal.

`currency` is a three letter uppercase ISO 4217 code, validated by Zod and normalised to
uppercase. `validateCurrency` accepts `null` and rejects it with a 400: the value usually comes
from a `payments` row, and a legacy row written before the column had a default can hold `NULL`.
Calling `.toUpperCase()` on that raised a `TypeError`, which Nest reports as an untyped 500.

## Paymob flow

`PaymobClient` (`clients/paymob.client.ts`) implements the documented Paymob Accept flow.
Every call goes through `ResilientHttpClient` (retry → circuit breaker → timeout →
`fetchJson`) and every response is validated by a Zod schema in `clients/paymob.schemas.ts`.

1. **Auth token** — `POST {base}/auth/tokens` with `{ api_key }`, response `{ token }`.
   Cached in Valkey under `paymob:auth-token:{environment}:{merchantId}` with a TTL
   clamped below Paymob's 3600s token lifetime. Concurrent cache misses are collapsed into
   a single auth request.
2. **Order registration** — `POST {base}/ecommerce/orders` with `{ auth_token, merchant_id,
amount_cents, currency, merchant_order_id }`, response `{ id }`. `merchant_order_id` is
   our own `payments.id`, so a Paymob order always maps back to one local payment.
3. **Payment key** — `POST {base}/acceptance/payment_keys` with the order id, response
   `{ token }`.
4. **Checkout URLs** — derived from the payment key, never fabricated:
   - iframe `https://accept.paymob.com/acceptance/iframes/{key}?merchant_id={id}`
   - accept `https://accept.paymob.com/acceptance/accepts/{key}?merchant_id={id}`

Refunds: `POST {base}/acceptance/void_refund/refund` with `{ auth_token, merchant_id,
transaction_id, amount_cents }`. The response is mapped to `PaymobRefundResult`; a
`refund_id` is preferred over `id` when Paymob returns both.

### A checkout URL is not optional

`createPayment(..., { initializeGateway: true })` and `paymobInitializePayment` register the
order and issue the payment key together. `POST /payments` (`@Public()`-free, JWT guarded, and
part of the published contract in `docs/api-contract/openapi/rest-api-spec.md`) passes
`{ initializeGateway: true }` for exactly this reason: a payment left in `pending` with no
`paymobOrderId` and no checkout URL can never be paid, because no webhook can match an order
that was never registered upstream.

## Environment

`PAYMOB_ENVIRONMENT=sandbox` (default) or `live` selects the credential set. Paymob's test
and live modes share a regional base URL, so the switch is driven by keys and integration
ids; `PAYMOB_SANDBOX_API_KEY` / `PAYMOB_SANDBOX_INTEGRATION_ID` let the sandbox use
test credentials while the generic variables hold live ones. `PAYMOB_BASE_URL` overrides the
base URL and is normalised to always end in `/api`. Configuration lives in
`src/config/paymob.config.ts`.

`PAYMOB_WEBHOOK_SECRET` is part of that config. It used to be read from raw `process.env` on
every webhook request, so a missing value surfaced as a `400` on the first delivery and a
wrong value as a silent wall of rejections. It is now `PaymobConfig.webhookSecret`, resolved
once by a Zod schema:

- unset or blank → the development default (keeps local work and the unit suite working);
- shorter than 32 characters → boot fails;
- `NODE_ENV=production` with the built-in default **or** the `your-webhook-secret` placeholder
  that ships in `backend/.env.example` → boot fails, by name, with one readable line.

An unset secret is a boot-time decision now, not a per-request 400.

## Failure behaviour

`createPayment(..., { initializeGateway: true })` and `paymobInitializePayment` never
invent a checkout URL. If the gateway is unreachable, invalid, or times out, the local
payment is marked `failed`, the cache is invalidated, **`payment.failed` is emitted with the
failing stage**, and the caller receives `ServiceUnavailableException` (503) carrying the
gateway error.

### Refunds

`createRefund` does not swallow gateway failures. `POST /payments/:id/refund` is
`@HttpCode(HttpStatus.CREATED)`, so returning a refund row with `status: 'failed'` announced a
refund that never left the building as `201 Created`. Every exit is now either a refund or a
typed exception:

| Condition                                                 | Result                            |
| --------------------------------------------------------- | --------------------------------- |
| Gateway unreachable, HTTP error, or reported unsuccessful | `503 ServiceUnavailableException` |
| No Paymob `transaction_id` on the payment                 | `400 BadRequestException`         |
| Payment missing or soft-deleted                           | `404 NotFoundException`           |
| Payment not `completed`                                   | `400 BadRequestException`         |
| Request would exceed the payment's refund capacity        | `400 BadRequestException`         |
| Refund admitted                                           | `201` with the refund             |

Every failure path also emits `refund.failed` and marks the local refund `failed` with the
reason in `metadata`. A refund row that silently says `pending` forever is worse than one that
says `failed`.

A refund is only submitted upstream when the webhook has delivered a Paymob
`transaction_id` for the payment. Without it the refund is recorded as `failed` with
`missing_paymob_transaction_id` rather than being sent with a made-up id.

### Refund capacity is reserved, not checked

Refund capacity is the sum of the payment's refunds in a **non-terminal** state —
`pending` and `processed` (`REFUND_CAPACITY_STATUSES`). Only `failed` and `cancelled` give it
back. `pending` counts because capacity is reserved _before_ the gateway is called, so a refund
sitting in `pending` is money that may already have left the account.

`PaymentsRepository.reserveRefundCapacity` reads the payment, sums the live refunds and inserts
the new refund inside **one transaction holding `SELECT … FOR UPDATE` on the payment row**.
Without the lock the check is a read followed by a write, and two concurrent refunds both read
the same pre-refund total, both see room, and both commit — which is how a single capture gets
refunded twice. A refused reservation throws inside the transaction and leaves no row behind.

When the reservation reaches the captured amount, `payments.status` becomes `refunded` in the
**same transaction** as the insert, so a crash between the two cannot leave a fully-refunded
payment still reading `completed`.

If the gateway then rejects that refund, `PaymentsRepository.reconcileRefundCapacity` re-derives
the status under the same lock and puts the payment back to `completed`, because the capacity was
released. Both events are logged; neither is silent.

## State machine

`PAYMENT_TRANSITIONS` in `payments.service.ts` is the single source of truth for **user-requested**
status changes, and it is enforced on every one: `updateStatus` (so `PATCH /payments/:id/status`)
and the webhook handler both go through `validateStatusTransition`.

`refunded → completed` is deliberately absent from that table. It is not an operator decision —
it is the correction the repository makes when a reservation that reached the cap is released
because the gateway refused the refund. Putting it in the table would let
`PATCH /payments/:id/status` un-refund a payment by hand.

There is **no `paymobCallback` method.** One existed and had no controller route, so nothing could
reach it, while this README used to describe it as idempotent (terminal short-circuit, transaction
id deduplication, mismatched order id rejection) — none of which it implemented, and none of which
it verified (no signature check, no amount check, no payment id comparison). It was unreachable code
with a false contract attached, and it has been deleted rather than documented (Principle #4). The
webhook handler is the only path that transitions a payment from a gateway delivery.

## Webhook security

`POST /payments/webhooks/paymob` is `@Public()`. Everything else is authenticated by an HMAC.

**Signature.** `validateWebhookSignature` computes HMAC-SHA256 over the **raw** request body —
`main.ts` captures `req.rawBody` in the `express.json` `verify` hook precisely so re-serialisation
cannot invalidate it — and compares with **`crypto.timingSafeEqual`**, not `!=`:

```
expected  = HMAC-SHA256(secret, rawBody)                        // 32 bytes
provided  = Buffer.from(header, 'hex')                          // may be any length
compare   = timingSafeEqual(sha256(expected), sha256(provided))
```

`!==` over two hex strings returns at the first differing byte, so the time it takes leaks how
many leading bytes of a forged signature were correct — a byte-at-a-time oracle for anyone allowed
to POST to the endpoint.

The extra hash is what makes the length case safe. `timingSafeEqual` throws when the two buffers
differ in length, and a wrong-length signature is what an attacker sends, so comparing the buffers
directly would turn a 16-character signature into a 500. Hashing both sides first puts every
rejection on **one path of constant length**, so the response cannot distinguish "wrong length"
from "wrong content" — not in the status code and not in how long it took. `Buffer.from(v, 'hex')`
silently stops at the first invalid pair rather than throwing, so a non-hex signature decodes to an
empty buffer and is rejected by that same comparison. All three rejections (missing, wrong length,
wrong content) return the identical `Invalid webhook signature`.

**Amount.** Every successful delivery is checked against the recorded payment before the payment
is completed:

- `captured !== payment.amount` → `400`, payment left untouched, both numbers logged.
- no amount on the delivery → `400`, payment left untouched, logged as unverifiable.

The second rule is the strict one. A delivery that says nothing about the amount cannot be
distinguished from an under-collected capture, and completing it would mark captured money nobody
reconciled. A **failed** delivery carrying no amount is still accepted — nothing was collected, so
there is nothing to reconcile and refusing would strand the payment.

**Accepted payload shapes.** `paymobWebhookPayloadSchema` in `clients/paymob.schemas.ts` models
both the documented POST envelope (`{ type: 'TRANSACTION', data: { id, amount_cents, success,
pending, order: { id } } }`) and the legacy flat GET callback (`transaction_id`, `order_id`,
`amount_cents`, `status`). Both are declared field by field rather than accepted as one permissive
blob, because the amount is what the verification above reads — an amount arriving under an
undeclared key would be unverifiable. `.passthrough()` keeps an unknown Paymob field from
rejecting a valid delivery. `pending: true` wins over `success: true`, so a capture still being
reconciled upstream is not marked completed.

**Not implemented: replay window.** There is no timestamp or nonce check. Replay protection rests
on the `already_processed` early return (a payment already `completed` for that transaction id) and
the unique index on `payments.paymob_transaction_id`.

## Caching

`GET /payments/:id` reads through `TaggedCacheService.getOrSet` with
`revive: revivePaymentDates`. The cache persists with `JSON.stringify`, so without a revival a hit
returns `createdAt`/`updatedAt` as ISO **strings** where the repository returned `Date` objects —
two runtime shapes behind one signature, and a `TypeError` the moment anything calls
`.toISOString()` on it. The revival restores the fields or raises `CacheEntryCorruptError`, which
the cache treats as a miss: a corrupt entry heals instead of becoming a 500.

`GET /payments` does not use the cache and never had this problem.

## Runtime prerequisite

`migrations/0016_add_paymob_gateway_fields.sql` adds `payments.paymob_payment_key`,
`paymob_iframe_url` and `paymob_accept_url`. Checkout writes all three, so **the application
requires that migration to have run**; without it every checkout insert fails. It is idempotent
(`ADD COLUMN IF NOT EXISTS`), so re-running it is safe.
