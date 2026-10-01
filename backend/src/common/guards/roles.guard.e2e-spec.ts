import { type Server } from 'http';

import { Controller, Get, Patch, Post } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';

import { AccountType, AdminRole } from '../constants/roles.ts';
import { RequireAdminRole, RequirePermissions } from '../decorators/roles.decorator.ts';
import { Secured } from '../decorators/secured.decorator.ts';
import { Permission } from '../permissions/permissions.ts';

import { JwtAuthGuard } from './jwt-auth.guard.ts';
import { PermissionsGuard } from './permissions.guard.ts';
import { RolesGuard } from './roles.guard.ts';

const JWT_SECRET = 'test-jwt-secret-for-roles-guard-e2e';

@Controller('moderation')
class RolesGuardE2eController {
  @Secured()
  @Post('reports')
  @RequirePermissions(Permission.REPORTS_CREATE)
  createReport(): { created: boolean } {
    return { created: true };
  }

  @Secured(AccountType.ADMIN)
  @RequireAdminRole(AdminRole.CONTENT_MODERATOR)
  @RequirePermissions(Permission.REPORTS_VIEW)
  @Get('reports')
  findAllReports(): { reports: string[] } {
    return { reports: [] };
  }

  @Secured(AccountType.ADMIN)
  @RequireAdminRole(AdminRole.CONTENT_MODERATOR)
  @RequirePermissions(Permission.REPORTS_UPDATE_ALL)
  @Patch('reports/:id')
  updateReport(): { status: string } {
    return { status: 'resolved' };
  }

  @Secured(AccountType.ADMIN)
  @RequireAdminRole(AdminRole.SUPER_ADMIN)
  @RequirePermissions(Permission.STATS_VIEW)
  @Get('stats')
  getStats(): { totalReports: number } {
    return { totalReports: 0 };
  }
}

interface TestPrincipal {
  sub: string;
  accountType: string;
  adminRole?: string;
}

describe('RolesGuard e2e', () => {
  let app: INestApplication;
  let httpServer: Server;
  let jwtService: JwtService;

  const signToken = (principal: TestPrincipal): string =>
    jwtService.sign({
      sub: principal.sub,
      email: `${principal.sub}@example.com`,
      accountType: principal.accountType,
      ...(principal.adminRole === undefined ? {} : { adminRole: principal.adminRole }),
    });

  const readerToken = (): string => signToken({ sub: 'reader-1', accountType: AccountType.READER });
  const writerToken = (): string => signToken({ sub: 'writer-1', accountType: AccountType.WRITER });
  const legacyAuthorToken = (): string => signToken({ sub: 'legacy-1', accountType: 'author' });
  const moderatorToken = (): string =>
    signToken({ sub: 'mod-1', accountType: AccountType.ADMIN, adminRole: AdminRole.CONTENT_MODERATOR });
  const superAdminToken = (): string =>
    signToken({ sub: 'root-1', accountType: AccountType.ADMIN, adminRole: AdminRole.SUPER_ADMIN });
  const adminWithoutRoleToken = (): string => signToken({ sub: 'admin-1', accountType: AccountType.ADMIN });
  const financialOfficerToken = (): string =>
    signToken({ sub: 'finance-1', accountType: AccountType.ADMIN, adminRole: AdminRole.FINANCIAL_OFFICER });

  beforeAll(async () => {
    jwtService = new JwtService({ secret: JWT_SECRET });

    const moduleRef = await Test.createTestingModule({
      controllers: [RolesGuardE2eController],
      providers: [
        JwtAuthGuard,
        RolesGuard,
        PermissionsGuard,
        {
          provide: JwtService,
          useValue: jwtService,
        },
        {
          provide: ConfigService,
          useValue: { get: () => JWT_SECRET },
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

  describe('authentication', () => {
    it('returns 401 without a token', async () => {
      await request(httpServer).get('/moderation/reports').expect(401);
    });

    it('returns 401 for an invalid token', async () => {
      await request(httpServer).get('/moderation/reports').set('Authorization', 'Bearer not-a-real-token').expect(401);
    });
  });

  describe('POST /moderation/reports', () => {
    it('allows any authenticated reader', async () => {
      await request(httpServer).post('/moderation/reports').set('Authorization', `Bearer ${readerToken()}`).expect(201);
    });

    it('allows the legacy author account type', async () => {
      await request(httpServer)
        .post('/moderation/reports')
        .set('Authorization', `Bearer ${legacyAuthorToken()}`)
        .expect(201);
    });

    it('rejects an anonymous caller', async () => {
      await request(httpServer).post('/moderation/reports').expect(401);
    });
  });

  describe('GET /moderation/reports', () => {
    it('returns 403 for a reader', async () => {
      await request(httpServer).get('/moderation/reports').set('Authorization', `Bearer ${readerToken()}`).expect(403);
    });

    it('returns 403 for a writer', async () => {
      await request(httpServer).get('/moderation/reports').set('Authorization', `Bearer ${writerToken()}`).expect(403);
    });

    it('returns 403 for a legacy author', async () => {
      await request(httpServer)
        .get('/moderation/reports')
        .set('Authorization', `Bearer ${legacyAuthorToken()}`)
        .expect(403);
    });

    it('returns 403 for an admin account without an admin role', async () => {
      await request(httpServer)
        .get('/moderation/reports')
        .set('Authorization', `Bearer ${adminWithoutRoleToken()}`)
        .expect(403);
    });

    it('returns 403 for a financial officer, who is not a content moderator', async () => {
      await request(httpServer)
        .get('/moderation/reports')
        .set('Authorization', `Bearer ${financialOfficerToken()}`)
        .expect(403);
    });

    it('allows a content moderator', async () => {
      await request(httpServer)
        .get('/moderation/reports')
        .set('Authorization', `Bearer ${moderatorToken()}`)
        .expect(200);
    });

    it('allows a super admin through the moderator hierarchy', async () => {
      await request(httpServer)
        .get('/moderation/reports')
        .set('Authorization', `Bearer ${superAdminToken()}`)
        .expect(200);
    });
  });

  describe('PATCH /moderation/reports/:id', () => {
    it('returns 403 for a reader', async () => {
      await request(httpServer)
        .patch('/moderation/reports/report-1')
        .set('Authorization', `Bearer ${readerToken()}`)
        .send({ status: 'resolved' })
        .expect(403);
    });

    it('allows a content moderator', async () => {
      await request(httpServer)
        .patch('/moderation/reports/report-1')
        .set('Authorization', `Bearer ${moderatorToken()}`)
        .send({ status: 'resolved' })
        .expect(200);
    });
  });

  describe('GET /moderation/stats', () => {
    it('returns 403 for a reader', async () => {
      await request(httpServer).get('/moderation/stats').set('Authorization', `Bearer ${readerToken()}`).expect(403);
    });

    it('returns 403 for a content moderator', async () => {
      await request(httpServer).get('/moderation/stats').set('Authorization', `Bearer ${moderatorToken()}`).expect(403);
    });

    it('allows a super admin', async () => {
      await request(httpServer)
        .get('/moderation/stats')
        .set('Authorization', `Bearer ${superAdminToken()}`)
        .expect(200);
    });
  });
});
