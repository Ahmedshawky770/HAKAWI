import type { Server } from 'http';

import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest';
import type { Mock } from 'vitest';
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { JwtService } from '@nestjs/jwt';
import { ConfigModule } from '@nestjs/config';

/* eslint-disable @typescript-eslint/no-unsafe-member-access */

import { StoriesService } from '../stories.service.ts';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard.ts';
import { OWNERSHIP_RESOLVER, OwnershipGuard } from '../../../common/guards/ownership.guard.ts';
import type { OwnershipResolver } from '../../../common/guards/ownership.guard.ts';
import { MAX_STORY_TAGS } from '../dto/stories.dto.ts';
import type { Story } from '../types.ts';

import { StoriesController } from './stories.controller.ts';

// vi.mocked() returns `any` when the mock property is typed ReturnType<typeof vi.fn> (= any).
// This is a vitest typing limitation — mocks are correctly typed and tests pass.
/* eslint-disable @typescript-eslint/no-non-null-assertion */

const JWT_SECRET = 'test-jwt-secret-for-controller-specs';

const MOCK_PERSISTED_STORY = {
  id: 'story-1',
  authorId: 'user-1',
  title: 'Test Story',
  slug: 'test-story',
  excerpt: 'An excerpt',
  content: 'Content',
  coverImage: null,
  status: 'published',
  categoryId: null,
  viewCount: 0,
  likeCount: 0,
  commentCount: 0,
  readingTime: null,
  deletedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  publishedAt: new Date(),
} as unknown as Story;

