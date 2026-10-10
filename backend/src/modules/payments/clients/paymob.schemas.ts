import { z } from 'zod';

const CURRENCY_PATTERN = /^[A-Z]{3}$/;

export const paymobCurrencySchema = z
  .string()
  .regex(CURRENCY_PATTERN, 'currency must be a three letter uppercase ISO 4217 code');

export const paymobAmountCentsSchema = z
  .number()
  .int('amount must be an integer number of minor units')
  .positive('amount must be greater than zero')
  .max(99_999_999_99, 'amount exceeds the maximum single charge Paymob accepts');

const paymobNumericIdSchema = z.union([
  z.number().int().positive('identifier must be a positive integer'),
  z.string().regex(/^[1-9]\d*$/, 'identifier must be a positive integer string'),
]);

export const paymobAuthTokenRequestSchema = z.object({
  api_key: z.string().min(1, 'api_key is required'),
});

export const paymobAuthTokenResponseSchema = z.object({
  token: z.string().min(1, 'Paymob returned an empty auth token'),
});

export const paymobOrderRequestSchema = z.object({
  auth_token: z.string().min(1),
  merchant_id: z.string().min(1),
  amount_cents: z.number().int().positive(),
  currency: paymobCurrencySchema,
  merchant_order_id: z.string().min(1).max(64).optional(),
  items: z
    .array(
      z.object({
        name: z.string().min(1),
        amount_cents: z.number().int().nonnegative(),
        quantity: z.number().int().positive(),
      }),
    )
    .min(1)
    .optional(),
});

export const paymobOrderResponseSchema = z.object({
  id: paymobNumericIdSchema,
});

export const paymobPaymentKeyRequestSchema = z.object({
  auth_token: z.string().min(1),
  amount_cents: z.number().int().positive(),
  currency: paymobCurrencySchema,
  order_id: paymobNumericIdSchema,
  merchant_id: z.string().min(1),
  integration_id: z.string().min(1),
  expiration: z.number().int().positive().optional(),
  lock_order_when_paid: z.boolean().optional(),
  billing_email: z.string().min(3).max(255).optional(),
  billing_phone_number: z.string().min(6).max(32).optional(),
});

export const paymobPaymentKeyResponseSchema = z.object({
  token: z.string().min(1, 'Paymob returned an empty payment key token'),
});

export const paymobRefundRequestSchema = z.object({
  auth_token: z.string().min(1),
  merchant_id: z.string().min(1),
  transaction_id: paymobNumericIdSchema,
  amount_cents: z.number().int().positive(),
});

export const paymobRefundResponseSchema = z
  .object({
    id: paymobNumericIdSchema,
    refund_id: z.string().min(1).optional(),
    success: z.boolean().optional(),
    pending: z.boolean().optional(),
    is_refund: z.boolean().optional(),
    is_void: z.boolean().optional(),
    amount_cents: z.number().int().nonnegative().optional(),
    currency: paymobCurrencySchema.optional(),
    integration_id: z.union([z.number().int(), z.string()]).optional(),
    created_at: z.string().min(1).optional(),
    order: z
      .object({
        id: paymobNumericIdSchema.optional(),
        merchant_order_id: z.string().nullish(),
      })
      .passthrough()
      .optional(),
    source_data: z.record(z.unknown()).optional(),
  })
  .passthrough();

export const paymobCheckoutInputSchema = z.object({
  amountCents: paymobAmountCentsSchema,
  currency: paymobCurrencySchema,
  merchantOrderId: z.string().min(1).max(64),
  billingEmail: z.string().min(3).max(255).optional(),
  billingPhoneNumber: z.string().min(6).max(32).optional(),
  expirationSeconds: z.number().int().positive().optional(),
});

export const paymobRefundInputSchema = z.object({
  transactionId: z.union([z.number().int().positive(), z.string().regex(/^[1-9]\d*$/)]),
  amountCents: paymobAmountCentsSchema,
});

/**
 * Paymob delivers transaction notifications in two shapes and this module has to read both.
 *
 * The **documented** contract is a POST whose body is an envelope:
 * `{ "type": "TRANSACTION", "data": { "id": …, "amount_cents": …, "success": true, "pending": false } }`.
 * The **legacy** contract is a GET callback carrying the same values flat and named differently
 * (`order`, `source_data.merchant_order_id`, `source_data.ping_status`).
 *
 * Both are modelled explicitly rather than with one permissive blob, so the amount a capture reports
 * is read from a declared field in either shape. That matters because the amount is what the
 * webhook handler verifies against the recorded payment: an amount that could arrive under an
 * undeclared key would be unverifiable, and an unverifiable amount on a money path is a gap, not a
 * convenience.
 *
 * `.passthrough()` on both levels keeps an unknown Paymob field from rejecting the whole delivery —
 * Paymob adds fields, and a new key must not turn a valid payment into a 400 that Paymob then
 * retries forever.
 */
