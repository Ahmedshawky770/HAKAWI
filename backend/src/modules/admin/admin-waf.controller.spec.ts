import type { Server } from 'node:http';

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.ts';
import { PermissionsGuard } from '../../common/guards/permissions.guard.ts';
import { IpBlocklistService, type BlockRecord, type BlockOptions } from '../../common/waf/ip-blocklist.service.ts';
import { WinstonLoggerService } from '../../common/services/winston-logger.service.ts';

import { AdminWafController } from './admin-waf.controller.ts';

type IpBlocklistServiceMock = {
  listBlocked: ReturnType<typeof vi.fn<() => Promise<BlockRecord[]>>>;
  block: ReturnType<typeof vi.fn<(ip: string, options: BlockOptions) => Promise<boolean>>>;
  unblock: ReturnType<typeof vi.fn<(ip: string) => Promise<boolean>>>;
};

describe('AdminWafController', () => {
  let app: INestApplication<Server>;
  let ipBlocklistService: IpBlocklistServiceMock;

  beforeEach(async () => {
    vi.clearAllMocks();

    ipBlocklistService = {
      listBlocked: vi.fn<() => Promise<BlockRecord[]>>().mockResolvedValue([]),
      block: vi.fn<(ip: string, options: BlockOptions) => Promise<boolean>>().mockResolvedValue(true),
      unblock: vi.fn<(ip: string) => Promise<boolean>>().mockResolvedValue(true),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [AdminWafController],
      providers: [
        { provide: IpBlocklistService, useValue: ipBlocklistService },
        { provide: WinstonLoggerService, useValue: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), log: vi.fn(), debug: vi.fn(), verbose: vi.fn() } },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionsGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app?.close();
  });

  it('should get blocked IPs', async () => {
    const res = await request(app.getHttpServer()).get('/admin/waf/blocked-ips').expect(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('should block IP', async () => {
    ipBlocklistService.block.mockResolvedValue(true);
    const res = await request(app.getHttpServer())
      .post('/admin/waf/block-ip')
      .send({ ip: '1.2.3.4', reason: 'test', kind: 'permanent' })
      .expect(201);
    expect((res.body as { success: boolean }).success).toBe(true);
  });

  it('should unblock IP', async () => {
    ipBlocklistService.unblock.mockResolvedValue(true);
    const res = await request(app.getHttpServer())
      .post('/admin/waf/unblock-ip')
      .send({ ip: '1.2.3.4' })
      .expect(200);
    expect((res.body as { success: boolean }).success).toBe(true);
  });
});
