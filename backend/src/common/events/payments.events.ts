export class PaymentCreatedEvent {
  constructor(public readonly paymentId: string, public readonly userId: string) {}
}

export class PaymentCompletedEvent {
  constructor(public readonly paymentId: string) {}
}

export class PaymentFailedEvent {
  constructor(public readonly paymentId: string) {}
}

export class RefundCreatedEvent {
  constructor(public readonly paymentId: string, public readonly refundId: string) {}
}

export class RefundCompletedEvent {
  constructor(public readonly refundId: string) {}
}
