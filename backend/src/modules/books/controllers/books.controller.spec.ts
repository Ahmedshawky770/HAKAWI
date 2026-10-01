import type { Server } from 'http';

import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { JwtService } from '@nestjs/jwt';
import { ConfigModule } from '@nestjs/config';

import { BooksService } from '../books.service.ts';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard.ts';
import type { Book } from '../types.ts';

import { BooksController } from './books.controller.ts';

type MockBooksService = {
  findAll: ReturnType<typeof vi.fn>;
  findById: ReturnType<typeof vi.fn>;
  findByIsbn: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  publish: ReturnType<typeof vi.fn>;
  archive: ReturnType<typeof vi.fn>;
  incrementDownloadCount: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
};

// vi.mocked() returns `any` when the mock property is typed ReturnType<typeof vi.fn> (= any).
// This is a vitest typing limitation — mocks are correctly typed and tests pass.
/* eslint-disable @typescript-eslint/no-non-null-assertion */

const JWT_SECRET = 'test-jwt-secret-for-controller-specs';

async function generateToken(sub = 'user-1', email = 'test@example.com', accountType = 'reader'): Promise<string> {
  return new JwtService({ secret: JWT_SECRET }).signAsync({ sub, email, accountType });
}

describe('BooksController', () => {
  let app: INestApplication;
  let httpServer: Server;
  let booksService: MockBooksService;

  beforeAll(async () => {
    booksService = {
      findAll: vi.fn(),
      findById: vi.fn(),
      findByIsbn: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      publish: vi.fn(),
      archive: vi.fn(),
      incrementDownloadCount: vi.fn(),
      delete: vi.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, load: [] })],
      controllers: [BooksController],
      providers: [
        {
          provide: BooksService,
          useValue: booksService,
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

  describe('GET /books', () => {
    it('should return paginated books', async () => {
      vi.mocked(booksService.findAll).mockResolvedValue({
        books: [],
        total: 0,
        page: 1,
        limit: 20,
      });

      const res = await request(httpServer).get('/books').expect(200);

      expect(res.body).toHaveProperty('books');
      expect(res.body).toHaveProperty('total', 0);
      expect(booksService.findAll).toHaveBeenCalled();
    });
  });

  describe('GET /books/:id', () => {
    it('should return a book by id', async () => {
      vi.mocked(booksService.findById).mockResolvedValue({
        id: 'book-1',
        title: 'Test Book',
        author: 'Test Author',
        status: 'published',
        viewCount: 0,
        likeCount: 0,
        downloadCount: 0,
        deletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as unknown as Book);

      const res = await request(httpServer).get('/books/book-1').expect(200);

      expect(res.body).toHaveProperty('id', 'book-1');
      expect(booksService.findById).toHaveBeenCalledWith('book-1');
    });
  });

  describe('GET /books/isbn/:isbn', () => {
    it('should return a book by isbn', async () => {
      vi.mocked(booksService.findByIsbn).mockResolvedValue({
        id: 'book-1',
        title: 'Test Book',
        isbn: '9781234567890',
        status: 'published',
        viewCount: 0,
        likeCount: 0,
        downloadCount: 0,
        deletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as unknown as Book);

      const res = await request(httpServer).get('/books/isbn/9781234567890').expect(200);

      expect(res.body).toHaveProperty('isbn', '9781234567890');
      expect(booksService.findByIsbn).toHaveBeenCalledWith('9781234567890');
    });
  });

  describe('POST /books', () => {
    it('should create a book', async () => {
      const token = await generateToken('user-1', 'test@example.com', 'author');

      vi.mocked(booksService.create).mockResolvedValue({
        id: 'book-1',
        title: 'Test Book',
        author: 'Test Author',
        status: 'draft',
        viewCount: 0,
        likeCount: 0,
        downloadCount: 0,
        deletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as unknown as Book);

      const res = await request(httpServer)
        .post('/books')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'Test Book', author: 'Test Author' })
        .expect(201);

      expect(res.body).toHaveProperty('id', 'book-1');
      expect(booksService.create).toHaveBeenCalled();
    });
  });

  describe('PATCH /books/:id', () => {
    it('should update a book', async () => {
      const token = await generateToken('user-1', 'test@example.com', 'author');

      vi.mocked(booksService.update).mockResolvedValue({
        id: 'book-1',
        title: 'Updated Book',
        author: 'Test Author',
        status: 'draft',
        viewCount: 0,
        likeCount: 0,
        downloadCount: 0,
        deletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as unknown as Book);

      const res = await request(httpServer)
        .patch('/books/book-1')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'Updated Book' })
        .expect(200);

      expect(res.body).toHaveProperty('title', 'Updated Book');
      expect(booksService.update).toHaveBeenCalled();
    });
  });

  describe('POST /books/:id/publish', () => {
    it('should publish a book', async () => {
      const token = await generateToken('user-1', 'test@example.com', 'author');

      vi.mocked(booksService.publish).mockResolvedValue({
        id: 'book-1',
        title: 'Test Book',
        status: 'published',
        viewCount: 0,
        likeCount: 0,
        downloadCount: 0,
        deletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as unknown as Book);

      const res = await request(httpServer)
        .post('/books/book-1/publish')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body).toHaveProperty('status', 'published');
      expect(booksService.publish).toHaveBeenCalledWith('book-1', 'user-1');
    });
  });

  describe('POST /books/:id/download', () => {
    it('should increment download count and return URL', async () => {
      const token = await generateToken('user-1', 'test@example.com', 'reader');

      vi.mocked(booksService.incrementDownloadCount).mockResolvedValue(undefined);
      vi.mocked(booksService.findById).mockResolvedValue({
        id: 'book-1',
        title: 'Test Book',
        fileUrl: 'https://s3.amazonaws.com/bucket/book.pdf',
        status: 'published',
        viewCount: 0,
        likeCount: 0,
        downloadCount: 1,
        deletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as unknown as Book);

      const res = await request(httpServer)
        .post('/books/book-1/download')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body).toHaveProperty('downloadUrl');
      expect(booksService.incrementDownloadCount).toHaveBeenCalledWith('book-1');
    });
  });

  describe('DELETE /books/:id', () => {
    it('should delete a book', async () => {
      const token = await generateToken('user-1', 'test@example.com', 'author');

      vi.mocked(booksService.delete).mockResolvedValue(undefined);

      await request(httpServer).delete('/books/book-1').set('Authorization', `Bearer ${token}`).expect(204);

      expect(booksService.delete).toHaveBeenCalledWith('book-1', 'user-1');
    });
  });
});
