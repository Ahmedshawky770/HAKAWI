import type { Server } from 'node:http';

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ExecutionContext, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.ts';
import { PermissionsGuard } from '../../common/guards/permissions.guard.ts';
import { WinstonLoggerService } from '../../common/services/winston-logger.service.ts';

import { MfaService, type MfaSetupResult, type MfaVerificationResult } from './mfa.service.ts';
import { MfaController } from './mfa.controller.ts';

type MfaServiceMock = {
  initiateSetup: ReturnType<typeof vi.fn<(userId: string) => Promise<MfaSetupResult>>>;
  completeSetup: ReturnType<
    typeof vi.fn<(userId: string, token: string) => Promise<{ backupCodes: string[] }>>
  >;
  verifyToken: ReturnType<typeof vi.fn<(userId: string, token: string) => Promise<MfaVerificationResult>>>;
  disableMfa: ReturnType<typeof vi.fn<(userId: string) => Promise<void>>>;
  isMfaEnabled: ReturnType<typeof vi.fn<(userId: string) => Promise<boolean>>>;
  shouldEnforceMfa: ReturnType<typeof vi.fn<(userId: string) => Promise<boolean>>>;
  getBackupCodesCount: ReturnType<typeof vi.fn<(userId: string) => Promise<number>>>;
  regenerateBackupCodes: ReturnType<typeof vi.fn<(userId: string) => Promise<string[]>>>;
  usersRepository: {
    findById: ReturnType<typeof vi.fn<(userId: string) => Promise<{ mfaEnforcedAt: Date | null } | null>>>;
  };
};

describe('MfaController', () => {
  let app: INestApplication<Server>;
  let mfaService: MfaServiceMock;

  beforeEach(async () => {
    vi.clearAllMocks();

    mfaService = {
      initiateSetup: vi.fn<(userId: string) => Promise<MfaSetupResult>>(),
      completeSetup: vi.fn<(userId: string, token: string) => Promise<{ backupCodes: string[] }>>(),
      verifyToken: vi.fn<(userId: string, token: string) => Promise<MfaVerificationResult>>(),
      disableMfa: vi.fn<(userId: string) => Promise<void>>(),
      isMfaEnabled: vi.fn<(userId: string) => Promise<boolean>>().mockResolvedValue(false),
      shouldEnforceMfa: vi.fn<(userId: string) => Promise<boolean>>().mockResolvedValue(false),
      getBackupCodesCount: vi.fn<(userId: string) => Promise<number>>().mockResolvedValue(0),
      regenerateBackupCodes: vi.fn<(userId: string) => Promise<string[]>>(),
      usersRepository: {
        findById: vi
          .fn<(userId: string) => Promise<{ mfaEnforcedAt: Date | null } | null>>()
          .mockResolvedValue(null),
      },
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [MfaController],
      providers: [
        { provide: MfaService, useValue: mfaService },
        { provide: WinstonLoggerService, useValue: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), log: vi.fn(), debug: vi.fn(), verbose: vi.fn() } },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (ctx: ExecutionContext) => {
          const req = ctx.switchToHttp().getRequest<{ user?: unknown }>();
          req.user = { sub: 'user-123', email: 'test@example.com', accountType: 'reader' };
          return true;
        },
      })
      .overrideGuard(PermissionsGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app?.close();
  });

  describe('GET /auth/mfa/status', () => {
    it('should get MFA status', async () => {
      mfaService.isMfaEnabled.mockResolvedValue(true);
      mfaService.getBackupCodesCount.mockResolvedValue(8);
      mfaService.usersRepository.findById.mockResolvedValue({ mfaEnforcedAt: new Date() });

      const res = await request(app.getHttpServer())
        .get('/auth/mfa/status')
        .expect(200);

      expect(res.body).toHaveProperty('enabled');
    });
  });

  describe('POST /auth/mfa/setup', () => {
    it('should initiate MFA setup', async () => {
      const setupData = {
        secret: 'TESTSECRET',
        otpauthUrl: 'otpauth://...',
        qrCodeDataUrl: 'data:image/png;base64,...',
        backupCodes: ['CODE1', 'CODE2'],
      };
      mfaService.initiateSetup.mockResolvedValue(setupData);

      const res = await request(app.getHttpServer())
        .post('/auth/mfa/setup')
        .expect(200);

      expect(res.body).toEqual(setupData);
    });
  });

  describe('POST /auth/mfa/verify', () => {
    it('should complete MFA setup by verifying', async () => {
      mfaService.completeSetup.mockResolvedValue({ backupCodes: ['CODE1'] });

      const res = await request(app.getHttpServer())
        .post('/auth/mfa/verify')
        .send({ token: '123456' })
        .expect(200);

      expect(res.body).toHaveProperty('verified');
    });
  });

  describe('POST /auth/mfa/challenge', () => {
    it('should verify challenge', async () => {
      mfaService.verifyToken.mockResolvedValue({ verified: true });

      const res = await request(app.getHttpServer())
        .post('/auth/mfa/challenge')
        .send({ token: '123456' })
        .expect(200);

      expect(res.body).toEqual({ verified: true });
    });
  });

  describe('DELETE /auth/mfa', () => {
    it('should disable MFA', async () => {
      mfaService.disableMfa.mockResolvedValue(undefined);

      const res = await request(app.getHttpServer())
        .delete('/auth/mfa')
        .send({ password: 'password' })
        .expect(200);

      expect((res.body as { message: string }).message).toContain('MFA disabled');
    });
  });
});
