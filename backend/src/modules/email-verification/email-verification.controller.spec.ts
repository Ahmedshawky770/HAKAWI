import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { EmailVerificationController } from './email-verification.controller.ts';
import { EmailVerificationService } from './email-verification.service.ts';
import { WinstonLoggerService } from '../../common/services/winston-logger.service.ts';

describe('EmailVerificationController', () => {
  let app: INestApplication;
  let service: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    service = {
      verifyToken: vi.fn().mockResolvedValue({ verified: true }),
      resend: vi.fn().mockResolvedValue({}),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [EmailVerificationController],
      providers: [
        { provide: EmailVerificationService, useValue: service },
        { provide: WinstonLoggerService, useValue: { info: vi.fn() } },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(async () => { await app?.close(); });

  it('should verify email token', async () => {
    service.verifyToken.mockResolvedValue({ verified: true });
    const res = await request(app.getHttpServer())
      .post('/auth/verify-email')
      .send({ token: 'a'.repeat(48) })
      .expect(200);
    expect(res.body.verified).toBe(true);
  });
});
