import type { Server } from 'http';

import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
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

async function generateToken(sub = 'user-1', email = 'test@example.com', accountType = 'reader', adminRole?: string): Promise<string> {
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
        status: 'pending',
        paymentMethod: 'paymob',
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

      const res = await request(httpServer)
        .get('/payments')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

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
    it('should create a refund as admin', async () => {
      const token = await generateToken('user-1', 'test@example.com', 'admin', 'super_admin');

      vi.mocked(paymentsService.createRefund).mockResolvedValue({
        id: 'refund-1',
        paymentId: 'payment-1',
        amount: 100,
        status: 'pending',
        createdAt: new Date(),
       } as unknown as Refund);

      const res = await request(httpServer)
        .post('/payments/payment-1/refund')
        .set('Authorization', `Bearer ${token}`)
        .send({ amount: 100 })
        .expect(201);

      expect(res.body).toHaveProperty('id', 'refund-1');
      expect(paymentsService.createRefund).toHaveBeenCalled();
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
