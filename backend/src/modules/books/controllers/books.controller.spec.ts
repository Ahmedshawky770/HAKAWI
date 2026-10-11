import type { Server } from 'node:http';

import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { JwtService } from '@nestjs/jwt';
import { ConfigModule } from '@nestjs/config';

import { ValkeyService } from '../../../common/services/valkey.service.ts';
import { WinstonLoggerService } from '../../../common/services/winston-logger.service.ts';
import { BooksService } from '../books.service.ts';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard.ts';
import type { Book, BooksListResponse, CreateBookInput, UpdateBookInput } from '../types.ts';

import { BooksController } from './books.controller.ts';

const JWT_SECRET = 'test-jwt-secret-for-controller-specs';

type BooksFindAllParams = {
  page?: number;
  limit?: number;
  categoryId?: string;
  status?: string;
  search?: string;
  author?: string;
};

async function generateToken(sub = 'user-1', email = 'test@example.com', accountType = 'reader'): Promise<string> {
  return new JwtService({ secret: JWT_SECRET }).signAsync({ sub, email, accountType });
}

type MockBooksService = {
  findAll: ReturnType<typeof vi.fn<(params: BooksFindAllParams) => Promise<BooksListResponse>>>;
  findById: ReturnType<typeof vi.fn<(id: string) => Promise<Book>>>;
  findByIsbn: ReturnType<typeof vi.fn<(isbn: string) => Promise<Book>>>;
  create: ReturnType<typeof vi.fn<(userId: string, input: CreateBookInput) => Promise<Book>>>;
  update: ReturnType<typeof vi.fn<(id: string, input: UpdateBookInput, userId: string) => Promise<Book>>>;
  publish: ReturnType<typeof vi.fn<(id: string, userId: string) => Promise<Book>>>;
  archive: ReturnType<typeof vi.fn<(id: string, userId: string) => Promise<Book>>>;
  incrementDownloadCount: ReturnType<typeof vi.fn<(id: string) => Promise<void>>>;
  delete: ReturnType<typeof vi.fn<(id: string, userId: string) => Promise<void>>>;
};

function makeBook(overrides: Partial<Book> = {}): Book {
  return {
    id: 'book-1',
    title: 'Test Book',
    author: 'Test Author',
    ownerId: 'user-1',
    description: null,
    coverImage: null,
    isbn: null,
    publisher: null,
    publishDate: null,
    language: null,
    pageCount: null,
    fileUrl: null,
    fileType: null,
    price: null,
    isFree: false,
    status: 'published',
    categoryId: null,
    viewCount: 0,
    likeCount: 0,
    downloadCount: 0,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('BooksController', () => {
  let app: INestApplication<Server>;
  let booksService: MockBooksService;

  beforeAll(async () => {
    booksService = {
      findAll: vi.fn<(params: BooksFindAllParams) => Promise<BooksListResponse>>(),
      findById: vi.fn<(id: string) => Promise<Book>>(),
      findByIsbn: vi.fn<(isbn: string) => Promise<Book>>(),
      create: vi.fn<(userId: string, input: CreateBookInput) => Promise<Book>>(),
      update: vi.fn<(id: string, input: UpdateBookInput, userId: string) => Promise<Book>>(),
      publish: vi.fn<(id: string, userId: string) => Promise<Book>>(),
      archive: vi.fn<(id: string, userId: string) => Promise<Book>>(),
      incrementDownloadCount: vi.fn<(id: string) => Promise<void>>(),
      delete: vi.fn<(id: string, userId: string) => Promise<void>>(),
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

  describe('GET /books', () => {
    it('should return paginated books', async () => {
      vi.mocked(booksService.findAll).mockResolvedValue({
        books: [],
        total: 0,
        page: 1,
        limit: 20,
      });

      const res = await request(app.getHttpServer()).get('/books').expect(200);

      expect(res.body).toHaveProperty('books');
      expect(res.body).toHaveProperty('total', 0);
      expect(booksService.findAll).toHaveBeenCalled();
    });
  });

  describe('GET /books/:id', () => {
    it('should return a book by id', async () => {
      vi.mocked(booksService.findById).mockResolvedValue(makeBook());

      const res = await request(app.getHttpServer()).get('/books/book-1').expect(200);

      expect(res.body).toHaveProperty('id', 'book-1');
      expect(booksService.findById).toHaveBeenCalledWith('book-1');
    });
  });

  describe('GET /books/isbn/:isbn', () => {
    it('should return a book by isbn', async () => {
      vi.mocked(booksService.findByIsbn).mockResolvedValue(makeBook({ isbn: '9781234567890' }));

      const res = await request(app.getHttpServer()).get('/books/isbn/9781234567890').expect(200);

      expect(res.body).toHaveProperty('isbn', '9781234567890');
      expect(booksService.findByIsbn).toHaveBeenCalledWith('9781234567890');
    });
  });

  describe('POST /books', () => {
    it('should create a book', async () => {
      const token = await generateToken('user-1', 'test@example.com', 'author');

      vi.mocked(booksService.create).mockResolvedValue(makeBook({ status: 'draft' }));

      const res = await request(app.getHttpServer())
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

      vi.mocked(booksService.update).mockResolvedValue(makeBook({ status: 'draft', title: 'Updated Book' }));

      const res = await request(app.getHttpServer())
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

      vi.mocked(booksService.publish).mockResolvedValue(makeBook({ status: 'published' }));

      const res = await request(app.getHttpServer())
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
      vi.mocked(booksService.findById).mockResolvedValue(
        makeBook({ fileUrl: 'https://s3.amazonaws.com/bucket/book.pdf', downloadCount: 1 }),
      );

      const res = await request(app.getHttpServer())
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

      await request(app.getHttpServer()).delete('/books/book-1').set('Authorization', `Bearer ${token}`).expect(204);

      expect(booksService.delete).toHaveBeenCalledWith('book-1', 'user-1');
    });
  });
});
