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

export class RefundCompletedEvent {
  constructor(public readonly refundId: string) {}
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
