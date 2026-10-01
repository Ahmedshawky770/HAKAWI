import type { Server } from 'http';

import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
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
  findMyLibrary: ReturnType<typeof vi.fn>;
  count: ReturnType<typeof vi.fn>;
  accessItem: ReturnType<typeof vi.fn>;
  removeFromLibrary: ReturnType<typeof vi.fn>;
};

describe('LibraryController', () => {
  let app: INestApplication;
  let httpServer: Server;
  let libraryService: MockLibraryService;

  beforeAll(async () => {
    libraryService = {
      addToLibrary: vi.fn(),
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

  describe('POST /library', () => {
    it('should add item to library', async () => {
      const token = await generateToken('user-1', 'test@example.com', 'reader');

      vi.mocked(libraryService.addToLibrary).mockResolvedValue({
        id: 'lib-1',
        userId: 'user-1',
        bookId: 'book-1',
        rentalId: null,
        status: 'owned',
        addedAt: new Date(),
        lastAccessedAt: null,
      });

      const res = await request(httpServer)
        .post('/library')
        .set('Authorization', `Bearer ${token}`)
        .send({ bookId: 'book-1' })
        .expect(201);

      expect(res.body).toHaveProperty('id', 'lib-1');
      expect(libraryService.addToLibrary).toHaveBeenCalled();
    });
  });

  describe('GET /library', () => {
    it('should return my library', async () => {
      const token = await generateToken('user-1', 'test@example.com', 'reader');

      vi.mocked(libraryService.findMyLibrary).mockResolvedValue({
        items: [],
        total: 0,
        page: 1,
        limit: 20,
      });

      const res = await request(httpServer).get('/library').set('Authorization', `Bearer ${token}`).expect(200);

      expect(res.body).toHaveProperty('items');
      expect(res.body).toHaveProperty('total', 0);
      expect(libraryService.findMyLibrary).toHaveBeenCalled();
    });
  });

  describe('GET /library/count', () => {
    it('should return library count', async () => {
      const token = await generateToken('user-1', 'test@example.com', 'reader');

      vi.mocked(libraryService.count).mockResolvedValue({ count: 5 });

      const res = await request(httpServer).get('/library/count').set('Authorization', `Bearer ${token}`).expect(200);

      expect(res.body).toEqual({ count: 5 });
      expect(libraryService.count).toHaveBeenCalledWith('user-1');
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
