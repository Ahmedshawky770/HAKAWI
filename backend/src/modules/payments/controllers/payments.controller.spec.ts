import type { Server } from 'http';

import { describe, it, expect, vi, beforeAll, beforeEach, afterAll, afterEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { INestApplication, ServiceUnavailableException, BadRequestException, NotFoundException } from '@nestjs/common';
import request from 'supertest';
import { ValkeyService } from '../../../common/services/valkey.service.ts';
import { WinstonLoggerService } from '../../../common/services/winston-logger.service.ts';
import { JwtService } from '@nestjs/jwt';
import { ConfigModule } from '@nestjs/config';

import { PaymentsService } from '../payments.service.ts';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard.ts';
import type { Payment, Refund } from '../interfaces/payments-repository.interface.ts';

import { PaymentsController } from './payments.controller.ts';

// vi.mocked() returns `any` when the mock property is typed ReturnType<typeof vi.fn> (= any).
// This is a vitest typing limitation — mocks are correctly typed and tests pass.
/* eslint-disable @typescript-eslint/no-non-null-assertion */

const JWT_SECRET = 'test-jwt-secret-for-controller-specs';

async function generateToken(
  sub = 'user-1',
  email = 'test@example.com',
  accountType = 'reader',
  adminRole?: string,
): Promise<string> {
  const payload: Record<string, unknown> = { sub, email, accountType };
  if (adminRole) {
    payload.adminRole = adminRole;
  }
  return new JwtService({ secret: JWT_SECRET }).signAsync(payload);
}

type MockPaymentsService = {
  createPayment: ReturnType<typeof vi.fn>;
  findById: ReturnType<typeof vi.fn>;
  findAll: ReturnType<typeof vi.fn>;
  updateStatus: ReturnType<typeof vi.fn>;
  createRefund: ReturnType<typeof vi.fn>;
  getRefunds: ReturnType<typeof vi.fn>;
};

describe('PaymentsController', () => {
  let app: INestApplication;
  let httpServer: Server;
  let paymentsService: MockPaymentsService;

  beforeAll(async () => {
    paymentsService = {
      createPayment: vi.fn(),
      findById: vi.fn(),
      findAll: vi.fn(),
      updateStatus: vi.fn(),
      createRefund: vi.fn(),
      getRefunds: vi.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, load: [] })],
      controllers: [PaymentsController],
      providers: [
        {
          provide: PaymentsService,
          useValue: paymentsService,
        },
        JwtAuthGuard,
        {
          provide: JwtService,
          useValue: new JwtService({ secret: JWT_SECRET }),
        },
        // `@Secured` composes `RestrictionGuard`, which injects `ValkeyService` and the logger.
        // This module is hand-built rather than importing `CommonModule`, so both must be provided
        // here or Nest fails at DI resolution before any assertion runs.
        { provide: ValkeyService, useValue: { exists: vi.fn().mockResolvedValue(false), get: vi.fn(), set: vi.fn() } },
        {
          provide: WinstonLoggerService,
          useValue: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn(), log: vi.fn(), verbose: vi.fn() },
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
    httpServer = app.getHttpServer() as Server;
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /payments', () => {
    it('should create a payment', async () => {
      const token = await generateToken('user-1', 'test@example.com', 'reader');

      vi.mocked(paymentsService.createPayment).mockResolvedValue({
        id: 'payment-1',
        userId: 'user-1',
        amount: 100,
        currency: 'EGP',
        status: 'processing',
        paymentMethod: 'paymob',
        paymobIframeUrl: 'https://accept.paymob.com/acceptance/iframes/key-1?merchant_id=merchant-1',
        createdAt: new Date(),
        updatedAt: new Date(),
      } as unknown as Payment);

      const res = await request(httpServer)
        .post('/payments')
        .set('Authorization', `Bearer ${token}`)
        .send({ amount: 100, paymentMethod: 'paymob' })
        .expect(201);

      expect(res.body).toHaveProperty('id', 'payment-1');
      expect(paymentsService.createPayment).toHaveBeenCalled();
    });

    it('initialises the gateway so the returned payment can actually be paid', async () => {
      const token = await generateToken('user-1', 'test@example.com', 'reader');
      vi.mocked(paymentsService.createPayment).mockResolvedValue({} as Payment);

      await request(httpServer)
        .post('/payments')
        .set('Authorization', `Bearer ${token}`)
        .send({ amount: 100, paymentMethod: 'paymob' })
        .expect(201);

      // Without this the endpoint leaves a `pending` payment with no paymobOrderId and no checkout
      // URL, and no webhook can ever match it.
      expect(paymentsService.createPayment).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'user-1', amount: 100, paymentMethod: 'paymob' }),
        { initializeGateway: true },
      );
    });

    it('derives the owner from the token and not from the body', async () => {
      const token = await generateToken('user-1', 'test@example.com', 'reader');
      vi.mocked(paymentsService.createPayment).mockResolvedValue({} as Payment);

      await request(httpServer)
        .post('/payments')
        .set('Authorization', `Bearer ${token}`)
        .send({ amount: 100, paymentMethod: 'paymob' })
        .expect(201);

      const calls = vi.mocked(paymentsService.createPayment).mock.calls as unknown as [
        Record<string, unknown>,
        unknown,
      ][];
      expect(calls[0]?.[0]).toMatchObject({ userId: 'user-1' });
      // The owner comes from the JWT subject; nothing in the body can name somebody else's account.
      expect(calls[0]?.[0]).not.toHaveProperty('userId', 'someone-else');
    });
  });

  describe('GET /payments/:id', () => {
    it('should return a payment by id', async () => {
      const token = await generateToken('user-1', 'test@example.com', 'reader');

      vi.mocked(paymentsService.findById).mockResolvedValue({
        id: 'payment-1',
        userId: 'user-1',
        amount: 100,
        currency: 'EGP',
        status: 'pending',
        paymentMethod: 'paymob',
        createdAt: new Date(),
        updatedAt: new Date(),
      } as unknown as Payment);

      const res = await request(httpServer)
        .get('/payments/payment-1')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body).toHaveProperty('id', 'payment-1');
      expect(paymentsService.findById).toHaveBeenCalledWith('payment-1');
    });
  });

  describe('GET /payments', () => {
    it('should return paginated payments', async () => {
      const token = await generateToken('user-1', 'test@example.com', 'reader');

      vi.mocked(paymentsService.findAll).mockResolvedValue({
        payments: [],
        total: 0,
        page: 1,
        limit: 20,
      });

      const res = await request(httpServer).get('/payments').set('Authorization', `Bearer ${token}`).expect(200);

      expect(res.body).toHaveProperty('payments');
      expect(res.body).toHaveProperty('total', 0);
      expect(paymentsService.findAll).toHaveBeenCalled();
    });
  });

  describe('PATCH /payments/:id/status', () => {
    it('should update payment status as admin', async () => {
      const token = await generateToken('user-1', 'test@example.com', 'admin', 'super_admin');

      vi.mocked(paymentsService.updateStatus).mockResolvedValue({
        id: 'payment-1',
        status: 'completed',
        createdAt: new Date(),
        updatedAt: new Date(),
      } as unknown as Payment);

      const res = await request(httpServer)
        .patch('/payments/payment-1/status')
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'completed' })
        .expect(200);

      expect(res.body).toHaveProperty('status', 'completed');
      expect(paymentsService.updateStatus).toHaveBeenCalledWith('payment-1', 'completed');
    });
  });

  describe('POST /payments/:id/refund', () => {
    const adminToken = (): Promise<string> => generateToken('user-1', 'test@example.com', 'admin', 'super_admin');

    const ownedPayment = { id: 'payment-1', userId: 'user-1' } as Payment;

    beforeEach(() => {
      vi.mocked(paymentsService.findById).mockResolvedValue(ownedPayment);
    });

    it('should create a refund as admin', async () => {
      vi.mocked(paymentsService.createRefund).mockResolvedValue({
        id: 'refund-1',
        paymentId: 'payment-1',
        amount: 100,
        status: 'pending',
        createdAt: new Date(),
      } as unknown as Refund);

      const res = await request(httpServer)
        .post('/payments/payment-1/refund')
        .set('Authorization', `Bearer ${await adminToken()}`)
        .send({ amount: 100 })
        .expect(201);

      expect(res.body).toHaveProperty('id', 'refund-1');
      expect(paymentsService.createRefund).toHaveBeenCalled();
    });

    it('answers 503, not 201, when the gateway refuses the refund', async () => {
      // The route is `@HttpCode(HttpStatus.CREATED)`. The service used to swallow the gateway failure
      // and return a refund row with `status: 'failed'`, so a refund that never left the building was
      // reported to the caller as a created resource.
      vi.mocked(paymentsService.createRefund).mockRejectedValue(
        new ServiceUnavailableException('The payment gateway refused the refund, so it was not submitted: HTTP 422'),
      );

      const res = await request(httpServer)
        .post('/payments/payment-1/refund')
        .set('Authorization', `Bearer ${await adminToken()}`)
        .send({ amount: 100 })
        .expect(503);

      expect((res.body as { message: string }).message).toMatch(/HTTP 422/);
    });

    it('answers 400, not 201, when the refund cannot be admitted', async () => {
      vi.mocked(paymentsService.createRefund).mockRejectedValue(
        new BadRequestException(
          'Refund amount 700 exceeds the remaining refundable amount 600 (400 of 1000 already refunded)',
        ),
      );

      const res = await request(httpServer)
        .post('/payments/payment-1/refund')
        .set('Authorization', `Bearer ${await adminToken()}`)
        .send({ amount: 700 })
        .expect(400);

      expect((res.body as { message: string }).message).toMatch(/already refunded/);
    });

    it('answers 400 when the payment has no Paymob transaction id', async () => {
      vi.mocked(paymentsService.createRefund).mockRejectedValue(
        new BadRequestException('The payment cannot be refunded because it has no Paymob transaction id'),
      );

      await request(httpServer)
        .post('/payments/payment-1/refund')
        .set('Authorization', `Bearer ${await adminToken()}`)
        .send({ amount: 100 })
        .expect(400);
    });

    it('answers 404 for a payment that does not exist', async () => {
      vi.mocked(paymentsService.findById).mockRejectedValue(new NotFoundException('Payment not found'));

      await request(httpServer)
        .post('/payments/payment-1/refund')
        .set('Authorization', `Bearer ${await adminToken()}`)
        .send({ amount: 100 })
        .expect(404);
    });

    it('answers 403 for a payment owned by somebody else', async () => {
      vi.mocked(paymentsService.findById).mockResolvedValue({ id: 'payment-1', userId: 'someone-else' } as Payment);

      await request(httpServer)
        .post('/payments/payment-1/refund')
        .set('Authorization', `Bearer ${await generateToken('user-1', 'test@example.com', 'reader')}`)
        .send({ amount: 100 })
        .expect(403);

      expect(paymentsService.createRefund).not.toHaveBeenCalled();
    });
  });

  describe('GET /payments/:id/refunds', () => {
    it('should return refunds for a payment', async () => {
      const token = await generateToken('user-1', 'test@example.com', 'reader');

      vi.mocked(paymentsService.getRefunds).mockResolvedValue([]);

      const res = await request(httpServer)
        .get('/payments/payment-1/refunds')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body).toEqual([]);
      expect(paymentsService.getRefunds).toHaveBeenCalledWith('payment-1');
    });
  });
});
