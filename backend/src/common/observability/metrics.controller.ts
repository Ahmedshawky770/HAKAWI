import { Controller, Get, Inject, UseGuards } from '@nestjs/common';
import { getStorageToken } from '@nestjs/throttler';

import { AdminRole } from '../constants/roles.ts';
import { RequireAdminRole } from '../decorators/roles.decorator.ts';
import { JwtAuthGuard } from '../guards/jwt-auth.guard.ts';
import { RolesGuard } from '../guards/roles.guard.ts';
import { CacheMetrics } from '../interceptors/cache.interceptor.ts';
import { IpBlocklistService } from '../waf/ip-blocklist.service.ts';
import type { ValkeyThrottlerStorage } from '../throttler/valkey-throttler.storage.ts';
import type { CacheMetricsSnapshot } from '../interceptors/cache.interceptor.ts';
import type { IpBlocklistHealth } from '../waf/ip-blocklist.service.ts';
import type { ThrottlerStorageHealth } from '../throttler/valkey-throttler.storage.ts';

/**
 * `GET /api/v1/metrics/cache` — cache counters.
 * `GET /api/v1/metrics/degradation` — is a security control currently on its fallback?
 *
 * WHY THESE ARE CONTROLLERS AND NOT RAW EXPRESS ROUTES.
 * `main.ts` used to register `/api/v1/metrics/cache` directly on the Express adapter,
 * AFTER the WAF middleware. A handler mounted on the raw adapter is not part of the Nest
 * routing tree, so it bypassed every layer the rest of the API is protected by:
 * `JwtAuthGuard`, `RolesGuard`, the global `ValidationPipe`, the global
 * `AllExceptionsFilter`, the `LoggingInterceptor` and the global `api/v1` prefix. The
 * endpoint publicly exposed cache hit-rate counters to an anonymous caller.
 *
 * Moving it into the module tree puts it behind exactly the same chain as every other
 * route, and it FAILS CLOSED: `JwtAuthGuard` rejects a request with no verified token
 * with 401, and `RolesGuard` rejects any caller that is not a super admin with 403.
 * There is no branch that returns a snapshot to an unverified caller.
 *
 * Access is deliberately the narrowest that still makes the metric actionable. These are
 * operational signals; a content moderator or a financial officer has no reason to read
 * them, so the guard requires the super-admin role rather than the broader `admin`
 * account type.
 */
export interface CacheMetricsResponse extends CacheMetricsSnapshot {
  /** Named so a scraper can attribute the payload when several components report. */
  readonly component: 'CacheMetrics';
}

/**
 * ALERT ON `degraded: true`, and on `degradationCount > 0` after the fact.
 *
 * Both controls below are deliberately fail-OPEN when Valkey is unavailable, because
 * they sit in front of the whole API and an outage must not take it down. The cost is
 * stated here so it can be alerted on rather than discovered:
 *
 * - `rateLimiter` on the in-memory fallback: the limiter still runs, but counters are
 *   per process, so a budget is not shared across replicas and the effective limit is
 *   multiplied by the replica count.
 * - `wafBlocklist` unreachable: with the default `WAF_FAIL_MODE=open` no IP is blocked
 *   and no violation is recorded, so temporary and permanent IP blocks cannot be
 *   created or escalated at all.
 *
 * The same episodes also emit a single WARN line carrying `degradationId`; this endpoint
 * is the scrapeable equivalent for deployments that alert on metrics rather than logs.
 */
export interface DegradationMetricsResponse {
  readonly component: 'SecurityDegradation';
  readonly rateLimiter: ThrottlerStorageHealth;
  readonly wafBlocklist: IpBlocklistHealth;
}

@Controller('metrics')
export class CacheMetricsController {
  constructor(
    private readonly metrics: CacheMetrics,
    @Inject(IpBlocklistService) private readonly blocklist: IpBlocklistService,
    @Inject(getStorageToken()) private readonly throttlerStorage: ValkeyThrottlerStorage,
  ) {}

  @Get('cache')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @RequireAdminRole(AdminRole.SUPER_ADMIN)
  snapshot(): CacheMetricsResponse {
    return { component: 'CacheMetrics', ...this.metrics.snapshot() };
  }

  @Get('degradation')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @RequireAdminRole(AdminRole.SUPER_ADMIN)
  degradation(): DegradationMetricsResponse {
    return {
      component: 'SecurityDegradation',
      rateLimiter: this.throttlerStorage.health(),
      wafBlocklist: this.blocklist.health(),
    };
  }
}
