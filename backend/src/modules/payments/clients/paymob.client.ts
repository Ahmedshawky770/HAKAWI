import { Inject, Injectable, Optional } from '@nestjs/common';
import type { ZodType } from 'zod';

import { PAYMOB_CONFIG, type PaymobConfig } from '../../../config/paymob.config.ts';
import { ResilientHttpClient } from '../../../common/resilience/resilient-http.client.ts';
import { ValkeyService } from '../../../common/services/valkey.service.ts';
import { WinstonLoggerService } from '../../../common/services/winston-logger.service.ts';
import {
  FetchResponseError,
  FetchValidationError,
  isRetryableFetchError,
  type FetchJsonBody,
} from '../../../common/utils/fetch.util.ts';

import {
  paymobAuthTokenRequestSchema,
  paymobAuthTokenResponseSchema,
  paymobCheckoutInputSchema,
  paymobOrderRequestSchema,
  paymobOrderResponseSchema,
  paymobPaymentKeyRequestSchema,
  paymobPaymentKeyResponseSchema,
  paymobRefundInputSchema,
  paymobRefundRequestSchema,
  paymobRefundResponseSchema,
  type PaymobCheckout,
  type PaymobRefundResult,
} from './paymob.schemas.ts';

export const PAYMOB_CLIENT = Symbol('PAYMOB_CLIENT');

export const PAYMOB_CIRCUIT_NAME = 'paymob';
const AUTH_TOKEN_CACHE_KEY_PREFIX = 'paymob:auth-token:';
const DEFAULT_BILLING_EMAIL = 'no-reply@hakawi.com';

export type PaymobCheckoutRequest = {
  readonly amountCents: number;
  readonly currency: string;
  readonly merchantOrderId: string;
  readonly billingEmail?: string;
  readonly billingPhoneNumber?: string;
  readonly expirationSeconds?: number;
};

export type PaymobRefundRequestInput = {
  readonly transactionId: string | number;
  readonly amountCents: number;
};

export interface PaymobGateway {
  createCheckout(request: PaymobCheckoutRequest): Promise<PaymobCheckout>;
  refundTransaction(request: PaymobRefundRequestInput): Promise<PaymobRefundResult>;
  invalidateAuthToken(): Promise<void>;
}

export class PaymobGatewayError extends Error {
  readonly step: string;
  readonly cause: unknown;

  constructor(step: string, message: string, cause: unknown) {
    super(`Paymob ${step} failed: ${message}`);
    this.name = 'PaymobGatewayError';
    this.step = step;
    this.cause = cause;
  }
}

export type PaymobClientOptions = {
  readonly fetchImpl?: typeof fetch;
};

type PaymobCallOptions = {
  readonly url: string;
  readonly body: Record<string, unknown>;
  readonly timeoutMs?: number;
};

@Injectable()
export class PaymobClient implements PaymobGateway {
  private readonly options: PaymobClientOptions;
  private inflightAuthToken: Promise<string> | null = null;

  constructor(
    @Inject(PAYMOB_CONFIG) private readonly config: PaymobConfig,
    private readonly http: ResilientHttpClient,
    private readonly valkeyService: ValkeyService,
    @Inject(WinstonLoggerService) private readonly logger: WinstonLoggerService,
    @Optional() options: PaymobClientOptions = {},
  ) {
    this.options = options;
  }

  async createCheckout(unvalidated: PaymobCheckoutRequest): Promise<PaymobCheckout> {
    const request = paymobCheckoutInputSchema.parse(unvalidated);
    const authToken = await this.getAuthToken();

    const orderRequest = paymobOrderRequestSchema.parse({
      auth_token: authToken,
      merchant_id: this.config.merchantId,
      amount_cents: request.amountCents,
      currency: request.currency,
      merchant_order_id: request.merchantOrderId,
    });

    const order = await this.call('order registration', paymobOrderResponseSchema, {
      url: this.apiUrl('ecommerce/orders'),
      body: orderRequest,
    });

    const paymentKeyRequest = paymobPaymentKeyRequestSchema.parse({
      auth_token: authToken,
      amount_cents: request.amountCents,
      currency: request.currency,
      order_id: order.id,
      merchant_id: this.config.merchantId,
      integration_id: this.config.integrationId,
      expiration: request.expirationSeconds,
      lock_order_when_paid: true,
      billing_email: request.billingEmail ?? DEFAULT_BILLING_EMAIL,
    });

    const paymentKey = await this.call('payment key request', paymobPaymentKeyResponseSchema, {
      url: this.apiUrl('acceptance/payment_keys'),
      body: paymentKeyRequest,
    });

    return {
      orderId: String(order.id),
      paymentKey: paymentKey.token,
      iframeUrl: this.buildAcceptUrl('iframes', paymentKey.token),
      acceptUrl: this.buildAcceptUrl('accepts', paymentKey.token),
    };
  }

