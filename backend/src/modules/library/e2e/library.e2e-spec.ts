import { type Server } from 'http';

import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { EventEmitter2 } from '@nestjs/event-emitter';
import request from 'supertest';

import { AppModule } from '../../../app.module.ts';
import { WinstonLoggerService } from '../../../common/services/winston-logger.service.ts';
import { ValkeyService } from '../../../common/services/valkey.service.ts';
import { EncryptionService } from '../../../common/utils/encryption.util.ts';
import { UsersRepository } from '../../../modules/users/repositories/users.repository.ts';
import { USERS_REPOSITORY } from '../../../modules/users/interfaces/users-repository.interface.ts';
import { UsersEventHandler } from '../../../modules/users/events/users.event-handler.ts';
import { books } from '../../../db/schema/books.schema.ts';
import { library } from '../../../db/schema/library.schema.ts';

// drizzle-ORM db and sql template tags, plus supertest response chains, are typed as `any` by their libraries.
// Accepted external-library typing limitations — no production code change.
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument */

describe('Library E2E', () => {
  let app: INestApplication;
  let httpServer: Server;
  let accessToken: string;
  let freeBookId: string;
  let paidBookId: string;

  beforeAll(async () => {
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
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
    httpServer = app.getHttpServer() as Server;

    await request(httpServer).post('/auth/register').send({
      email: 'e2e-library@example.com',
      password: 'SecurePass123!',
      name: 'E2E Library User',
      username: 'e2elibrary',
    });

    const loginRes = await request(httpServer).post('/auth/login').send({
      email: 'e2e-library@example.com',
      password: 'SecurePass123!',
    });

    accessToken = loginRes.body.tokens.accessToken;

    // `books.is_free` defaults to TRUE (`db/schema/books.schema.ts`), so the free case is the
    // catalogue's default state and is left unstated. The paid book has to be explicit, because the
    // whole point of `POST /library/claim` is that it refuses `is_free = false` — a fixture where
    // every book is free could not tell the two apart.
    const freeBookRes = await request(httpServer)
      .post('/books')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ title: 'E2E Library Free Book', author: 'Test Author' });

    freeBookId = freeBookRes.body.id as string;

    const paidBookRes = await request(httpServer)
      .post('/books')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ title: 'E2E Library Paid Book', author: 'Test Author', price: 149, isFree: false });

    paidBookId = paidBookRes.body.id as string;
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  /**
   * WHY THIS USES `/library/claim` AND NOT `POST /library`.
   *
   * The old route took `{ bookId }` and wrote a `library` row with `status: 'owned'` after checking
   * nothing at all — so any authenticated account could grant itself permanent ownership of a paid
   * book, for nothing. It was deleted, and `LibraryController` now carries a comment saying its absence
   * is the point. `LibraryService.claimFreeBook` is the replacement and it re-reads the book and
   * refuses `is_free = false`, so the three cases below are the ones that distinguish the fixed route
   * from the hole.
   */
  describe('POST /library/claim', () => {
    it('should add a free book to the library', async () => {
      const res = await request(httpServer)
        .post('/library/claim')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ bookId: freeBookId })
        .expect(201);

      expect(res.body).toHaveProperty('id');
      expect(res.body.status).toBe('owned');
    });

    it('should refuse a book that is not free', async () => {
      await request(httpServer)
        .post('/library/claim')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ bookId: paidBookId })
        .expect(403);
    });

    it('should refuse an anonymous caller', async () => {
      await request(httpServer).post('/library/claim').send({ bookId: paidBookId }).expect(401);
    });
  });

  /**
   * THE REGRESSION PIN FOR THE REMOVED ROUTE.
   *
   * Without this, re-adding `POST @Post()` on `LibraryController` — a two-line change that looks
   * like a harmless convenience — would put the whole hole back and every other assertion in this
   * file would still pass, because they all go through `/library/claim`. The 404 is the assertion.
   */
  describe('POST /library (removed)', () => {
    it('should no longer exist', async () => {
      await request(httpServer)
        .post('/library')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ bookId: paidBookId })
        .expect(404);
    });
  });

  describe('GET /library', () => {
    it('should return my library', async () => {
      const res = await request(httpServer).get('/library').set('Authorization', `Bearer ${accessToken}`).expect(200);

      expect(res.body).toHaveProperty('items');
      expect(res.body).toHaveProperty('total');
    });
  });
});
