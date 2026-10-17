import type { Server } from 'node:http';

import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { JwtService } from '@nestjs/jwt';
import { ConfigModule } from '@nestjs/config';

import { ValkeyService } from '../../../common/services/valkey.service.ts';
import { AccountRestrictionService } from '../../../common/services/account-restriction.service.ts';
import { WinstonLoggerService } from '../../../common/services/winston-logger.service.ts';
import { CategoriesService } from '../categories.service.ts';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard.ts';
import type { Category, CreateCategoryInput, UpdateCategoryInput } from '../types.ts';

import { CategoriesController } from './categories.controller.ts';

const JWT_SECRET = 'test-jwt-secret-for-controller-specs';

type TokenPayload = {
  sub: string;
  email: string;
  accountType: string;
  adminRole?: string;
};

async function generateToken(
  sub = 'user-1',
  email = 'test@example.com',
  accountType = 'reader',
  adminRole?: string,
): Promise<string> {
  const payload: TokenPayload = { sub, email, accountType };
  if (adminRole) {
    payload.adminRole = adminRole;
  }
  return new JwtService({ secret: JWT_SECRET }).signAsync(payload);
}

/** A token that satisfies the taxonomy guards: admin account, content-moderator role. */
function editorialToken(): Promise<string> {
  return generateToken('mod-1', 'mod@example.com', 'admin', 'content_moderator');
}

type MockCategoriesService = {
  findAll: ReturnType<typeof vi.fn<() => Promise<Category[]>>>;
  findById: ReturnType<typeof vi.fn<(id: string) => Promise<Category>>>;
  findBySlug: ReturnType<typeof vi.fn<(slug: string) => Promise<Category>>>;
  create: ReturnType<typeof vi.fn<(input: CreateCategoryInput) => Promise<Category>>>;
  update: ReturnType<typeof vi.fn<(id: string, input: UpdateCategoryInput) => Promise<Category>>>;
  delete: ReturnType<typeof vi.fn<(id: string) => Promise<void>>>;
};

function makeCategory(overrides: Partial<Category> = {}): Category {
  return {
    id: 'cat-1',
    name: 'Fiction',
    slug: 'fiction',
    description: null,
    parentId: null,
    sortOrder: 0,
    isActive: true,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    ...overrides,
  };
}

describe('CategoriesController', () => {
  let app: INestApplication<Server>;
  let categoriesService: MockCategoriesService;

  beforeAll(async () => {
    categoriesService = {
      findAll: vi.fn<() => Promise<Category[]>>(),
      findById: vi.fn<(id: string) => Promise<Category>>(),
      findBySlug: vi.fn<(slug: string) => Promise<Category>>(),
      create: vi.fn<(input: CreateCategoryInput) => Promise<Category>>(),
      update: vi.fn<(id: string, input: UpdateCategoryInput) => Promise<Category>>(),
      delete: vi.fn<(id: string) => Promise<void>>(),
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
        // `@Secured` composes `RestrictionGuard`, which injects `AccountRestrictionService` and the
        // logger. This module is hand-built rather than importing `CommonModule`, so both must be
        // provided here or Nest fails at DI resolution before any assertion runs. The guard stopped
        // reading Valkey itself when that read was extracted for `AuthService` — the same reader now
        // refuses a banned account at login, refresh and OAuth — so the reader is what needs providing.
        { provide: ValkeyService, useValue: { exists: vi.fn().mockResolvedValue(false), get: vi.fn(), set: vi.fn() } },
        {
          provide: AccountRestrictionService,
          useValue: {
            readCurrentRestriction: vi.fn().mockResolvedValue(null),
            hasActiveBan: vi.fn().mockResolvedValue(false),
          },
        },
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

  describe('GET /categories', () => {
    it('should return all categories', async () => {
      vi.mocked(categoriesService.findAll).mockResolvedValue([]);

      const res = await request(app.getHttpServer()).get('/categories').expect(200);

      expect(res.body).toEqual([]);
      expect(categoriesService.findAll).toHaveBeenCalled();
    });
  });

  describe('GET /categories/:id', () => {
    it('should return a category by id', async () => {
      vi.mocked(categoriesService.findById).mockResolvedValue(makeCategory());

      const res = await request(app.getHttpServer()).get('/categories/cat-1').expect(200);

      expect(res.body).toHaveProperty('id', 'cat-1');
      expect(categoriesService.findById).toHaveBeenCalledWith('cat-1');
    });
  });

  describe('GET /categories/slug/:slug', () => {
    it('should return a category by slug', async () => {
      vi.mocked(categoriesService.findBySlug).mockResolvedValue(makeCategory());

      const res = await request(app.getHttpServer()).get('/categories/slug/fiction').expect(200);

      expect(res.body).toHaveProperty('slug', 'fiction');
      expect(categoriesService.findBySlug).toHaveBeenCalledWith('fiction');
    });
  });

  describe('POST /categories', () => {
    it('should create a category', async () => {
      const token = await editorialToken();

      vi.mocked(categoriesService.create).mockResolvedValue(makeCategory());

      const res = await request(app.getHttpServer())
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
      const token = await editorialToken();

      vi.mocked(categoriesService.update).mockResolvedValue(makeCategory({ name: 'Fiction Updated' }));

      const res = await request(app.getHttpServer())
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
      const token = await editorialToken();

      vi.mocked(categoriesService.delete).mockResolvedValue(undefined);

      await request(app.getHttpServer()).delete('/categories/cat-1').set('Authorization', `Bearer ${token}`).expect(204);

      expect(categoriesService.delete).toHaveBeenCalledWith('cat-1');
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
    it('refuses POST a category for a reader', async () => {
      const token = await generateToken('reader-1', 'reader@example.com', 'reader');

      await request(app.getHttpServer())
        .post('/categories')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Injected', slug: 'injected' })
        .expect(403);

      expect(categoriesService.create).not.toHaveBeenCalled();
    });

    it('refuses PATCH a category for a reader', async () => {
      const token = await generateToken('reader-1', 'reader@example.com', 'reader');

      await request(app.getHttpServer())
        .patch('/categories/cat-1')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Injected', slug: 'injected' })
        .expect(403);

      expect(categoriesService.update).not.toHaveBeenCalled();
    });

    it('refuses DELETE a category for a reader', async () => {
      const token = await generateToken('reader-1', 'reader@example.com', 'reader');

      await request(app.getHttpServer()).delete('/categories/cat-1').set('Authorization', `Bearer ${token}`).expect(403);

      expect(categoriesService.delete).not.toHaveBeenCalled();
    });

    it('refuses POST a category for an admin with the wrong role', async () => {
      // `accountType` is ADMIN but the role is financial, so this fails on `adminRoleAtLeast`
      // rather than on the account type. Both halves of `@Secured` are needed to tell an
      // account-type check from a role check, and only one of them is exercised by the cases above.
      const token = await generateToken('fin-1', 'fin@example.com', 'admin', 'financial_officer');

      await request(app.getHttpServer())
        .post('/categories')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Injected', slug: 'injected' })
        .expect(403);

      expect(categoriesService.create).not.toHaveBeenCalled();
    });

    it('refuses POST a category with no token at all', async () => {
      await request(app.getHttpServer()).post('/categories').send({ name: 'Injected', slug: 'injected' }).expect(401);

      expect(categoriesService.create).not.toHaveBeenCalled();
    });
  });
});