const paymobWebhookIdentifierSchema = z.union([z.number().int().positive(), z.string().min(1)]);

export const paymobWebhookPayloadSchema = z
  .object({
    // Documented envelope.
    type: z.string().min(1).optional(),
    data: z
      .object({
        id: paymobWebhookIdentifierSchema.optional(),
        order_id: z.string().min(1).optional(),
        amount_cents: z.number().int().nonnegative().optional(),
        success: z.boolean().optional(),
        pending: z.boolean().optional(),
        order: z.object({ id: paymobWebhookIdentifierSchema.optional() }).passthrough().optional(),
      })
      .passthrough()
      .optional(),
    // Legacy flat callback.
    transaction_id: paymobWebhookIdentifierSchema.optional(),
    order_id: z.string().min(1).optional(),
    payment_id: z.string().min(1).optional(),
    amount_cents: z.number().int().nonnegative().optional(),
    status: z.string().min(1).optional(),
  })
  .passthrough();

export type PaymobWebhookPayload = z.infer<typeof paymobWebhookPayloadSchema>;

/**
 * The single field every Paymob shape uses to name the transaction it settled.
 *
 * Paymob sends a numeric transaction id; it is carried through as a string because every id in this
 * codebase is a string (Principle #3), and `payments.paymob_transaction_id` is a `varchar`.
 */
export function resolveWebhookTransactionId(payload: PaymobWebhookPayload): string | undefined {
  const candidate = payload.transaction_id ?? payload.data?.id;
  return candidate === undefined ? undefined : String(candidate);
}

/**
 * The Paymob order the transaction belongs to, which is the value we stored as our
 * `merchant_order_id` mapping key (`payments.paymobOrderId`).
 */
export function resolveWebhookOrderId(payload: PaymobWebhookPayload): string | undefined {
  const candidate = payload.order_id ?? payload.data?.order_id ?? payload.data?.order?.id;
  return candidate === undefined ? undefined : String(candidate);
}

/**
 * The captured amount in minor units, or `undefined` when the delivery carries none.
 *
 * `undefined` is deliberately distinct from `0`: the handler must be able to tell "Paymob says this
 * capture was for zero" apart from "this delivery says nothing about the amount", because only the
 * first is verifiable.
 */
export function resolveWebhookAmountCents(payload: PaymobWebhookPayload): number | undefined {
  return payload.amount_cents ?? payload.data?.amount_cents;
}

/**
 * The outcome the delivery reports: `completed` only for a settled success.
 *
 * `pending` wins over `success` in the envelope because Paymob can report `success: true` with
 * `pending: true` while the transaction is still being reconciled; completing the payment then would
 * mark captured money that the gateway has not confirmed.
 */
export function resolveWebhookStatus(payload: PaymobWebhookPayload): 'completed' | 'failed' {
  const envelopePending = payload.data?.pending === true;
  const envelopeSuccess = payload.data?.success === true;
  const settled = envelopeSuccess && !envelopePending;
  return settled || payload.status === 'success' ? 'completed' : 'failed';
}

export type PaymobAuthTokenRequest = z.infer<typeof paymobAuthTokenRequestSchema>;
export type PaymobAuthTokenResponse = z.infer<typeof paymobAuthTokenResponseSchema>;
export type PaymobOrderRequest = z.infer<typeof paymobOrderRequestSchema>;
export type PaymobOrderResponse = z.infer<typeof paymobOrderResponseSchema>;
export type PaymobPaymentKeyRequest = z.infer<typeof paymobPaymentKeyRequestSchema>;
export type PaymobPaymentKeyResponse = z.infer<typeof paymobPaymentKeyResponseSchema>;
export type PaymobRefundRequest = z.infer<typeof paymobRefundRequestSchema>;
export type PaymobRefundResponse = z.infer<typeof paymobRefundResponseSchema>;

export type PaymobCheckout = {
  readonly orderId: string;
  readonly paymentKey: string;
  readonly iframeUrl: string;
  readonly acceptUrl: string;
};

export type PaymobRefundResult = {
  readonly refundId: string;
  readonly success: boolean;
  readonly pending: boolean;
  readonly isRefund: boolean;
  readonly amountCents: number | null;
  readonly currency: string | null;
  readonly raw: PaymobRefundResponse;
};
