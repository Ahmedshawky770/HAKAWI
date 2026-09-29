import type { Server } from 'http';

import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { JwtService } from '@nestjs/jwt';
import { ConfigModule } from '@nestjs/config';

import { RentalsService } from '../rentals.service.ts';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard.ts';
import type { Rental } from '../types.ts';

import { RentalsController } from './rentals.controller.ts';

// vi.mocked() returns `any` when the mock property is typed ReturnType<typeof vi.fn> (= any).
// This is a vitest typing limitation — mocks are correctly typed and tests pass.
/* eslint-disable @typescript-eslint/no-non-null-assertion */

const JWT_SECRET = 'test-jwt-secret-for-controller-specs';

async function generateToken(sub = 'user-1', email = 'test@example.com', accountType = 'reader'): Promise<string> {
  return new JwtService({ secret: JWT_SECRET }).signAsync({ sub, email, accountType });
}

type MockRentalsService = {
  createRental: ReturnType<typeof vi.fn>;
  findMyRentals: ReturnType<typeof vi.fn>;
  findById: ReturnType<typeof vi.fn>;
  extendRental: ReturnType<typeof vi.fn>;
  returnRental: ReturnType<typeof vi.fn>;
  findOverdue: ReturnType<typeof vi.fn>;
};

describe('RentalsController', () => {
  let app: INestApplication;
  let httpServer: Server;
  let rentalsService: MockRentalsService;

  beforeAll(async () => {
    rentalsService = {
      createRental: vi.fn(),
      findMyRentals: vi.fn(),
      findById: vi.fn(),
      extendRental: vi.fn(),
      returnRental: vi.fn(),
      findOverdue: vi.fn(),
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

  describe('POST /rentals', () => {
    it('should create a rental', async () => {
      const token = await generateToken('user-1', 'test@example.com', 'reader');

      vi.mocked(rentalsService.createRental).mockResolvedValue({
        id: 'rental-1',
        userId: 'user-1',
        bookId: 'book-1',
        status: 'active',
        startDate: new Date(),
        endDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
        extendedCount: 0,
        maxExtensions: 3,
        returnedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
       } as unknown as Rental);

      const res = await request(httpServer)
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

      const res = await request(httpServer)
        .get('/rentals/my')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body).toHaveProperty('rentals');
      expect(rentalsService.findMyRentals).toHaveBeenCalled();
    });
  });

  describe('GET /rentals/:id', () => {
    it('should return a rental by id', async () => {
      const token = await generateToken('user-1', 'test@example.com', 'reader');

      vi.mocked(rentalsService.findById).mockResolvedValue({
        id: 'rental-1',
        userId: 'user-1',
        bookId: 'book-1',
        status: 'active',
        startDate: new Date(),
        endDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
        extendedCount: 0,
        maxExtensions: 3,
        returnedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
       } as unknown as Rental);

      const res = await request(httpServer)
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

      vi.mocked(rentalsService.extendRental).mockResolvedValue({
        id: 'extension-1',
        rentalId: 'rental-1',
        previousEndDate: new Date(),
        newEndDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
        extensionDays: 7,
        createdAt: new Date(),
      });

      const res = await request(httpServer)
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

      vi.mocked(rentalsService.returnRental).mockResolvedValue({
        id: 'rental-1',
        userId: 'user-1',
        bookId: 'book-1',
        status: 'returned',
        startDate: new Date(),
        endDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
        extendedCount: 0,
        maxExtensions: 3,
        returnedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
       } as unknown as Rental);

      const res = await request(httpServer)
        .post('/rentals/rental-1/return')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body).toHaveProperty('status', 'returned');
      expect(rentalsService.returnRental).toHaveBeenCalledWith('rental-1', 'user-1');
    });
  });

});
