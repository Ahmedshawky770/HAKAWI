import type { Server } from 'http';

import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { JwtService } from '@nestjs/jwt';
import { ConfigModule } from '@nestjs/config';

import { CategoriesService } from '../categories.service.ts';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard.ts';
import type { Category } from '../types.ts';

import { CategoriesController } from './categories.controller.ts';

// vi.mocked() returns `any` when the mock property is typed ReturnType<typeof vi.fn> (= any).
// This is a vitest typing limitation — mocks are correctly typed and tests pass.
/* eslint-disable @typescript-eslint/no-non-null-assertion */

const JWT_SECRET = 'test-jwt-secret-for-controller-specs';

async function generateToken(sub = 'user-1', email = 'test@example.com', accountType = 'reader'): Promise<string> {
  return new JwtService({ secret: JWT_SECRET }).signAsync({ sub, email, accountType });
}

type MockCategoriesService = {
  findAll: ReturnType<typeof vi.fn>;
  findById: ReturnType<typeof vi.fn>;
  findBySlug: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
};

describe('CategoriesController', () => {
  let app: INestApplication;
  let httpServer: Server;
  let categoriesService: MockCategoriesService;

  beforeAll(async () => {
    categoriesService = {
      findAll: vi.fn(),
      findById: vi.fn(),
      findBySlug: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, load: [] })],
      controllers: [CategoriesController],
      providers: [
        {
          provide: CategoriesService,
          useValue: categoriesService,
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

  describe('GET /categories', () => {
    it('should return all categories', async () => {
      vi.mocked(categoriesService.findAll).mockResolvedValue([]);

      const res = await request(httpServer).get('/categories').expect(200);

      expect(res.body).toEqual([]);
      expect(categoriesService.findAll).toHaveBeenCalled();
    });
  });

  describe('GET /categories/:id', () => {
    it('should return a category by id', async () => {
      vi.mocked(categoriesService.findById).mockResolvedValue({
        id: 'cat-1',
        name: 'Fiction',
        slug: 'fiction',
      } as unknown as Category);

      const res = await request(httpServer).get('/categories/cat-1').expect(200);

      expect(res.body).toHaveProperty('id', 'cat-1');
      expect(categoriesService.findById).toHaveBeenCalledWith('cat-1');
    });
  });

  describe('GET /categories/slug/:slug', () => {
    it('should return a category by slug', async () => {
      vi.mocked(categoriesService.findBySlug).mockResolvedValue({
        id: 'cat-1',
        name: 'Fiction',
        slug: 'fiction',
      } as unknown as Category);

      const res = await request(httpServer).get('/categories/slug/fiction').expect(200);

      expect(res.body).toHaveProperty('slug', 'fiction');
      expect(categoriesService.findBySlug).toHaveBeenCalledWith('fiction');
    });
  });

  describe('POST /categories', () => {
    it('should create a category', async () => {
      const token = await generateToken('user-1', 'test@example.com', 'admin');

      vi.mocked(categoriesService.create).mockResolvedValue({
        id: 'cat-1',
        name: 'Fiction',
        slug: 'fiction',
      } as unknown as Category);

      const res = await request(httpServer)
        .post('/categories')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Fiction', slug: 'fiction' })
        .expect(201);

      expect(res.body).toHaveProperty('id', 'cat-1');
      expect(categoriesService.create).toHaveBeenCalled();
    });
  });

  describe('PATCH /categories/:id', () => {
    it('should update a category', async () => {
      const token = await generateToken('user-1', 'test@example.com', 'admin');

      vi.mocked(categoriesService.update).mockResolvedValue({
        id: 'cat-1',
        name: 'Fiction Updated',
        slug: 'fiction',
      } as unknown as Category);

      const res = await request(httpServer)
        .patch('/categories/cat-1')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Fiction Updated' })
        .expect(200);

      expect(res.body).toHaveProperty('name', 'Fiction Updated');
      expect(categoriesService.update).toHaveBeenCalled();
    });
  });

  describe('DELETE /categories/:id', () => {
    it('should delete a category', async () => {
      const token = await generateToken('user-1', 'test@example.com', 'admin');

      vi.mocked(categoriesService.delete).mockResolvedValue(undefined);

      await request(httpServer).delete('/categories/cat-1').set('Authorization', `Bearer ${token}`).expect(204);

      expect(categoriesService.delete).toHaveBeenCalledWith('cat-1');
    });
  });
});
