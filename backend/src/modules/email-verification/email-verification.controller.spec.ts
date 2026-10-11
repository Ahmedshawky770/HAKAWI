import type { Server } from 'http';

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { WinstonLoggerService } from '../../common/services/winston-logger.service.ts';

import { EmailVerificationController } from './email-verification.controller.ts';
import { EmailVerificationService } from './email-verification.service.ts';

type MockEmailVerificationService = {
  verifyToken: ReturnType<typeof vi.fn<(token: string) => Promise<{ verified: boolean }>>>;
};

describe('EmailVerificationController', () => {
  let app: INestApplication;
  let service: MockEmailVerificationService;

  beforeEach(async () => {
    vi.clearAllMocks();
    service = {
      verifyToken: vi.fn<(token: string) => Promise<{ verified: boolean }>>(),
    };
    service.verifyToken.mockResolvedValue({ verified: true });

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

  afterEach(async () => {
    await app?.close();
  });

  it('should verify email token', async () => {
    service.verifyToken.mockResolvedValue({ verified: true });
    const httpServer = app.getHttpServer() as Server;
    const res = await request(httpServer)
      .post('/auth/verify-email')
      .send({ token: 'a'.repeat(48) })
      .expect(200);
    expect(res.body).toHaveProperty('verified', true);
  });
});
