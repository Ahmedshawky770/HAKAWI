import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import type { Server } from 'http';
import request from 'supertest';
import { JwtService } from '@nestjs/jwt';

import { StoriesController } from './stories.controller.ts';
import { StoriesService } from '../stories.service.ts';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard.ts';
import { ConfigModule } from '@nestjs/config';

const JWT_SECRET = 'test-jwt-secret-for-controller-specs';

async function generateToken(sub = 'user-1', email = 'test@example.com', accountType = 'reader'): Promise<string> {
  return new JwtService({ secret: JWT_SECRET } as any).signAsync({ sub, email, accountType } as any);
}

describe('StoriesController', () => {
  let app: INestApplication;
  let httpServer: Server;
  let storiesService: Partial<StoriesService>;

  beforeAll(async () => {
    storiesService = {
      findAll: vi.fn(),
      findById: vi.fn(),
      findBySlug: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      publish: vi.fn(),
      archive: vi.fn(),
      delete: vi.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, load: [] })],
      controllers: [StoriesController],
      providers: [
        {
          provide: StoriesService,
          useValue: storiesService,
        },
        JwtAuthGuard,
        {
          provide: JwtService,
          useValue: new JwtService({ secret: JWT_SECRET } as any),
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

  describe('GET /stories', () => {
    it('should return a paginated list of stories', async () => {
      vi.mocked(storiesService.findAll).mockResolvedValue({
        stories: [
          {
            id: 'story-1',
            title: 'Test Story',
            slug: 'test-story',
            excerpt: 'An excerpt',
            content: 'Content',
            coverImage: null,
            status: 'published',
            category: null,
            tags: [],
            views: 0,
            reactions: 0,
            author: { id: 'user-1', name: 'Author' },
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ],
        total: 1,
        page: 1,
        limit: 20,
      } as any);

      const res = await request(httpServer)
        .get('/stories')
        .expect(200);

      expect(res.body).toHaveProperty('stories');
      expect(res.body).toHaveProperty('total', 1);
      expect(res.body.stories).toHaveLength(1);
      expect(storiesService.findAll).toHaveBeenCalledWith({});
    });
  });

  describe('GET /stories/:id', () => {
    it('should return a story by id', async () => {
      vi.mocked(storiesService.findById).mockResolvedValue({
        id: 'story-1',
        title: 'Test Story',
        slug: 'test-story',
        excerpt: 'An excerpt',
        content: 'Content',
        coverImage: null,
        status: 'published',
        authorId: 'user-1',
        viewCount: 0,
        likeCount: 0,
        commentCount: 0,
        categoryId: null,
        deletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        publishedAt: new Date(),
      } as any);

      const res = await request(httpServer)
        .get('/stories/story-1')
        .expect(200);

      expect(res.body).toHaveProperty('id', 'story-1');
      expect(res.body).toHaveProperty('title', 'Test Story');
      expect(storiesService.findById).toHaveBeenCalledWith('story-1');
    });
  });

  describe('GET /stories/slug/:slug', () => {
    it('should return a story by slug', async () => {
      vi.mocked(storiesService.findBySlug).mockResolvedValue({
        id: 'story-1',
        title: 'Test Story',
        slug: 'test-story',
        excerpt: 'An excerpt',
        content: 'Content',
        coverImage: null,
        status: 'published',
        authorId: 'user-1',
        viewCount: 0,
        likeCount: 0,
        commentCount: 0,
        categoryId: null,
        deletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        publishedAt: new Date(),
      } as any);

      const res = await request(httpServer)
        .get('/stories/slug/test-story')
        .expect(200);

      expect(res.body).toHaveProperty('id', 'story-1');
      expect(res.body).toHaveProperty('slug', 'test-story');
      expect(storiesService.findBySlug).toHaveBeenCalledWith('test-story');
    });
  });

  describe('POST /stories', () => {
    it('should create a new story', async () => {
      const token = await generateToken('user-1', 'test@example.com', 'reader');

      vi.mocked(storiesService.create).mockResolvedValue({
        id: 'story-1',
        title: 'New Story',
        slug: 'new-story',
        excerpt: 'Excerpt',
        content: 'Content',
        coverImage: null,
        status: 'draft',
        authorId: 'user-1',
        viewCount: 0,
        likeCount: 0,
        commentCount: 0,
        categoryId: null,
        deletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);

      const res = await request(httpServer)
        .post('/stories')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'New Story', slug: 'new-story', content: 'Content' })
        .expect(201);

      expect(res.body).toHaveProperty('id', 'story-1');
      expect(res.body).toHaveProperty('status', 'draft');
      expect(storiesService.create).toHaveBeenCalledWith('user-1', expect.objectContaining({ title: 'New Story' }));
    });
  });

  describe('PATCH /stories/:id', () => {
    it('should update a story', async () => {
      const token = await generateToken('user-1', 'test@example.com', 'reader');

      vi.mocked(storiesService.update).mockResolvedValue({
        id: 'story-1',
        title: 'Updated Story',
        slug: 'updated-story',
        excerpt: 'Excerpt',
        content: 'Updated content',
        coverImage: null,
        status: 'draft',
        authorId: 'user-1',
        viewCount: 0,
        likeCount: 0,
        commentCount: 0,
        categoryId: null,
        deletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);

      const res = await request(httpServer)
        .patch('/stories/story-1')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'Updated Story' })
        .expect(200);

      expect(res.body).toHaveProperty('title', 'Updated Story');
      expect(storiesService.update).toHaveBeenCalledWith('story-1', { title: 'Updated Story' });
    });
  });

  describe('POST /stories/:id/publish', () => {
    it('should publish a story', async () => {
      const token = await generateToken('user-1', 'test@example.com', 'reader');

      vi.mocked(storiesService.publish).mockResolvedValue({
        id: 'story-1',
        title: 'Draft Story',
        slug: 'draft-story',
        excerpt: 'Excerpt',
        content: 'Content',
        coverImage: null,
        status: 'published',
        authorId: 'user-1',
        viewCount: 0,
        likeCount: 0,
        commentCount: 0,
        categoryId: null,
        deletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        publishedAt: new Date(),
      } as any);

      const res = await request(httpServer)
        .post('/stories/story-1/publish')
        .set('Authorization', `Bearer ${token}`)
        .expect(201);

      expect(res.body).toHaveProperty('status', 'published');
      expect(storiesService.publish).toHaveBeenCalledWith('story-1');
    });
  });

  describe('POST /stories/:id/archive', () => {
    it('should archive a story', async () => {
      const token = await generateToken('user-1', 'test@example.com', 'reader');

      vi.mocked(storiesService.archive).mockResolvedValue({
        id: 'story-1',
        title: 'Story',
        slug: 'story',
        excerpt: 'Excerpt',
        content: 'Content',
        coverImage: null,
        status: 'archived',
        authorId: 'user-1',
        viewCount: 0,
        likeCount: 0,
        commentCount: 0,
        categoryId: null,
        deletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);

      const res = await request(httpServer)
        .post('/stories/story-1/archive')
        .set('Authorization', `Bearer ${token}`)
        .expect(201);

      expect(res.body).toHaveProperty('status', 'archived');
      expect(storiesService.archive).toHaveBeenCalledWith('story-1');
    });
  });

  describe('DELETE /stories/:id', () => {
    it('should delete a story', async () => {
      const token = await generateToken('user-1', 'test@example.com', 'reader');

      vi.mocked(storiesService.delete).mockResolvedValue(undefined);

      const res = await request(httpServer)
        .delete('/stories/story-1')
        .set('Authorization', `Bearer ${token}`)
        .expect(204);

      expect(res.body).toEqual({});
      expect(storiesService.delete).toHaveBeenCalledWith('story-1');
    });
  });
});