const MOCK_STORY_RESPONSE = {
  id: 'story-1',
  title: 'Test Story',
  slug: 'test-story',
  excerpt: 'An excerpt',
  content: 'Content',
  coverImage: null,
  status: 'published',
  category: null,
  tags: [] as string[],
  views: 0,
  reactions: 0,
  author: { id: 'user-1', name: 'Author' },
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

async function generateToken(sub = 'user-1', email = 'test@example.com', accountType = 'reader'): Promise<string> {
  return new JwtService({ secret: JWT_SECRET }).signAsync({ sub, email, accountType });
}

type MockStoriesService = {
  findAll: ReturnType<typeof vi.fn>;
  findById: ReturnType<typeof vi.fn>;
  findByIdWithRelations: ReturnType<typeof vi.fn>;
  findBySlugWithRelations: ReturnType<typeof vi.fn>;
  findBySlug: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  toRecord: ReturnType<typeof vi.fn>;
  publish: ReturnType<typeof vi.fn>;
  archive: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
};

describe('StoriesController', () => {
  let app: INestApplication;
  let httpServer: Server;
  let storiesService: MockStoriesService;
  let resolveOwnerId: Mock<OwnershipResolver['resolveOwnerId']>;

  beforeAll(async () => {
    storiesService = {
      findAll: vi.fn(),
      findById: vi.fn(),
      findByIdWithRelations: vi.fn(),
      findBySlugWithRelations: vi.fn(),
      findBySlug: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      toRecord: vi.fn(),
      publish: vi.fn(),
      archive: vi.fn(),
      delete: vi.fn(),
    };
    resolveOwnerId = vi.fn<OwnershipResolver['resolveOwnerId']>().mockResolvedValue('user-1');

    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, load: [] })],
      controllers: [StoriesController],
      providers: [
        {
          provide: StoriesService,
          useValue: storiesService,
        },
        JwtAuthGuard,
        // Mirrors `StoriesModule`: the guard is only useful paired with a resolver, and without one
        // it fails closed, which in a testing module would read as a route policy rather than a
        // missing binding.
        OwnershipGuard,
        { provide: OWNERSHIP_RESOLVER, useValue: { resolveOwnerId } satisfies OwnershipResolver },
        {
          provide: JwtService,
          useValue: new JwtService({ secret: JWT_SECRET }),
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    // Byte-for-byte the pipe `main.ts:118-127` installs. A mock service means these tests cover the
    // boundary only, which is exactly what the controller owns.
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
    // `clearAllMocks` keeps implementations, so an IDOR case's owner would otherwise leak forward.
    resolveOwnerId.mockResolvedValue('user-1');
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
      });

      const res = await request(httpServer).get('/stories').expect(200);

      expect(res.body).toHaveProperty('stories');
      expect(res.body).toHaveProperty('total', 1);
      expect(res.body.stories).toHaveLength(1);
      expect(storiesService.findAll).toHaveBeenCalledWith({
        page: undefined,
        limit: undefined,
        search: undefined,
        categoryId: undefined,
        status: undefined,
      });
    });
  });

  describe('GET /stories query mapping', () => {
    it('should forward the category filter as categoryId', async () => {
      vi.mocked(storiesService.findAll).mockResolvedValue({ stories: [], total: 0, page: 1, limit: 20 });

      await request(httpServer).get('/stories?category=cat-1').expect(200);

      expect(storiesService.findAll).toHaveBeenCalledWith(expect.objectContaining({ categoryId: 'cat-1' }));
    });

    it('should forward the search and status filters', async () => {
      vi.mocked(storiesService.findAll).mockResolvedValue({ stories: [], total: 0, page: 1, limit: 20 });

      await request(httpServer).get('/stories?search=sea&status=published').expect(200);

      expect(storiesService.findAll).toHaveBeenCalledWith(
        expect.objectContaining({ search: 'sea', status: 'published' }),
      );
    });

    it('should never forward a bare category key to the service', async () => {
      vi.mocked(storiesService.findAll).mockResolvedValue({ stories: [], total: 0, page: 1, limit: 20 });

      await request(httpServer).get('/stories?category=cat-1').expect(200);

      const forwarded = vi.mocked(storiesService.findAll).mock.calls[0]?.[0] as Record<string, unknown>;
      expect(forwarded).not.toHaveProperty('category');
      expect(forwarded['categoryId']).toBe('cat-1');
    });

    it('should forward the pagination filters under their own keys', async () => {
      vi.mocked(storiesService.findAll).mockResolvedValue({ stories: [], total: 0, page: 2, limit: 5 });

      await request(httpServer).get('/stories?page=2&limit=5').expect(200);

      const forwarded = vi.mocked(storiesService.findAll).mock.calls[0]?.[0] as Record<string, unknown>;
      expect(Object.keys(forwarded).sort()).toEqual(['categoryId', 'limit', 'page', 'search', 'status']);
      expect(forwarded['page']).toBe(2);
      expect(forwarded['limit']).toBe(5);
    });
  });

  describe('GET /stories/:id', () => {
    it('should return a story by id', async () => {
      vi.mocked(storiesService.findByIdWithRelations).mockResolvedValue({
        story: MOCK_PERSISTED_STORY,
        response: { ...MOCK_STORY_RESPONSE, category: 'Fiction', tags: ['sea'] },
      });
      const res = await request(httpServer).get('/stories/story-1').expect(200);

      expect(res.body).toHaveProperty('id', 'story-1');
      expect(res.body).toHaveProperty('title', 'Test Story');
      expect(res.body).toHaveProperty('category', 'Fiction');
      expect(res.body).toHaveProperty('tags', ['sea']);
      expect(res.body).toHaveProperty('author', { id: 'user-1', name: 'Author' });
      expect(res.body).not.toHaveProperty('viewCount');
      expect(res.body).not.toHaveProperty('authorId');
      expect(storiesService.findByIdWithRelations).toHaveBeenCalledWith('story-1');
    });
  });

  describe('GET /stories/slug/:slug', () => {
    it('should return a story by slug', async () => {
      vi.mocked(storiesService.findBySlugWithRelations).mockResolvedValue({
        story: MOCK_PERSISTED_STORY,
        response: MOCK_STORY_RESPONSE,
      });
      const res = await request(httpServer).get('/stories/slug/test-story').expect(200);

      expect(res.body).toHaveProperty('id', 'story-1');
      expect(res.body).toHaveProperty('slug', 'test-story');
      expect(res.body).not.toHaveProperty('categoryId');
      expect(storiesService.findBySlugWithRelations).toHaveBeenCalledWith('test-story');
    });

    /**
     * The regression guard for the route ordering documented on the handler. Express matches in
     * declaration order, so if `@Get(':id')` is ever moved above `@Get('slug/:slug')` this route
     * binds `id` to the literal string `"slug"`, the lookup misses, and a story that exists answers
     * 404 — which reads exactly like a deleted story rather than a routing mistake.
     */
    it('should not let the :id handler capture a slug path', async () => {
      vi.mocked(storiesService.findBySlugWithRelations).mockResolvedValue({
        story: MOCK_PERSISTED_STORY,
        response: MOCK_STORY_RESPONSE,
      });

      await request(httpServer).get('/stories/slug/some-other-slug').expect(200);

      expect(storiesService.findBySlugWithRelations).toHaveBeenCalledWith('some-other-slug');
      expect(storiesService.findByIdWithRelations).not.toHaveBeenCalled();
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
      } as unknown as Story);

      vi.mocked(storiesService.toRecord).mockResolvedValue({
        id: 'story-1',
        authorId: 'user-1',
        authorName: 'Ahmed',
        title: 'New Story',
        slug: 'new-story',
        excerpt: 'Excerpt',
        content: 'Content',
        coverImage: null,
        status: 'draft',
        categoryId: null,
        viewCount: 0,
        likeCount: 0,
        commentCount: 0,
        readingTime: null,
        publishedAt: null,
        deletedAt: null,
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      });

      const res = await request(httpServer)
        .post('/stories')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'New Story', slug: 'new-story', content: 'Content' })
        .expect(201);

      expect(res.body).toHaveProperty('id', 'story-1');
      expect(res.body).toHaveProperty('status', 'draft');
      expect(res.body).toHaveProperty('authorName', 'Ahmed');
      expect(storiesService.create).toHaveBeenCalledWith('user-1', expect.objectContaining({ title: 'New Story' }));
      expect(storiesService.toRecord).toHaveBeenCalledWith(expect.objectContaining({ id: 'story-1' }));
    });

    it('should report a null author name rather than an empty one when the author cannot be resolved', async () => {
      const token = await generateToken('user-1', 'test@example.com', 'reader');

      vi.mocked(storiesService.create).mockResolvedValue({
        id: 'story-1',
        title: 'New Story',
        slug: 'new-story',
        authorId: 'user-1',
      } as unknown as Story);
      vi.mocked(storiesService.toRecord).mockResolvedValue({
        id: 'story-1',
        authorId: 'user-1',
        authorName: null,
        title: 'New Story',
        slug: 'new-story',
        excerpt: null,
        content: 'Content',
        coverImage: null,
        status: 'draft',
        categoryId: null,
        viewCount: 0,
        likeCount: 0,
        commentCount: 0,
        readingTime: null,
        publishedAt: null,
        deletedAt: null,
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      });

      const res = await request(httpServer)
        .post('/stories')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'New Story', slug: 'new-story', content: 'Content' })
        .expect(201);

      expect(res.body).toHaveProperty('authorName', null);
    });
  });

  /**
   * Boundary behaviour of the create route. The slug DERIVATION itself is asserted in
   * `stories.service.spec.ts`, because it lives in `StoriesService.create` — this layer only has to
   * get the request past the pipe and hand it over without inventing a slug of its own.
   */
  describe('POST /stories request contract', () => {
    const mockCreateAccepting = () => {
      vi.mocked(storiesService.create).mockResolvedValue(MOCK_PERSISTED_STORY);
      vi.mocked(storiesService.toRecord).mockResolvedValue({
        id: 'story-1',
        authorId: 'user-1',
        authorName: 'Ahmed',
        title: 'The Lighthouse',
        slug: 'the-lighthouse',
        excerpt: null,
        content: null,
        coverImage: null,
        status: 'draft',
        categoryId: null,
        viewCount: 0,
        likeCount: 0,
        commentCount: 0,
        readingTime: null,
        publishedAt: null,
        deletedAt: null,
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      });
    };

    it('should accept a body with no slug at all, which used to be a guaranteed 400', async () => {
      const token = await generateToken('user-1', 'test@example.com', 'reader');
      mockCreateAccepting();

      await request(httpServer)
        .post('/stories')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'The Lighthouse', content: '<p>Body</p>' })
        .expect(201);

      // The slug arrives undefined on purpose: deriving it is the service's job, because the service
      // owns the insert and can therefore tell whether a candidate slug was really free.
      const forwarded = vi.mocked(storiesService.create).mock.calls[0]?.[1] as Record<string, unknown>;
      expect(forwarded['slug']).toBeUndefined();
      expect(forwarded['title']).toBe('The Lighthouse');
    });

    it('should forward a client-supplied slug untouched rather than rewriting it', async () => {
      const token = await generateToken('user-1', 'test@example.com', 'reader');
      mockCreateAccepting();

      await request(httpServer)
        .post('/stories')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'The Lighthouse', slug: 'my-chosen-url' })
        .expect(201);

      expect(storiesService.create).toHaveBeenCalledWith('user-1', expect.objectContaining({ slug: 'my-chosen-url' }));
    });

    it('should accept the documented frontend body and forward it without a category name', async () => {
      const token = await generateToken('user-1', 'test@example.com', 'reader');
      mockCreateAccepting();

      await request(httpServer)
        .post('/stories')
        .set('Authorization', `Bearer ${token}`)
        .send({
          title: 'The Lighthouse',
          content: '<p>Body</p>',
          categoryId: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
          tags: ['sea', 'night'],
        })
        .expect(201);

      const forwarded = vi.mocked(storiesService.create).mock.calls[0]?.[1] as Record<string, unknown>;
      expect(forwarded['categoryId']).toBe('3f2504e0-4f89-41d3-9a0c-0305e82c3301');
      expect(forwarded).not.toHaveProperty('category');
      expect(forwarded['tags']).toEqual(['sea', 'night']);
    });

    it('should still reject an invalid client-supplied slug with 400', async () => {
      const token = await generateToken('user-1', 'test@example.com', 'reader');

      const res = await request(httpServer)
        .post('/stories')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'The Lighthouse', slug: 'Not A Valid Slug' })
        .expect(400);

      expect(JSON.stringify(res.body)).toContain('Slug');
      expect(storiesService.create).not.toHaveBeenCalled();
    });

    it('should reject an empty slug with 400 rather than deriving one behind the caller back', async () => {
      const token = await generateToken('user-1', 'test@example.com', 'reader');

      const res = await request(httpServer)
        .post('/stories')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'The Lighthouse', slug: '' })
        .expect(400);

      expect(JSON.stringify(res.body)).toContain('Slug');
      expect(storiesService.create).not.toHaveBeenCalled();
    });

    it('should reject a legacy category name with 400 rather than guessing the row', async () => {
      const token = await generateToken('user-1', 'test@example.com', 'reader');

      await request(httpServer)
        .post('/stories')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'The Lighthouse', category: 'fiction' })
        .expect(400);

      expect(storiesService.create).not.toHaveBeenCalled();
    });

    it('should reject a non-string tag element with 400', async () => {
      const token = await generateToken('user-1', 'test@example.com', 'reader');

      await request(httpServer)
        .post('/stories')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'The Lighthouse', tags: [1, 2, {}] })
        .expect(400);

      expect(storiesService.create).not.toHaveBeenCalled();
    });

    it('should reject more tags than the documented bound', async () => {
      const token = await generateToken('user-1', 'test@example.com', 'reader');
      const tooMany = Array.from({ length: MAX_STORY_TAGS + 1 }, (_, index) => `tag-${index}`);

      await request(httpServer)
        .post('/stories')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'The Lighthouse', tags: tooMany })
        .expect(400);

      expect(storiesService.create).not.toHaveBeenCalled();
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
      } as unknown as Story);

      vi.mocked(storiesService.toRecord).mockResolvedValue({
        id: 'story-1',
        authorId: 'user-1',
        authorName: 'Ahmed',
        title: 'Updated Story',
        slug: 'updated-story',
        excerpt: 'Excerpt',
        content: 'Updated content',
        coverImage: null,
        status: 'draft',
        categoryId: null,
        viewCount: 0,
        likeCount: 0,
        commentCount: 0,
        readingTime: null,
        publishedAt: null,
        deletedAt: null,
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      });

      const res = await request(httpServer)
        .patch('/stories/story-1')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'Updated Story' })
        .expect(200);

      expect(res.body).toHaveProperty('title', 'Updated Story');
      expect(res.body).toHaveProperty('authorName', 'Ahmed');
      expect(storiesService.update).toHaveBeenCalledWith('story-1', { title: 'Updated Story' }, 'user-1');
    });

    it('should leave the slug alone when only the title changes', async () => {
      const token = await generateToken('user-1', 'test@example.com', 'reader');
      vi.mocked(storiesService.update).mockResolvedValue(MOCK_PERSISTED_STORY);

      await request(httpServer)
        .patch('/stories/story-1')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'A Completely Different Title' })
        .expect(200);

      // A slug is a published identifier; re-deriving it on a copy edit would break live links, so
      // the controller must not inject one and the service does not re-derive one.
      expect(storiesService.update).toHaveBeenCalledWith(
        'story-1',
        { title: 'A Completely Different Title' },
        'user-1',
      );
    });

    it('should accept a tag list, which used to be an undeclared property and therefore a 400', async () => {
      const token = await generateToken('user-1', 'test@example.com', 'reader');
      vi.mocked(storiesService.update).mockResolvedValue(MOCK_PERSISTED_STORY);

      await request(httpServer)
        .patch('/stories/story-1')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'Edited Draft', content: '<p>Updated</p>', tags: ['sea', 'night'] })
        .expect(200);

      expect(storiesService.update).toHaveBeenCalledWith(
        'story-1',
        expect.objectContaining({ tags: ['sea', 'night'] }),
        'user-1',
      );
    });

    it('should still reject a non-string tag element', async () => {
      const token = await generateToken('user-1', 'test@example.com', 'reader');

      await request(httpServer)
        .patch('/stories/story-1')
        .set('Authorization', `Bearer ${token}`)
        .send({ tags: [1] })
        .expect(400);

      expect(storiesService.update).not.toHaveBeenCalled();
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
      } as unknown as Story);

      const res = await request(httpServer)
        .post('/stories/story-1/publish')
        .set('Authorization', `Bearer ${token}`)
        .expect(201);

      expect(res.body).toHaveProperty('status', 'published');
      expect(storiesService.publish).toHaveBeenCalledWith('story-1', 'user-1');
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
      } as unknown as Story);

      const res = await request(httpServer)
        .post('/stories/story-1/archive')
        .set('Authorization', `Bearer ${token}`)
        .expect(201);

      expect(res.body).toHaveProperty('status', 'archived');
      expect(storiesService.archive).toHaveBeenCalledWith('story-1', 'user-1');
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
      expect(storiesService.delete).toHaveBeenCalledWith('story-1', 'user-1');
    });

    it('should refuse a delete by a caller who does not own the story', async () => {
      const token = await generateToken('user-2', 'test@example.com', 'reader');
      resolveOwnerId.mockResolvedValue('user-1');

      const res = await request(httpServer)
        .delete('/stories/story-1')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);

      expect(res.body).toHaveProperty('message', 'You do not own this resource');
      expect(storiesService.delete).not.toHaveBeenCalled();
    });
  });

  /**
   * `OwnershipGuard` is on all four author-scoped write routes. These cases assert the property that
   * matters for the guard: a non-owner is refused *before* the service is called, so the in-service
   * `authorId` check is a second line rather than the only one. `StoriesService` still owns the
   * 403 wording for the states the guard cannot see (already published, already archived, slug
   * conflicts), and those are covered in `stories.service.spec.ts`.
   */
  describe('ownership on the author-scoped write routes', () => {
    it('refuses a stranger patching the story', async () => {
      const token = await generateToken('user-2', 'test@example.com', 'reader');
      resolveOwnerId.mockResolvedValue('user-1');

      const res = await request(httpServer)
        .patch('/stories/story-1')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'Hijacked' })
        .expect(403);

      expect(res.body).toHaveProperty('message', 'You do not own this resource');
      expect(storiesService.update).not.toHaveBeenCalled();
    });

    it('refuses a stranger publishing the story', async () => {
      const token = await generateToken('user-2', 'test@example.com', 'reader');
      resolveOwnerId.mockResolvedValue('user-1');

      const res = await request(httpServer)
        .post('/stories/story-1/publish')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);

      expect(res.body).toHaveProperty('message', 'You do not own this resource');
      expect(storiesService.publish).not.toHaveBeenCalled();
    });

    it('refuses a stranger archiving the story', async () => {
      const token = await generateToken('user-2', 'test@example.com', 'reader');
      resolveOwnerId.mockResolvedValue('user-1');

      const res = await request(httpServer)
        .post('/stories/story-1/archive')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);

      expect(res.body).toHaveProperty('message', 'You do not own this resource');
      expect(storiesService.archive).not.toHaveBeenCalled();
    });

    it('refuses the write when ownership cannot be established at all', async () => {
      const token = await generateToken('user-1', 'test@example.com', 'reader');
      resolveOwnerId.mockResolvedValue(null);

      await request(httpServer).delete('/stories/story-1').set('Authorization', `Bearer ${token}`).expect(403);

      expect(storiesService.delete).not.toHaveBeenCalled();
    });

    it('does not gate the create route, which addresses no existing resource', async () => {
      const token = await generateToken('user-1', 'test@example.com', 'reader');
      resolveOwnerId.mockResolvedValue('user-2');

      vi.mocked(storiesService.create).mockResolvedValue(MOCK_PERSISTED_STORY);
      vi.mocked(storiesService.toRecord).mockResolvedValue({
        id: 'story-1',
        authorId: 'user-1',
        authorName: 'Ahmed',
        title: 'New Story',
        slug: 'new-story',
        excerpt: null,
        content: null,
        coverImage: null,
        status: 'draft',
        categoryId: null,
        viewCount: 0,
        likeCount: 0,
        commentCount: 0,
        readingTime: null,
        publishedAt: null,
        deletedAt: null,
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      });

      await request(httpServer)
        .post('/stories')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'New Story' })
        .expect(201);

      expect(resolveOwnerId).not.toHaveBeenCalled();
    });
  });
});
