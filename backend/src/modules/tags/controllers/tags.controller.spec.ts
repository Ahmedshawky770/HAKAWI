import type { Server } from 'http';

import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { ValkeyService } from '../../../common/services/valkey.service.ts';
import { WinstonLoggerService } from '../../../common/services/winston-logger.service.ts';
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

async function generateToken(
  sub = 'user-1',
  email = 'test@example.com',
  accountType = 'reader',
  adminRole?: string,
): Promise<string> {
  return new JwtService({ secret: JWT_SECRET }).signAsync({ sub, email, accountType, adminRole });
}

/** A token that satisfies the taxonomy guards: admin account, content-moderator role. */
function editorialToken(): Promise<string> {
  return generateToken('mod-1', 'mod@example.com', 'admin', 'content_moderator');
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

      const res = await request(httpServer).get('/tags').expect(200);

      expect(res.body).toEqual([]);
      expect(tagsService.findAll).toHaveBeenCalled();
    });
  });

  describe('GET /tags/:id', () => {
    it('should return a tag by id', async () => {
      vi.mocked(tagsService.findById).mockResolvedValue({
        id: 'tag-1',
        name: 'Romance',
        slug: 'romance',
      } as unknown as Tag);

      const res = await request(httpServer).get('/tags/tag-1').expect(200);

      expect(res.body).toHaveProperty('id', 'tag-1');
      expect(tagsService.findById).toHaveBeenCalledWith('tag-1');
    });
  });

  describe('GET /tags/slug/:slug', () => {
    it('should return a tag by slug', async () => {
      vi.mocked(tagsService.findBySlug).mockResolvedValue({
        id: 'tag-1',
        name: 'Romance',
        slug: 'romance',
      } as unknown as Tag);

      const res = await request(httpServer).get('/tags/slug/romance').expect(200);

      expect(res.body).toHaveProperty('slug', 'romance');
      expect(tagsService.findBySlug).toHaveBeenCalledWith('romance');
    });
  });

  describe('POST /tags', () => {
    it('should create a tag', async () => {
      const token = await editorialToken();

      vi.mocked(tagsService.create).mockResolvedValue({
        id: 'tag-1',
        name: 'Romance',
        slug: 'romance',
      } as unknown as Tag);

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
      const token = await editorialToken();

      vi.mocked(tagsService.update).mockResolvedValue({
        id: 'tag-1',
        name: 'Romance Updated',
        slug: 'romance',
      } as unknown as Tag);

      const res = await request(httpServer)
        .patch('/tags/tag-1')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Romance Updated' })
        .expect(200);

      expect(res.body).toHaveProperty('name', 'Romance Updated');
      expect(tagsService.update).toHaveBeenCalled();
    });
  });
  /**
   * The taxonomy write routes used to be reachable by ANY authenticated account. `stories.category_id`
   * and `story_tags.tag_id` both reference these tables, so a rename changes what every existing
   * story resolves to and the search index filters on the slugs. These are the negative cases: a
   * guard only ever exercised on the happy path would be a guard whose removal changed no result.
   */
  /**
   * The taxonomy write routes used to carry a bare `JwtAuthGuard`, so any registered reader could
   * create, rename or delete a category or a tag — and `stories.category_id` / `story_tags.tag_id`
   * both reference those tables, so a rename changes what every existing story resolves to and the
   * search index filters on the slugs.
   *
   * These are the negative cases. A guard only ever exercised on the happy path is a guard whose
   * removal changes no test result, which is precisely how the bare-`JwtAuthGuard` state survived a
   * fully green suite.
   */
  describe('write routes are not reachable by a plain account', () => {
    it('refuses POST a tag for a reader', async () => {
      const token = await generateToken('reader-1', 'reader@example.com', 'reader');

      await request(httpServer)
        .post('/tags')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'injected' })
        .expect(403);

      expect(tagsService.create).not.toHaveBeenCalled();
    });

    it('refuses PATCH a tag for a reader', async () => {
      const token = await generateToken('reader-1', 'reader@example.com', 'reader');

      await request(httpServer)
        .patch('/tags/tag-1')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'injected' })
        .expect(403);

      expect(tagsService.update).not.toHaveBeenCalled();
    });

    // NOTE: there is no `DELETE /tags/:id` at all — `TagsController` exposes POST and PATCH only,
    // and `TagsService` has no delete method. So unlike `categories`, a tag cannot be removed, only
    // renamed. That asymmetry is left as-is rather than invented into a route here: adding a delete
    // endpoint is a product decision about what happens to the `story_tags` rows that reference the
    // tag, and `story_tags` has no cascade. The taxonomy guards are what this block is about, and a
    // category's DELETE is covered in `categories.controller.spec.ts`.

    it('refuses POST a tag for an admin with the wrong role', async () => {
      // `accountType` is ADMIN but the role is financial, so this fails on `adminRoleAtLeast`
      // rather than on the account type. Both halves of `@Secured` are needed to tell an
      // account-type check from a role check, and only one of them is exercised by the cases above.
      const token = await generateToken('fin-1', 'fin@example.com', 'admin', 'financial_officer');

      await request(httpServer)
        .post('/tags')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'injected' })
        .expect(403);

      expect(tagsService.create).not.toHaveBeenCalled();
    });

    it('refuses POST a tag with no token at all', async () => {
      await request(httpServer).post('/tags').send({ name: 'injected' }).expect(401);

      expect(tagsService.create).not.toHaveBeenCalled();
    });
  });
});
