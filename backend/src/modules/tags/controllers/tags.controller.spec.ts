import type { Server } from 'http';

import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { JwtService } from '@nestjs/jwt';
import { ConfigModule } from '@nestjs/config';

import { TagsService } from '../tags.service.ts';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard.ts';
import type { Tag } from '../types.ts';

import { TagsController } from './tags.controller.ts';

// vi.mocked() returns `any` when the mock property is typed ReturnType<typeof vi.fn> (= any).
// This is a vitest typing limitation — mocks are correctly typed and tests pass.
/* eslint-disable @typescript-eslint/no-non-null-assertion */

const JWT_SECRET = 'test-jwt-secret-for-controller-specs';

async function generateToken(sub = 'user-1', email = 'test@example.com', accountType = 'reader'): Promise<string> {
  return new JwtService({ secret: JWT_SECRET }).signAsync({ sub, email, accountType });
}

type MockTagsService = {
  findAll: ReturnType<typeof vi.fn>;
  findById: ReturnType<typeof vi.fn>;
  findBySlug: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
};

describe('TagsController', () => {
  let app: INestApplication;
  let httpServer: Server;
  let tagsService: MockTagsService;

  beforeAll(async () => {
    tagsService = {
      findAll: vi.fn(),
      findById: vi.fn(),
      findBySlug: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, load: [] })],
      controllers: [TagsController],
      providers: [
        {
          provide: TagsService,
          useValue: tagsService,
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

  describe('GET /tags', () => {
    it('should return all tags', async () => {
      vi.mocked(tagsService.findAll).mockResolvedValue([]);

      const res = await request(httpServer)
        .get('/tags')
        .expect(200);

      expect(res.body).toEqual([]);
      expect(tagsService.findAll).toHaveBeenCalled();
    });
  });

  describe('GET /tags/:id', () => {
    it('should return a tag by id', async () => {
      vi.mocked(tagsService.findById).mockResolvedValue({ id: 'tag-1', name: 'Romance', slug: 'romance' } as unknown as Tag);

      const res = await request(httpServer)
        .get('/tags/tag-1')
        .expect(200);

      expect(res.body).toHaveProperty('id', 'tag-1');
      expect(tagsService.findById).toHaveBeenCalledWith('tag-1');
    });
  });

  describe('GET /tags/slug/:slug', () => {
    it('should return a tag by slug', async () => {
      vi.mocked(tagsService.findBySlug).mockResolvedValue({ id: 'tag-1', name: 'Romance', slug: 'romance' } as unknown as Tag);

      const res = await request(httpServer)
        .get('/tags/slug/romance')
        .expect(200);

      expect(res.body).toHaveProperty('slug', 'romance');
      expect(tagsService.findBySlug).toHaveBeenCalledWith('romance');
    });
  });

  describe('POST /tags', () => {
    it('should create a tag', async () => {
      const token = await generateToken('user-1', 'test@example.com', 'admin');

      vi.mocked(tagsService.create).mockResolvedValue({ id: 'tag-1', name: 'Romance', slug: 'romance' } as unknown as Tag);

      const res = await request(httpServer)
        .post('/tags')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Romance', slug: 'romance' })
        .expect(201);

      expect(res.body).toHaveProperty('id', 'tag-1');
      expect(tagsService.create).toHaveBeenCalled();
    });
  });

  describe('PATCH /tags/:id', () => {
    it('should update a tag', async () => {
      const token = await generateToken('user-1', 'test@example.com', 'admin');

      vi.mocked(tagsService.update).mockResolvedValue({ id: 'tag-1', name: 'Romance Updated', slug: 'romance' } as unknown as Tag);

      const res = await request(httpServer)
        .patch('/tags/tag-1')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Romance Updated' })
        .expect(200);

      expect(res.body).toHaveProperty('name', 'Romance Updated');
      expect(tagsService.update).toHaveBeenCalled();
    });
  });
});
