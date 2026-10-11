import type { Server } from 'node:http';

import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { JwtService } from '@nestjs/jwt';
import { ConfigModule } from '@nestjs/config';

import { ValkeyService } from '../../../common/services/valkey.service.ts';
import { WinstonLoggerService } from '../../../common/services/winston-logger.service.ts';
import { RentalsService } from '../rentals.service.ts';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard.ts';
import type { PaymobCheckoutResponse } from '../../payments/types.ts';
import type { CreateRentalRequest, Rental, RentalsListResponse } from '../types.ts';

import { RentalsController } from './rentals.controller.ts';

const JWT_SECRET = 'test-jwt-secret-for-controller-specs';

async function generateToken(sub = 'user-1', email = 'test@example.com', accountType = 'reader'): Promise<string> {
  return new JwtService({ secret: JWT_SECRET }).signAsync({ sub, email, accountType });
}

type RentalsListParams = { status?: string; page?: number; limit?: number };

/**
 * The checkout `extendRental` answers with, plus the `id` the assertion uses to prove which payload
 * the controller passed back untouched. Every field is a real `PaymobCheckoutResponse` field.
 */
type ExtensionCheckout = PaymobCheckoutResponse & { id: string };

type MockRentalsService = {
  createRental: ReturnType<typeof vi.fn<(userId: string, input: CreateRentalRequest) => Promise<Rental>>>;
  findMyRentals: ReturnType<typeof vi.fn<(userId: string, params: RentalsListParams) => Promise<RentalsListResponse>>>;
  findById: ReturnType<typeof vi.fn<(id: string, userId?: string) => Promise<Rental>>>;
  extendRental: ReturnType<
    typeof vi.fn<(id: string, extensionDays: number, userId: string) => Promise<ExtensionCheckout>>
  >;
  returnRental: ReturnType<typeof vi.fn<(id: string, userId: string) => Promise<Rental>>>;
  findOverdue: ReturnType<typeof vi.fn<() => Promise<Rental[]>>>;
};

function makeRental(overrides: Partial<Rental> = {}): Rental {
  return {
    id: 'rental-1',
    userId: 'user-1',
    bookId: 'book-1',
    status: 'active',
    startDate: new Date(),
    endDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    extendedCount: 0,
    maxExtensions: 3,
    returnedAt: null,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeExtensionCheckout(): ExtensionCheckout {
  return {
    id: 'extension-1',
    paymentId: 'payment-1',
    orderId: 'order-1',
    paymentKey: 'payment-key-1',
    iframeUrl: 'https://accept.paymob.com/acceptance/iframes/key-1?merchant_id=merchant-1',
    acceptUrl: 'https://hakawi.example/payments/return',
    status: 'processed',
  };
}

describe('RentalsController', () => {
  let app: INestApplication<Server>;
  let rentalsService: MockRentalsService;

  beforeAll(async () => {
    rentalsService = {
      createRental: vi.fn<(userId: string, input: CreateRentalRequest) => Promise<Rental>>(),
      findMyRentals: vi.fn<(userId: string, params: RentalsListParams) => Promise<RentalsListResponse>>(),
      findById: vi.fn<(id: string, userId?: string) => Promise<Rental>>(),
      extendRental: vi.fn<(id: string, extensionDays: number, userId: string) => Promise<ExtensionCheckout>>(),
      returnRental: vi.fn<(id: string, userId: string) => Promise<Rental>>(),
      findOverdue: vi.fn<() => Promise<Rental[]>>(),
    };

    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, load: [] })],
      controllers: [RentalsController],
      providers: [
        {
          provide: RentalsService,
          useValue: rentalsService,
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
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /rentals', () => {
    it('should create a rental', async () => {
      const token = await generateToken('user-1', 'test@example.com', 'reader');

      vi.mocked(rentalsService.createRental).mockResolvedValue(makeRental());

      const res = await request(app.getHttpServer())
        .post('/rentals')
        .set('Authorization', `Bearer ${token}`)
        .send({ bookId: 'book-1' })
        .expect(201);

      expect(res.body).toHaveProperty('id', 'rental-1');
      expect(rentalsService.createRental).toHaveBeenCalled();
    });
  });

  describe('GET /rentals/my', () => {
    it('should return my rentals', async () => {
      const token = await generateToken('user-1', 'test@example.com', 'reader');

      vi.mocked(rentalsService.findMyRentals).mockResolvedValue({
        rentals: [],
        total: 0,
        page: 1,
        limit: 20,
      });

      const res = await request(app.getHttpServer()).get('/rentals/my').set('Authorization', `Bearer ${token}`).expect(200);

      expect(res.body).toHaveProperty('rentals');
      expect(rentalsService.findMyRentals).toHaveBeenCalled();
    });
  });

  describe('GET /rentals/:id', () => {
    it('should return a rental by id', async () => {
      const token = await generateToken('user-1', 'test@example.com', 'reader');

      vi.mocked(rentalsService.findById).mockResolvedValue(makeRental());

      const res = await request(app.getHttpServer())
        .get('/rentals/rental-1')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body).toHaveProperty('id', 'rental-1');
      expect(rentalsService.findById).toHaveBeenCalledWith('rental-1', 'user-1');
    });
  });

  describe('POST /rentals/:id/extend', () => {
    it('should extend a rental', async () => {
      const token = await generateToken('user-1', 'test@example.com', 'reader');

      vi.mocked(rentalsService.extendRental).mockResolvedValue(makeExtensionCheckout());

      const res = await request(app.getHttpServer())
        .post('/rentals/rental-1/extend')
        .set('Authorization', `Bearer ${token}`)
        .send({ extensionDays: 7 })
        .expect(200);

      expect(res.body).toHaveProperty('id', 'extension-1');
      expect(rentalsService.extendRental).toHaveBeenCalledWith('rental-1', 7, 'user-1');
    });
  });

  describe('POST /rentals/:id/return', () => {
    it('should return a rental', async () => {
      const token = await generateToken('user-1', 'test@example.com', 'reader');

      vi.mocked(rentalsService.returnRental).mockResolvedValue(makeRental({ status: 'returned', returnedAt: new Date() }));

      const res = await request(app.getHttpServer())
        .post('/rentals/rental-1/return')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body).toHaveProperty('status', 'returned');
      expect(rentalsService.returnRental).toHaveBeenCalledWith('rental-1', 'user-1');
    });
  });
});
