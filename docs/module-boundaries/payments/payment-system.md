# Payment System
## Hakawi - Payment Processing

---

## Purpose

This document defines the payment system for Hakawi, including payment flows, webhook handling, payment states, refunds, and error handling.

---

## Payment Flows

### Book Purchase Flow

```
1. User clicks "Purchase" on book page
2. Frontend calls: POST /books/:id/purchase
3. Backend validates:
   - User is authenticated
   - Book is available
   - User is not the owner
4. Backend creates payment record in PostgreSQL (status: pending)
5. Backend calls Paymob API to create payment intent
6. Paymob returns payment URL
7. Backend returns payment URL to frontend
8. Frontend redirects user to Paymob
9. User completes payment on Paymob
10. Paymob sends webhook to backend
11. Backend validates webhook signature
12. Backend updates payment status to completed
13. Backend grants user access to book
14. Backend sends purchase confirmation notification
```

### Book Rental Flow

```
1. User clicks "Rent" on book page
2. Frontend calls: POST /books/:id/rent with duration
3. Backend validates:
   - User is authenticated
   - Book is available
   - User is not the owner
4. Backend creates payment record in PostgreSQL (status: pending)
5. Backend calls Paymob API to create payment intent
6. Paymob returns payment URL
7. Backend returns payment URL to frontend
8. Frontend redirects user to Paymob
9. User completes payment on Paymob
10. Paymob sends webhook to backend
11. Backend validates webhook signature
12. Backend updates payment status to completed
13. Backend creates rental record with expiry date
14. Backend grants user access to book for rental period
15. Backend sends rental confirmation notification
```

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

## Webhook Handling

### Webhook Endpoint

```
POST /webhooks/paymob
```

### Webhook Validation

1. **Signature verification:** Paymob signs webhooks with HMAC-SHA256
2. **Timestamp check:** Webhook must be within 5 minutes of receipt
3. **Idempotency:** Each webhook has a unique `transaction_id`

### Webhook Processing

```typescript
@Post('webhooks/paymob')
async handlePaymobWebhook(@Body() payload: PaymobWebhook) {
  // 1. Validate signature
  if (!this.validateWebhookSignature(payload)) {
    throw new UnauthorizedException('Invalid webhook signature');
  }

  // 2. Check idempotency
  const existing = await this.paymentsRepository.findByTransactionId(payload.transaction_id);
  if (existing?.status === 'completed') {
    return { status: 'already_processed' };
  }

  // 3. Process webhook
  const payment = await this.paymentsRepository.findByTransactionId(payload.transaction_id);
  if (!payment) {
    throw new NotFoundException('Payment not found');
  }

  // 4. Update payment status
  await this.paymentsRepository.update(payment.id, {
    status: payload.status,
    completedAt: new Date(),
    metadata: payload
  });

  // 5. Emit event
  await this.eventBus.emit(new PaymentCompletedEvent({
    paymentId: payment.id,
    userId: payment.userId,
    amount: payment.amount
  }));

  return { status: 'processed' };
}
```

### Idempotency Strategy

- **Database unique constraint:** `transaction_id` is unique in payments table
- **Check before process:** Always check if webhook was already processed
- **Return early:** If already processed, return success without reprocessing
- **Webhook retries:** Paymob retries failed webhooks for 24 hours

---

## Payment States

### Book Purchase/Rental

```
pending → completed
    ↓
    → failed
    ↓
    → refunded
```

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
