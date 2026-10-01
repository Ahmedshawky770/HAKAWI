import { describe, it, expect, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { ConfigModule } from '@nestjs/config';
import type { INestApplication } from '@nestjs/common';

import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.ts';
import { RolesGuard } from '../../common/guards/roles.guard.ts';
import { PermissionsGuard } from '../../common/guards/permissions.guard.ts';
import { WinstonLoggerService } from '../../common/services/winston-logger.service.ts';
import { ModerationController } from './moderation.controller.ts';
import { ModerationService } from './moderation.service.ts';
import { AdminDashboardService } from './admin-dashboard.service.ts';
import { AdminDashboardStatsDto } from './dto/admin-dashboard.dto.ts';

const JWT_SECRET = 'test-jwt-secret-for-route-specs';

type RouteSummary = { method: string; path: string };

const DOCUMENTED_ROUTES: readonly RouteSummary[] = [
  { method: 'POST', path: '/moderation/reports' },
  { method: 'GET', path: '/moderation/reports' },
  { method: 'PATCH', path: '/moderation/reports/:id' },
  { method: 'POST', path: '/moderation/reports/:id/actions' },
  { method: 'GET', path: '/moderation/stats' },
  { method: 'GET', path: '/moderation/reports/trends' },
  { method: 'GET', path: '/moderation/users/:id/restrictions' },
  { method: 'GET', path: '/moderation/actions' },
];

function emptyStats(): AdminDashboardStatsDto {
  return {
    totalReports: 0,
    openReports: 0,
    escalatedReports: 0,
    inReviewReports: 0,
    resolvedReports: 0,
    dismissedReports: 0,
    totalActions: 0,
    totalRestrictions: 0,
    activeRestrictions: 0,
    avgResolutionMinutes: null,
  };
}

describe('ModerationController route surface', () => {
  let app: INestApplication;

  async function registeredRoutes(): Promise<RouteSummary[]> {
    const server = app.getHttpAdapter().getInstance() as {
      router?: { stack: { route?: { path: string; methods: Record<string, boolean> } }[] };
    };
    const stack = server.router?.stack ?? [];
    const routes: RouteSummary[] = [];
    for (const layer of stack) {
      const route = layer.route;
      if (!route) {
        continue;
      }
      for (const [method, enabled] of Object.entries(route.methods)) {
        if (enabled) {
          routes.push({ method: method.toUpperCase(), path: route.path });
        }
      }
    }
    return routes;
  }

  it('should register every documented moderation route exactly once', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, load: [] })],
      controllers: [ModerationController],
      providers: [
        { provide: ModerationService, useValue: {} },
        { provide: AdminDashboardService, useValue: { getStats: vi.fn().mockResolvedValue(emptyStats()) } },
        { provide: WinstonLoggerService, useValue: { info: vi.fn(), error: vi.fn() } },
        JwtAuthGuard,
        RolesGuard,
        PermissionsGuard,
        { provide: Reflector, useValue: new Reflector() },
        { provide: JwtService, useValue: new JwtService({ secret: JWT_SECRET }) },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    const routes = await registeredRoutes();

    for (const documented of DOCUMENTED_ROUTES) {
      const matches = routes.filter((route) => route.method === documented.method && route.path === documented.path);
      expect(matches).toHaveLength(1);
    }

    await app.close();
  });

  it('should register exactly one controller for the moderation prefix', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, load: [] })],
      controllers: [ModerationController],
      providers: [
        { provide: ModerationService, useValue: {} },
        { provide: AdminDashboardService, useValue: { getStats: vi.fn().mockResolvedValue(emptyStats()) } },
        { provide: WinstonLoggerService, useValue: { info: vi.fn(), error: vi.fn() } },
        JwtAuthGuard,
        RolesGuard,
        PermissionsGuard,
        { provide: Reflector, useValue: new Reflector() },
        { provide: JwtService, useValue: new JwtService({ secret: JWT_SECRET }) },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    const routes = await registeredRoutes();
    const moderationRoutes = routes.filter((route) => route.path.startsWith('/moderation'));

    expect(moderationRoutes).toHaveLength(DOCUMENTED_ROUTES.length);

    await app.close();
  });
});