  async refundTransaction(unvalidated: PaymobRefundRequestInput): Promise<PaymobRefundResult> {
    const request = paymobRefundInputSchema.parse(unvalidated);
    const authToken = await this.getAuthToken();

    const refundRequest = paymobRefundRequestSchema.parse({
      auth_token: authToken,
      merchant_id: this.config.merchantId,
      transaction_id: request.transactionId,
      amount_cents: request.amountCents,
    });

    const refund = await this.call('refund', paymobRefundResponseSchema, {
      url: this.apiUrl('acceptance/void_refund/refund'),
      body: refundRequest,
    });

    return {
      refundId: refund.refund_id ?? String(refund.id),
      success: refund.success === true,
      pending: refund.pending === true,
      isRefund: refund.is_refund === true,
      amountCents: refund.amount_cents ?? null,
      currency: refund.currency ?? null,
      raw: refund,
    };
  }

  async invalidateAuthToken(): Promise<void> {
    await this.valkeyService.del(this.authTokenCacheKey());
  }

  buildAcceptUrl(kind: 'iframes' | 'accepts', token: string): string {
    const origin = this.config.baseUrl.replace(/\/api$/i, '');
    return `${origin}/acceptance/${kind}/${encodeURIComponent(token)}?merchant_id=${encodeURIComponent(this.config.merchantId)}`;
  }

  private apiUrl(path: string): string {
    return `${this.config.baseUrl}/${path}`;
  }

  private authTokenCacheKey(): string {
    return `${AUTH_TOKEN_CACHE_KEY_PREFIX}${this.config.environment}:${this.config.merchantId}`;
  }

  private async getAuthToken(): Promise<string> {
    const cached = await this.valkeyService.get(this.authTokenCacheKey());
    if (cached !== null && cached.length > 0) {
      return cached;
    }

    if (this.inflightAuthToken !== null) {
      return this.inflightAuthToken;
    }

    this.inflightAuthToken = this.fetchAuthToken();
    try {
      return await this.inflightAuthToken;
    } finally {
      this.inflightAuthToken = null;
    }
  }

  private async fetchAuthToken(): Promise<string> {
    const request = paymobAuthTokenRequestSchema.parse({ api_key: this.config.apiKey });
    const response = await this.call('auth token', paymobAuthTokenResponseSchema, {
      url: this.apiUrl('auth/tokens'),
      body: request,
      timeoutMs: this.config.authTimeoutMs,
    });

    await this.valkeyService.set(this.authTokenCacheKey(), response.token, this.config.authTokenCacheTtlSeconds);
    this.logger.debug(
      `Paymob auth token issued for merchant ${this.config.merchantId} in ${this.config.environment}, cached for ${this.config.authTokenCacheTtlSeconds}s`,
    );
    return response.token;
  }

  private async call<T>(step: string, schema: ZodType<T>, options: PaymobCallOptions): Promise<T> {
    const body: FetchJsonBody = JSON.stringify(options.body);
    try {
      return await this.http.request<T>(options.url, schema, {
        circuitName: PAYMOB_CIRCUIT_NAME,
        timeoutMs: options.timeoutMs ?? this.config.requestTimeoutMs,
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body,
        fetchImpl: this.options.fetchImpl,
        retryConfig: { maxRetries: this.config.retryMaxAttempts },
        shouldRetry: (error: unknown): boolean => isRetryableFetchError(error),
      });
    } catch (error) {
      this.logger.error(`Paymob ${step} failed: ${this.describe(error)}`);
      throw new PaymobGatewayError(step, this.describe(error), error);
    }
  }

  private describe(error: unknown): string {
    if (error instanceof PaymobGatewayError) {
      return error.message;
    }
    if (error instanceof FetchResponseError) {
      return `HTTP ${error.status} ${error.statusText} ${error.bodyPreview}`.trim();
    }
    if (error instanceof FetchValidationError) {
      return `response failed schema validation: ${error.issues.join('; ')}`;
    }
    return error instanceof Error ? error.message : String(error);
  }
}
