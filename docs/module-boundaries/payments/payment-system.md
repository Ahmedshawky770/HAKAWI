# Payment System
## Hakawi - Payment Processing

Status markers: ✅ implemented · ⚠️ partial · ⛔ not implemented.

The real implementation is `backend/src/modules/payments/clients/paymob.client.ts`, driven by
`backend/src/modules/payments/payments.service.ts` and configured by
`backend/src/config/paymob.config.ts`.

---

## Purpose

This document defines the payment system for Hakawi, including payment flows, webhook handling,
payment states, refunds, and error handling.

---

## Paymob Client — ✅ real

**The client previously described a stub that fabricated a URL with no HTTP call.** It now performs
the full Paymob flow through `ResilientHttpClient`, with a **Zod schema on every response**:

| Step | Paymob endpoint | What happens |
|---|---|---|
| 1 | `POST /auth/tokens` | Auth token, **cached in Valkey** under `paymob:auth-token:<env>:<merchantId>` for `PAYMOB_AUTH_TOKEN_CACHE_TTL_SECONDS` (default 3000, clamped below Paymob's 3600s token lifetime). `invalidateAuthToken()` forces a refetch |
| 2 | `POST /ecommerce/orders` | Order registration |
| 3 | `POST /acceptance/payment_keys` | Payment key |
| 4 | — | `iframeUrl` = `{base}/iframes/{token}`; `acceptUrl` = `{base}/accepts/{token}` |
| 5 | `POST /ecommerce/refunds/refund` | Refund |

✅ The three gateway values are persisted on the `payments` row — `paymob_payment_key`,
`paymob_iframe_url`, `paymob_accept_url` — added by `migrations/0016_add_paymob_gateway_fields.sql`.

✅ **A failure is clean.** If any step fails, the client throws `ServiceUnavailableException`
(HTTP **503**), the local payment row is marked `failed`, and **no URL is fabricated**. Before the
refactor, a failure produced a plausible-looking checkout URL that led nowhere.

### ⚠️ Sandbox vs live is the **credential set**, not the URL

`PAYMOB_SANDBOX_BASE_URL` and `PAYMOB_LIVE_BASE_URL` are **the same string**,
`https://accept.paymob.com/api` (`backend/src/config/paymob.config.ts:5-6`). What `PAYMOB_ENVIRONMENT` changes is which
API key and integration id are used:

```ts
// backend/src/config/paymob.config.ts:60-63
const apiKey = isSandbox
  ? (parsed.PAYMOB_SANDBOX_API_KEY ?? parsed.PAYMOB_API_KEY)
  : parsed.PAYMOB_API_KEY;
const integrationId = isSandbox
  ? (parsed.PAYMOB_SANDBOX_INTEGRATION_ID ?? parsed.PAYMOB_INTEGRATION_ID)
  : parsed.PAYMOB_INTEGRATION_ID;
```

`PAYMOB_BASE_URL` is still honoured as an override, and `normalizePaymobBaseUrl()` appends `/api` if
it is missing. **Any document implying the base URL differs per mode is wrong.**

### Resilience — ✅ wired, not dead code
`ResilientHttpClient` wraps the client with the circuit breaker, retry (exponential backoff with
jitter), timeout, and fallback services, plus `PAYMOB_RETRY_MAX_ATTEMPTS` (default 2) and
`PAYMOB_REQUEST_TIMEOUT_MS` / `PAYMOB_AUTH_TIMEOUT_MS`.

---

## Payment Flows

### Book Purchase Flow — ✅

```
1.  User clicks "Purchase" on the book page
2.  Frontend calls: POST /api/v1/books/:id/purchase
3.  Backend validates: authenticated · book exists and is not soft-deleted · caller is not the author
    · the book is not free  (backend/src/modules/books/books.service.ts:185-206)
4.  Backend increments the view count
5.  Backend calls paymentsService.paymobInitializePayment(userId, price, 'EGP', { bookId, type: 'purchase' })
6.  PaymobClient runs: auth token (Valkey-cached) → order registration → payment key
7.  Backend persists paymob_payment_key / paymob_iframe_url / paymob_accept_url and returns the payment
8.  Frontend redirects the user to the Paymob iframe or accept URL
9.  User completes payment on Paymob
10. Paymob sends a webhook: POST /api/v1/payments/webhooks/paymob
11. Backend processes the webhook idempotently — uniqueIndex on payments.paymob_transaction_id
12. Backend updates the payment status to completed
13. Backend grants access via the library table
14. Event-driven confirmation notification
```

✅ `paymobInitializePayment` **is reachable** from a route — via `POST /books/:id/purchase`.

⚠️ Steps 10–11 are unit-tested against fixtures. ⛔ **No test has ever called Paymob's API**, so the
live sandbox path is unverified.

### Book Rental Flow — ✅

```
1.  Frontend calls: POST /api/v1/books/:id/rent with { durationDays }
2.  Backend validates: authenticated · book exists · caller is not the author
3.  Backend creates a payment record (status: pending)
4.  PaymobClient runs the same five-step flow
5.  User completes payment on Paymob
6.  Paymob sends the webhook
7.  Backend updates the payment status to completed
8.  Backend creates a rental row with an expiry date (rentals table)
9.  Rental extensions: rental_extensions table
10. Library reflects the time-limited grant
11. Event-driven confirmation notification
```

⚠️ **Rental durations are an integer `durationDays` constrained to a fixed set — not a PostgreSQL
enum.** The previous version of the schema document described a `rental_duration` `CREATE TYPE` enum
with `one_day | three_days | one_week | two_weeks | one_month | three_months`; no such type or
column exists. The enumeration survives only as a class-validator constraint:

```ts
// backend/src/modules/books/dto/index.ts:188-192
class RentBookDto {
  @IsInt()
  @IsIn([1, 3, 7, 14, 30, 90], { message: 'Duration must be one of: 1, 3, 7, 14, 30, 90 days' })
  durationDays: number;
}
```

So the valid values are the **integers** `1, 3, 7, 14, 30, 90` — the field is `durationDays`, not
`duration`, and the values are numbers, not the strings `"one_week"` and friends.

### Contest Prize Flow
See `docs/roadmap/phases/implementation-roadmap.md` → Phase 5. `contest_prizes` is a table; there is
⛔ **no automated payout** — prizes are recorded, not paid.

### Refund Flow — ✅
`POST /api/v1/payments/:id/refund` → `PaymobClient.refundTransaction()`, with the result persisted
in `refunds` (`paymob_refund_id` + `metadata`). `GET /api/v1/payments/:id/refunds` lists them.

---

## Changelog — reconciliation (2026-09-30)

| Previous claim | Reality |
|---|---|
| Paymob "returns payment URL" as a step, with no description of how | ✅ Now a real 5-step HTTP flow through `ResilientHttpClient`, Zod on every response, auth token cached in Valkey |
| Implied the base URL differs between sandbox and live | ⛔ **Wrong.** Both are `https://accept.paymob.com/api`; `PAYMOB_ENVIRONMENT` swaps the API key and integration id (`paymob.config.ts:5-6,60-63`) |
| — | **New:** a failure now yields 503 with the local payment marked `failed`, instead of a fabricated URL |
| — | **New:** `paymob_payment_key` / `paymob_iframe_url` / `paymob_accept_url` are persisted (migration `0016`) |
| — | **New:** retry, circuit breaking, timeouts, and the sandbox/live credential split are now documented with their env vars |
| `duration` shown as a rental enum with string values | ⚠️ `durationDays` as an **integer** in `[1,3,7,14,30,90]` — `@IsIn`-constrained, so it is an enumeration, but not a `CREATE TYPE` enum |
| — | **Newly recorded:** `paymobInitializePayment` **is** reachable, via `POST /books/:id/purchase`; ⛔ and no test has ever reached Paymob's API |

---

*This document defines the payment system for Hakawi.*


### Contest Prize Flow

```
1. Publisher selects winner
2. Backend creates prize transaction (status: pending)
3. Backend calls Paymob API to create payout
4. Paymob processes payout
5. Paymob sends webhook to backend
6. Backend validates webhook signature
7. Backend updates prize transaction status to completed
8. Backend awards badge to winner
9. Backend sends prize notification to winner
```

---

## Webhook Handling — ✅ real

### Webhook Endpoint

```
POST /api/v1/payments/webhooks/paymob        @Public(), returns 200 on success
```
`backend/src/modules/payments/controllers/payments.controller.ts:114-121`

### Webhook Validation — ✅

1. **HMAC-SHA256 over the raw request body** using `PAYMOB_WEBHOOK_SECRET`, compared against the
   `x-paymob-signature` header (`backend/src/modules/payments/payments.service.ts:75-89`). The **raw** body is what is signed —
   `backend/src/main.ts:71-79` captures it in the `express.json` `verify` hook precisely so re-serialisation
   cannot invalidate the signature.
2. **Idempotency:** the handler returns `{ status: 'already_processed' }` when a payment with the
   same `transaction_id` is already `completed` (`backend/src/modules/payments/payments.service.ts:428-431`).
3. ⚠️ **No timestamp/replay window.** The previous version of this document claimed "webhook must be
   within 5 minutes of receipt". **That check does not exist.** Replay protection rests entirely on
   the `already_processed` early return and the `uniqueIndex` on
   `payments.paymob_transaction_id`.
4. ⚠️ `PAYMOB_WEBHOOK_SECRET` is read directly from `process.env` in
   `backend/src/modules/payments/payments.service.ts:412`, **not** through `paymob.config.ts`. If it is unset, every webhook is
   rejected with `Webhook secret is not configured`.

### Webhook Processing — the real flow

```typescript
// backend/src/modules/payments/payments.service.ts:411-450
async handlePaymobWebhook(rawBody: string, signature?: string) {
  this.validateWebhookSignature(rawBody, signature, process.env.PAYMOB_WEBHOOK_SECRET);

  const payload = JSON.parse(rawBody);                        // 400 on malformed JSON
  const transactionId = payload.transaction_id;               // 400 if absent

  const existing = await this.paymentsRepository.findByTransactionId(transactionId);
  if (existing?.status === 'completed') {
    return { status: 'already_processed' };                   // idempotency
  }

  const payment = existing ?? await this.paymentsRepository.findByOrderId(payload.order_id);
  if (!payment) throw new NotFoundException('Payment not found for webhook');

  const status = payload.status === 'success' ? 'completed' : 'failed';
  this.validateStatusTransition(payment.status, status);      // 400 on an illegal transition

  await this.paymentsRepository.update(payment.id, {
    status, paymobPaymentId, paymobTransactionId: transactionId,
    metadata: JSON.stringify(payload),
  });
  await this.invalidatePaymentCache(payment.id);

  if (status === 'completed') {
    await this.eventBus.emit('payment.completed', { paymentId: payment.id });
  }
  return { status: 'processed' };
}
```

### Idempotency Strategy
- ✅ **Database unique constraint** — `uniqueIndex('payments_transaction_id_idx')` on
  `payments.paymob_transaction_id` (`backend/src/db/schema/payments.schema.ts:34`)
- ✅ **Check before process** — the `already_processed` early return
- ✅ **Return early** with 200, so Paymob does not retry a duplicate
- ⚠️ "Paymob retries failed webhooks for 24 hours" is a statement about Paymob's behaviour, not
  something this codebase configures
- ⛔ **No compensation mechanism.** If the payment succeeds upstream but the local update fails, the
  webhook is retried by Paymob and will eventually land; there is no reconciliation job to catch a
  webhook Paymob never redelivered

---

## Payment States — ✅ enforced

### Book Purchase/Rental

```
pending → completed
    ↓        ↓
    └──→ failed
             ↓
          refunded
```

Transitions are **validated, not assumed**:
`validateStatusTransition()` (`backend/src/modules/payments/payments.service.ts:60-73`) throws
`BadRequestException('Invalid payment status transition from X to Y')` for an illegal move, so a
duplicate or out-of-order webhook is a 400 rather than silent corruption.

| State | Description | Next States |
|-------|-------------|-------------|
| `pending` | Payment initiated, awaiting user completion | completed, failed |
| `completed` | Payment successful | refunded |
| `failed` | Payment failed or expired | - |
| `refunded` | Payment refunded to user | - |

### Contest Prize

```
pending → completed
    ↓
    → failed
```

| State | Description | Next States |
|-------|-------------|-------------|
| `pending` | Payout initiated | completed, failed |
| `completed` | Payout successful | - |
| `failed` | Payout failed | - |

---

## Refund Flow

### Full Refund

```
1. Admin or system initiates refund
2. Backend validates:
   - Payment exists
   - Payment is completed
   - Payment is not already refunded
   - Refund is within allowed window (e.g., 30 days)
3. Backend calls Paymob refund API
4. Paymob processes refund
5. Paymob sends webhook confirming refund
6. Backend updates payment status to refunded
7. Backend revokes user access (if rental/book)
8. Backend sends refund confirmation notification
```

### Partial Refund

```
Same as full refund, but:
- Refund amount is less than original payment
- User retains partial access
- Refund record is created with amount
```

### Refund Constraints

- **Time limit:** Refunds allowed within 30 days of purchase
- **Eligibility:** Only completed payments can be refunded
- **Partial refunds:** Allowed for rentals (refund remaining days)
- **Admin only:** Only admins can initiate refunds
- **Audit trail:** All refunds are logged with reason and admin ID

---

## Error Handling

### Payment Errors

| Error | Cause | Handling |
|-------|-------|----------|
| `insufficient_funds` | User's payment method has insufficient funds | Show error, allow retry |
| `card_declined` | Card issuer declined payment | Show error, suggest alternative payment method |
| `expired_card` | Card has expired | Show error, ask user to update payment method |
| `processing_error` | Temporary Paymob error | Retry automatically, show loading state |
| `webhook_timeout` | Paymob webhook failed to deliver | Retry with exponential backoff, reconcile on schedule |

### Retry Strategy

```typescript
async function processWithRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  delayMs = 1000
): Promise<T> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      await sleep(delayMs * Math.pow(2, i)); // Exponential backoff
    }
  }
  throw new Error('Max retries exceeded');
}
```

### Fallback Behavior

- **If Paymob is down:** Show maintenance message, allow user to retry later
- **If webhook fails:** Reconciliation job runs every hour to sync payment statuses
- **If database is down:** Reject payment attempts, show error message

---

## Security

### Webhook Security

- **HMAC signature verification:** All webhooks signed with shared secret
- **Timestamp validation:** Reject webhooks older than 5 minutes
- **IP whitelist:** Only accept webhooks from Paymob IPs
- **Idempotency:** Prevent duplicate processing

### Payment Security

- **No card data stored:** All card data handled by Paymob
- **HTTPS only:** All payment endpoints require TLS
- **Authentication:** All payment endpoints require valid JWT
- **Authorization:** Users can only access their own payments
- **Audit trail:** All payment actions logged with user ID, IP, timestamp

### Data Protection

- **Sensitive data masked:** Card numbers, CVV never stored
- **Encryption:** Payment metadata encrypted at rest
- **Retention:** Payment records kept for 7 years (legal requirement)

---

## Monitoring

### Metrics

- Payment success rate
- Payment failure rate by error type
- Average payment processing time
- Webhook delivery success rate
- Refund rate

### Alerts

- Payment success rate < 95%
- Webhook delivery failure rate > 5%
- Payment processing time > 10s
- Refund rate > 10%

---

*This document defines the payment system for Hakawi.*
