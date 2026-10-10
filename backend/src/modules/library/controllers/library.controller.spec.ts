import type { Server } from 'http';

import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { ValkeyService } from '../../../common/services/valkey.service.ts';
import { WinstonLoggerService } from '../../../common/services/winston-logger.service.ts';
import { JwtService } from '@nestjs/jwt';
import { ConfigModule } from '@nestjs/config';

import { LibraryService } from '../library.service.ts';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard.ts';

import { LibraryController } from './library.controller.ts';

// vi.mocked() returns `any` when the mock property is typed ReturnType<typeof vi.fn> (= any).
// This is a vitest typing limitation — mocks are correctly typed and tests pass.
/* eslint-disable @typescript-eslint/no-non-null-assertion */

const JWT_SECRET = 'test-jwt-secret-for-controller-specs';

async function generateToken(sub = 'user-1', email = 'test@example.com', accountType = 'reader'): Promise<string> {
  return new JwtService({ secret: JWT_SECRET }).signAsync({ sub, email, accountType });
}

type MockLibraryService = {
  addToLibrary: ReturnType<typeof vi.fn>;
  // The only HTTP path to an entitlement for a free book. `POST /library` is gone: it wrote an
  // `owned` row for any book id without checking price or payment.
  claimFreeBook: ReturnType<typeof vi.fn>;
  findMyLibrary: ReturnType<typeof vi.fn>;
  count: ReturnType<typeof vi.fn>;
  accessItem: ReturnType<typeof vi.fn>;
  removeFromLibrary: ReturnType<typeof vi.fn>;
};

/** A v4 UUID, because `AddToLibraryDto.bookId` is `@IsUUID('4')` and this spec now installs the
 *  global `ValidationPipe` that `main.ts` installs — so the decorator is actually exercised. */
const CLAIM_BOOK_ID = '11111111-1111-4111-8111-111111111111';

describe('LibraryController', () => {
  let app: INestApplication;
  let httpServer: Server;
  let libraryService: MockLibraryService;

  beforeAll(async () => {
    libraryService = {
      addToLibrary: vi.fn(),
      claimFreeBook: vi.fn(),
      findMyLibrary: vi.fn(),
      count: vi.fn(),
      accessItem: vi.fn(),
      removeFromLibrary: vi.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, load: [] })],
      controllers: [LibraryController],
      providers: [
        {
          provide: LibraryService,
          useValue: libraryService,
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
    // The same pipe `main.ts` installs, with the same options. Without it the decorators on
    // `AddToLibraryDto` are never executed, so this spec asserted a 201 for a request that
    // production answers with 400.
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
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

  /**
   * `POST /library` IS REMOVED, AND THESE TESTS ARE WHY THAT MATTERS.
   *
   * The route accepted `{ bookId }` and wrote a `library` row with `status: 'owned'` — no price check,
   * no payment check, no check the book existed for sale. So `POST /api/v1/library { "bookId": "..." }`
   * granted permanent ownership of a PAID book to any authenticated caller, for nothing. The test below
   * asserted it worked, precisely, and was green.
   *
   * A test asserting a flow end-to-end is valuable. A test asserting that an UNPAID flow completes is
   * a test that pins the absence of the check. So the route is gone, and what replaces it is the free-book
   * claim — which verifies `is_free` first, and a paid book arrives only through a completed payment.
   */
  describe('POST /library (removed)', () => {
    it('should no longer accept a book id', async () => {
      const token = await generateToken('user-1', 'test@example.com', 'reader');

      // 404 rather than 405: the route is not registered at all, so Nest's router does not match it.
      await request(httpServer)
        .post('/library')
        .set('Authorization', `Bearer ${token}`)
        .send({ bookId: 'book-1' })
        .expect(404);

      expect(libraryService.addToLibrary).not.toHaveBeenCalled();
    });
  });

  describe('POST /library/claim', () => {
    it('should add a FREE book to the library', async () => {
      const token = await generateToken('user-1', 'test@example.com', 'reader');

      vi.mocked(libraryService.claimFreeBook).mockResolvedValue({
        id: 'lib-1',
        userId: 'user-1',
        bookId: CLAIM_BOOK_ID,
        rentalId: null,
        status: 'owned',
        addedAt: new Date(),
        lastAccessedAt: null,
      });

      const res = await request(httpServer)
        .post('/library/claim')
        .set('Authorization', `Bearer ${token}`)
        .send({ bookId: CLAIM_BOOK_ID })
        .expect(201);

      expect(res.body).toHaveProperty('id', 'lib-1');
      // A real UUID: `AddToLibraryDto.bookId` carries `@IsUUID('4')`, and with the global pipe now
      // installed in this spec that decorator actually runs — which is why the original
      // `'book-1'` fixture would now be refused with a 400, correctly.
      expect(libraryService.claimFreeBook).toHaveBeenCalledWith('user-1', CLAIM_BOOK_ID);
    });

    it('should reject a claim without authentication', async () => {
      await request(httpServer).post('/library/claim').send({ bookId: 'book-1' }).expect(401);

      expect(libraryService.claimFreeBook).not.toHaveBeenCalled();
    });

    it('should reject a claim with no book id', async () => {
      const token = await generateToken('user-1', 'test@example.com', 'reader');

      await request(httpServer).post('/library/claim').set('Authorization', `Bearer ${token}`).send({}).expect(400);

      expect(libraryService.claimFreeBook).not.toHaveBeenCalled();
    });
  });

  describe('POST /library/:id/access', () => {
    it('should access library item', async () => {
      const token = await generateToken('user-1', 'test@example.com', 'reader');

      vi.mocked(libraryService.accessItem).mockResolvedValue({
        id: 'lib-1',
        userId: 'user-1',
        bookId: 'book-1',
        rentalId: null,
        status: 'reading',
        addedAt: new Date(),
        lastAccessedAt: new Date(),
      });

      const res = await request(httpServer)
        .post('/library/lib-1/access')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body).toHaveProperty('status', 'reading');
      expect(libraryService.accessItem).toHaveBeenCalledWith('lib-1', 'user-1');
    });
  });

  describe('DELETE /library/:id', () => {
    it('should remove item from library', async () => {
      const token = await generateToken('user-1', 'test@example.com', 'reader');

      vi.mocked(libraryService.removeFromLibrary).mockResolvedValue(undefined);

      await request(httpServer).delete('/library/lib-1').set('Authorization', `Bearer ${token}`).expect(204);

      expect(libraryService.removeFromLibrary).toHaveBeenCalled();
    });
  });
});
