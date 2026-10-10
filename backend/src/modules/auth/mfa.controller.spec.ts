import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.ts';
import { PermissionsGuard } from '../../common/guards/permissions.guard.ts';
import { MfaService } from './mfa.service.ts';
import { MfaController } from './mfa.controller.ts';
import { WinstonLoggerService } from '../../common/services/winston-logger.service.ts';

describe('MfaController', () => {
  let app: INestApplication;
  let mfaService: any;

  beforeEach(async () => {
    vi.clearAllMocks();

    mfaService = {
      initiateSetup: vi.fn(),
      completeSetup: vi.fn(),
      verifyToken: vi.fn(),
      disableMfa: vi.fn(),
      isMfaEnabled: vi.fn().mockResolvedValue(false),
      shouldEnforceMfa: vi.fn().mockResolvedValue(false),
      getBackupCodesCount: vi.fn().mockResolvedValue(0),
      regenerateBackupCodes: vi.fn(),
      usersRepository: {
        findById: vi.fn().mockResolvedValue(null),
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
      .useValue({ canActivate: (ctx: any) => {
        const req = ctx.switchToHttp().getRequest();
        req.user = { sub: 'user-123', email: 'test@example.com', accountType: 'reader' };
        return true;
      }})
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

      expect(res.body.message).toContain('MFA disabled');
    });
  });
});
