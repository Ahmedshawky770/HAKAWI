import type { Server } from 'http';

import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { JwtService } from '@nestjs/jwt';
import { ConfigModule } from '@nestjs/config';

import { ValkeyService } from '../../../common/services/valkey.service.ts';
import { WinstonLoggerService } from '../../../common/services/winston-logger.service.ts';
import { UsersService } from '../users.service.ts';
import { UserVerificationService } from '../services/user-verification.service.ts';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard.ts';
import { AccountType, ACCOUNT_TYPES } from '../../../common/constants/roles.ts';
import type { ClientUser } from '../types.ts';

import { UsersController } from './users.controller.ts';

type MockUsersService = {
  getUserStats: ReturnType<typeof vi.fn>;
  findById: ReturnType<typeof vi.fn>;
  findPublicProfile: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  softDelete: ReturnType<typeof vi.fn>;
};

type MockUserVerificationService = {
  request: ReturnType<typeof vi.fn>;
  confirm: ReturnType<typeof vi.fn>;
  status: ReturnType<typeof vi.fn>;
  issueToken: ReturnType<typeof vi.fn>;
  awardManual: ReturnType<typeof vi.fn>;
};

const JWT_SECRET = 'test-jwt-secret-for-controller-specs';

/**
 * Signs a token for a controller test.
 *
 * `adminRole` is a parameter because `RolesGuard` reads `REQUIRED_ADMIN_ROLE_KEY` and throws
 * 'Insufficient admin privileges' when it is missing — so a token carrying only
 * `accountType: 'admin'` answers 403 on any route that also declares `@RequireAdminRole`. That is
 * what made the `POST /users` test below assert 403 while claiming to assert 201.
 */
async function generateToken(
  sub = 'user-1',
  email = 'test@example.com',
  accountType = 'reader',
  adminRole?: string,
): Promise<string> {
  return new JwtService({ secret: JWT_SECRET }).signAsync({ sub, email, accountType, adminRole });
}

/** A token that satisfies `@Secured(ADMIN)` + `@RequireAdminRole(SUPER_ADMIN)`. */
function superAdminToken(): Promise<string> {
  return generateToken('123e4567-e89b-12d3-a456-426614174000', 'test@example.com', 'admin', 'super_admin');
}

