import type { Server } from 'node:http';

import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { EventEmitter2 } from '@nestjs/event-emitter';
import request from 'supertest';
import { vi } from 'vitest';
import { eq } from 'drizzle-orm';

import { AppModule } from '../../../app.module.ts';
import { WinstonLoggerService } from '../../../common/services/winston-logger.service.ts';
import { ValkeyService } from '../../../common/services/valkey.service.ts';
import { EncryptionService } from '../../../common/utils/encryption.util.ts';
import { db } from '../../../db/index.ts';
import { UsersRepository } from '../../users/repositories/users.repository.ts';
import { USERS_REPOSITORY } from '../../users/interfaces/users-repository.interface.ts';
import { UsersEventHandler } from '../../users/events/users.event-handler.ts';
import { PAYMOB_CLIENT } from '../clients/paymob.client.ts';
import type { PaymobGateway } from '../clients/paymob.client.ts';
import { payments } from '../../../db/schema/payments.schema.ts';
import type { JsonResponse, LoginResponseBody } from '../../../test/helpers/test-response-types.ts';

/** The subset of `PaymentResponse` (`payments/types.ts`) this suite asserts on. */
interface PaymentResponseBody {
  id: string;
  amount: number;
  status: string;
  paymobOrderId: string | null;
  paymobPaymentKey: string | null;
  paymobIframeUrl: string | null;
}

/**
 * `POST /payments` registers a real Paymob order, so the suite must not depend on the network.
 * The stub returns the two identifiers a checkout is built from and records every call, which is
 * also what lets the assertion below prove the route is no longer creating an unpayable payment.
 */
const paymobStub = vi.hoisted(() => ({
  createCheckout: vi.fn(),
  refundTransaction: vi.fn(),
  invalidateAuthToken: vi.fn(),
}));

const paymobGateway: PaymobGateway = {
  createCheckout: paymobStub.createCheckout,
  refundTransaction: paymobStub.refundTransaction,
  invalidateAuthToken: paymobStub.invalidateAuthToken,
};

describe('Payments E2E', () => {
  let app: INestApplication<Server>;
  let httpServer: Server;
  let accessToken: string;

  beforeAll(async () => {
    paymobStub.createCheckout.mockResolvedValue({
      orderId: 'paymob-order-e2e',
      paymentKey: 'paymob-key-e2e',
      iframeUrl: 'https://accept.paymob.com/acceptance/iframes/paymob-key-e2e?merchant_id=merchant-1',
      acceptUrl: 'https://accept.paymob.com/acceptance/accepts/paymob-key-e2e?merchant_id=merchant-1',
    });

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
      providers: [
        {
          provide: 'REFLECTOR',
          useValue: new Reflector(),
        },
        WinstonLoggerService,
        ValkeyService,
        EventEmitter2,
        UsersRepository,
        {
          provide: USERS_REPOSITORY,
          useExisting: UsersRepository,
        },
      ],
    })
      .overrideProvider(UsersEventHandler)
      .useValue({
        handleUserRegistered: () => Promise.resolve(),
        handleUserUpdated: () => Promise.resolve(),
      })
      .overrideProvider(EncryptionService)
      .useValue({
        encrypt: (plaintext: string) => plaintext,
        decrypt: (ciphertext: string) => ciphertext,
      })
      .overrideProvider(PAYMOB_CLIENT)
      .useValue(paymobGateway)
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
    httpServer = app.getHttpServer();

    await request(httpServer).post('/auth/register').send({
      email: 'e2e-payments@example.com',
      password: 'SecurePass123!',
      name: 'E2E Payments User',
      username: 'e2epayments',
    });

    const loginRes = (await request(httpServer).post('/auth/login').send({
      email: 'e2e-payments@example.com',
      password: 'SecurePass123!',
    })) as JsonResponse<LoginResponseBody>;

    accessToken = loginRes.body.tokens.accessToken;
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('POST /payments', () => {
    it('should create a payment', async () => {
      const res = await request(httpServer)
        .post('/payments')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ amount: 1000, paymentMethod: 'paymob' })
        .expect(201);

      expect(res.body).toHaveProperty('id');
      expect((res.body as PaymentResponseBody).amount).toBe(1000);
    });

    it('registers a Paymob order so the payment can actually be paid', async () => {
      const res = await request(httpServer)
        .post('/payments')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ amount: 2500, paymentMethod: 'paymob' })
        .expect(201);

      const body = res.body as PaymentResponseBody;

      // A payment left in `pending` with no paymobOrderId and no checkout URL can never be paid:
      // no webhook can match an order that was never registered upstream.
      expect(body.status).toBe('processing');
      expect(body.paymobOrderId).toBe('paymob-order-e2e');
      expect(body.paymobPaymentKey).toBe('paymob-key-e2e');
      expect(body.paymobIframeUrl).toContain('paymob-key-e2e');
      expect(paymobStub.createCheckout).toHaveBeenCalledWith(
        expect.objectContaining({ amountCents: 2500, currency: 'EGP' }),
      );

      const [rows] = await db
        .select()
        .from(payments)
        .where(eq(payments.id, body.id));
      expect(rows?.paymobOrderId).toBe('paymob-order-e2e');
    });
  });

  describe('GET /payments', () => {
    it('should return my payments', async () => {
      const res = await request(httpServer).get('/payments').set('Authorization', `Bearer ${accessToken}`).expect(200);

      expect(res.body).toHaveProperty('payments');
      expect(res.body).toHaveProperty('total');
    });
  });
});
