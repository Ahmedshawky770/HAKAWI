export class PaymentCreatedEvent {
  constructor(
    public readonly paymentId: string,
    public readonly userId: string,
  ) {}
}

export class PaymentCompletedEvent {
  constructor(public readonly paymentId: string) {}
}

export class PaymentFailedEvent {
  constructor(public readonly paymentId: string) {}
}

export class RefundCreatedEvent {
  constructor(
    public readonly paymentId: string,
    public readonly refundId: string,
  ) {}
}

/**
 * A refund that has reached its terminal, successful state — the gateway has actually returned the
 * money.
 *
 * WHY IT CARRIES `paymentId` (it used to carry only `refundId`). Revoking an entitlement is work the
 * payments module cannot do for itself: "does this user own this book" is the library's fact and
 * rentals own the rental (Principle #9), so the revocation lives in those modules as `@OnEvent`
 * consumers. Those consumers must identify WHAT was refunded, and the only authoritative record of
 * what was bought is the stored `payments` row — its `userId` and its `metadata` (`{ bookId, type:
 * 'purchase' | 'rental' }`). Carrying `paymentId` lets each consumer read that row back, exactly as
 * `payment.completed` consumers already do, instead of duplicating book/type onto the event and
 * creating a second source of truth (Principle #7/#9). The refund row itself names only the payment,
 * so `{ paymentId, refundId }` — the same contract `refund.created` and `refund.failed` already use —
 * is the smallest shape that reaches the entitlement.
 */
export class RefundCompletedEvent {
  constructor(
    public readonly paymentId: string,
    public readonly refundId: string,
  ) {}
}

/**
 * A refund that did not go through. Identical shape to `RefundCreatedEvent`: both name the
 * payment and the refund, so a consumer reads the pair and branches on the event name.
 */
export class RefundFailedEvent {
  constructor(
    public readonly paymentId: string,
    public readonly refundId: string,
  ) {}
}