describe('UsersController', () => {
  let app: INestApplication;
  let httpServer: Server;
  let usersService: MockUsersService;
  let verificationService: MockUserVerificationService;

  beforeAll(async () => {
    usersService = {
      getUserStats: vi.fn(),
      findById: vi.fn(),
      findPublicProfile: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
      softDelete: vi.fn(),
    };

    verificationService = {
      request: vi.fn(),
      confirm: vi.fn(),
      status: vi.fn(),
      issueToken: vi.fn(),
      awardManual: vi.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, load: [] })],
      controllers: [UsersController],
      providers: [
        {
          provide: UsersService,
          useValue: usersService,
        },
        {
          provide: UserVerificationService,
          useValue: verificationService,
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

  describe('GET /users/:id/stats', () => {
    it('should return user stats when authenticated as owner', async () => {
      const token = await generateToken('123e4567-e89b-12d3-a456-426614174000', 'test@example.com', 'reader');

      vi.mocked(usersService.getUserStats).mockResolvedValue({
        storiesCount: 5,
        totalViews: 100,
        totalReactions: 25,
        followersCount: 10,
        followingCount: 3,
      });

      const res = await request(httpServer)
        .get('/users/123e4567-e89b-12d3-a456-426614174000/stats')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body).toEqual({
        storiesCount: 5,
        totalViews: 100,
        totalReactions: 25,
        followersCount: 10,
        followingCount: 3,
      });
      expect(usersService.getUserStats).toHaveBeenCalledWith('123e4567-e89b-12d3-a456-426614174000');
    });
  });

  describe('GET /users/me', () => {
    it('should return current user profile', async () => {
      const token = await generateToken('user-1', 'test@example.com', 'reader');

      vi.mocked(usersService.findById).mockResolvedValue({
        id: 'user-1',
        email: 'test@example.com',
        username: 'testuser',
        name: 'Test User',
        accountType: AccountType.READER,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as unknown as ClientUser);

      const res = await request(httpServer).get('/users/me').set('Authorization', `Bearer ${token}`).expect(200);

      expect(res.body).toHaveProperty('id', 'user-1');
      expect(res.body).toHaveProperty('email', 'test@example.com');
      expect(usersService.findById).toHaveBeenCalledWith('user-1');
    });
  });

  describe('PATCH /users/me', () => {
    it('should update current user profile', async () => {
      const token = await generateToken('user-1', 'test@example.com', 'reader');

      vi.mocked(usersService.update).mockResolvedValue({
        id: 'user-1',
        email: 'test@example.com',
        username: 'testuser',
        name: 'Updated Name',
        accountType: AccountType.READER,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as unknown as ClientUser);

      const res = await request(httpServer)
        .patch('/users/me')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Updated Name' })
        .expect(200);

      expect(res.body).toHaveProperty('name', 'Updated Name');
      expect(usersService.update).toHaveBeenCalledWith('user-1', { name: 'Updated Name' });
    });
  });

  describe('GET /users/:id', () => {
    it('should return a public user profile without authentication', async () => {
      vi.mocked(usersService.findPublicProfile).mockResolvedValue({
        id: '923e4567-e89b-12d3-a456-426614174000',
        username: 'publicuser',
        name: 'Public User',
        avatar: null,
        bio: null,
        accountType: AccountType.WRITER,
        isVerified: false,
        createdAt: new Date(),
      });

      const res = await request(httpServer).get('/users/923e4567-e89b-12d3-a456-426614174000').expect(200);

      expect(res.body).toHaveProperty('id', '923e4567-e89b-12d3-a456-426614174000');
      expect(res.body).toHaveProperty('username', 'publicuser');
      expect(usersService.findPublicProfile).toHaveBeenCalledWith('923e4567-e89b-12d3-a456-426614174000');
    });

    /**
     * The public profile is parsed by a strict `z.enum(ACCOUNT_TYPES)` on the client, so a legacy
     * `author` row used to produce a 200 the client rejected outright and the profile page died.
     * The service normalizes; the value reaching the wire is asserted here so the contract cannot
     * be broken by a later "simplification" that hands the raw column back.
     */
    it('never exposes an accountType outside the client enum', async () => {
      vi.mocked(usersService.findPublicProfile).mockResolvedValue({
        id: '923e4567-e89b-12d3-a456-426614174000',
        username: 'publicuser',
        name: 'Public User',
        avatar: null,
        bio: null,
        accountType: AccountType.WRITER,
        isVerified: false,
        createdAt: new Date(),
      });

      const res = await request(httpServer).get('/users/923e4567-e89b-12d3-a456-426614174000').expect(200);

      // `res.body` is `any` from supertest, so it is narrowed here rather than reaching into it
      // directly; the assertion is about the value on the wire, not the mock.
      const body: { accountType?: string } = res.body as { accountType?: string };

      expect(ACCOUNT_TYPES).toContain(body.accountType);
    });
  });

  describe('PATCH /users/:id', () => {
    it('should update a user by id when authenticated as owner', async () => {
      const token = await generateToken('923e4567-e89b-12d3-a456-426614174000', 'public@example.com', 'reader');

      vi.mocked(usersService.update).mockResolvedValue({
        id: '923e4567-e89b-12d3-a456-426614174000',
        email: 'public@example.com',
        username: 'publicuser',
        name: 'Updated Public User',
        accountType: AccountType.READER,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as unknown as ClientUser);

      const res = await request(httpServer)
        .patch('/users/923e4567-e89b-12d3-a456-426614174000')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Updated Public User' })
        .expect(200);

      expect(res.body).toHaveProperty('name', 'Updated Public User');
      expect(usersService.update).toHaveBeenCalledWith('923e4567-e89b-12d3-a456-426614174000', {
        name: 'Updated Public User',
      });
    });

    it('should forbid updating another user when not admin', async () => {
      const token = await generateToken('user-1', 'test@example.com', 'reader');

      await request(httpServer)
        .patch('/users/923e4567-e89b-12d3-a456-426614174000')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Updated Public User' })
        .expect(403);
    });
  });

  /**
   * The single test here was titled 'should create a user and return 201' and asserted `.expect(403)`,
   * never asserted that `usersService.create` was called, and signed a token with no `adminRole` — so
   * `RolesGuard` answered 403 for a reason unrelated to the route's success path. The success path was
   * never executed by any test. These four cover it, and each negative one asserts the service was
   * NOT reached, which is the half a 403-only assertion cannot distinguish.
   */
  describe('POST /users', () => {
    it('should create a user and return 201', async () => {
      const token = await superAdminToken();
      vi.mocked(usersService.create).mockResolvedValue({ id: 'user-9' } as unknown as ClientUser);

      const res = await request(httpServer)
        .post('/users')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'New Person',
          username: 'newperson',
          email: 'new@example.com',
          password: 'SecurePass123!',
        })
        .expect(201);

      expect(res.body).toHaveProperty('id', 'user-9');
      expect(usersService.create).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'new@example.com', username: 'newperson' }),
      );
    });

    it('should forbid the create when the caller is a plain reader', async () => {
      const token = await generateToken('reader-1', 'reader@example.com', 'reader');

      await request(httpServer)
        .post('/users')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'New Person',
          username: 'newperson',
          email: 'new@example.com',
          password: 'SecurePass123!',
        })
        .expect(403);

      expect(usersService.create).not.toHaveBeenCalled();
    });

    it('should forbid the create when the caller is an admin without the super-admin role', async () => {
      // `accountType` is ADMIN and the role is financial, so this exercises the ROLE half of
      // `@Secured` rather than the account-type half.
      const token = await generateToken('fin-1', 'fin@example.com', 'admin', 'financial_officer');

      await request(httpServer)
        .post('/users')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'New Person',
          username: 'newperson',
          email: 'new@example.com',
          password: 'SecurePass123!',
        })
        .expect(403);

      expect(usersService.create).not.toHaveBeenCalled();
    });

    it('should forbid the create with no token at all', async () => {
      await request(httpServer)
        .post('/users')
        .send({
          name: 'New Person',
          username: 'newperson',
          email: 'new@example.com',
          password: 'SecurePass123!',
        })
        .expect(401);

      expect(usersService.create).not.toHaveBeenCalled();
    });
  });

  /**
   * `DELETE /users/:id` had NO test at all — the suite covered `DELETE /users/me` only, so a route
   * that soft-deletes an arbitrary account by id was entirely uncovered.
   */
  describe('DELETE /users/:id', () => {
    it('should soft delete the named user when the caller is a super admin', async () => {
      const token = await superAdminToken();
      vi.mocked(usersService.softDelete).mockResolvedValue(undefined);

      await request(httpServer)
        .delete('/users/923e4567-e89b-12d3-a456-426614174000')
        .set('Authorization', `Bearer ${token}`)
        .expect(204);

      expect(usersService.softDelete).toHaveBeenCalledWith('923e4567-e89b-12d3-a456-426614174000');
    });

    it('should forbid deleting another user when not an administrator', async () => {
      const token = await generateToken('reader-1', 'reader@example.com', 'reader');

      await request(httpServer)
        .delete('/users/923e4567-e89b-12d3-a456-426614174000')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);

      expect(usersService.softDelete).not.toHaveBeenCalled();
    });

    it('should reject an unauthenticated delete with 401', async () => {
      await request(httpServer).delete('/users/923e4567-e89b-12d3-a456-426614174000').expect(401);

      expect(usersService.softDelete).not.toHaveBeenCalled();
    });
  });

  describe('DELETE /users/me', () => {
    it('should soft delete the calling user', async () => {
      const token = await generateToken('123e4567-e89b-12d3-a456-426614174000', 'test@example.com', 'reader');
      vi.mocked(usersService.softDelete).mockResolvedValue(undefined);

      await request(httpServer).delete('/users/me').set('Authorization', `Bearer ${token}`).expect(204);

      expect(usersService.softDelete).toHaveBeenCalledWith('123e4567-e89b-12d3-a456-426614174000');
    });

    it('should reject an unauthenticated delete with 401', async () => {
      await request(httpServer).delete('/users/me').expect(401);
      expect(usersService.softDelete).not.toHaveBeenCalled();
    });
  });

  describe('verification routes', () => {
    it('should report the verification status of the calling user', async () => {
      const token = await generateToken('123e4567-e89b-12d3-a456-426614174000', 'test@example.com', 'reader');
      vi.mocked(verificationService.status).mockResolvedValue({
        userId: '123e4567-e89b-12d3-a456-426614174000',
        isVerified: false,
        verifiedAt: null,
      });

      const res = await request(httpServer)
        .get('/users/me/verification')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body).toMatchObject({ isVerified: false });
    });

    it('should request a verification token for the calling user', async () => {
      const token = await generateToken('123e4567-e89b-12d3-a456-426614174000', 'test@example.com', 'reader');
      vi.mocked(verificationService.request).mockResolvedValue({
        userId: '123e4567-e89b-12d3-a456-426614174000',
        alreadyVerified: false,
        cooldownSeconds: 60,
      });

      const res = await request(httpServer)
        .post('/users/me/verification')
        .set('Authorization', `Bearer ${token}`)
        .expect(202);

      expect(res.body).toMatchObject({ alreadyVerified: false, cooldownSeconds: 60 });
    });

    it('should confirm a verification token without authentication', async () => {
      vi.mocked(verificationService.confirm).mockResolvedValue({
        userId: '123e4567-e89b-12d3-a456-426614174000',
        isVerified: true,
        verifiedAt: '2026-01-01T00:00:00.000Z',
      });

      const res = await request(httpServer)
        .post('/users/verification/confirm')
        .send({ token: 'a'.repeat(48) })
        .expect(200);

      expect(res.body).toMatchObject({ isVerified: true });
      expect(verificationService.confirm).toHaveBeenCalledWith('a'.repeat(48));
    });
  });
});
