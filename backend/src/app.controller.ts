import { Controller, Get, Inject } from '@nestjs/common';
import { sql } from 'drizzle-orm';

import { db, checkDatabaseHealth } from './db/router.ts';
import { ValkeyService } from './common/services/valkey.service.ts';
import { SWAGGER_API_PATH, SWAGGER_TITLE, SWAGGER_VERSION } from './common/swagger/swagger.config.ts';

export type DependencyStatus = 'connected' | 'disconnected';

export type HealthResponse = {
  status: 'healthy' | 'degraded';
  database: DependencyStatus;
  replicas: DependencyStatus[];
  valkey: DependencyStatus;
  timestamp: string;
};

/**
 * The unauthenticated service index served at `GET /api/v1/`.
 *
 * WHY THIS IS NOT A GREETING. This route was `"Hello World!"` — the Nest scaffold's `getHello`,
 * with an `AppService` whose only method returned that string. It sat at the exact path an uptime
 * probe, a load-balancer check and a new developer's `curl` all hit first, and it told none of them
 * anything. `AppService` is deleted: a class whose entire content was a placeholder is the shape
 * `common/guards/README.md` calls "false assurance", and it was wired into `AppModule` as a provider.
 *
 * It answers the three questions a first request actually has — where is this, where are its docs, and
 * is it currently healthy — in one round trip, because `health` is embedded rather than merely linked.
 *
 * IT STAYS 200 EVEN WHEN A DEPENDENCY IS DOWN, exactly like `GET /health`. An index that 500s when the
 * database is unreachable is useless to the thing that most needs it. The degradation is carried in
 * `health.status`, not in the HTTP code. (That is a deliberate choice and it has a cost: a Kubernetes
 * `httpGet` readiness probe cannot use this route as-is, because it only fails on a non-2xx. A
 * deployment that wants a probe needs a separate route that returns 503 — see the open items rather
 * than changing this one, because a probe and a human-facing index want opposite behaviour.)
 */
export type ApiIndexResponse = {
  name: string;
  version: string;
  prefix: string;
  documentation: string;
  health: HealthResponse;
};

@Controller()
export class AppController {
  constructor(private readonly valkeyService: ValkeyService) {}

  @Get()
  async getIndex(): Promise<ApiIndexResponse> {
    return {
      name: SWAGGER_TITLE,
      version: SWAGGER_VERSION,
      prefix: 'api/v1',
      // `SwaggerModule.setup` is called AFTER `setGlobalPrefix`, so the served path carries the
      // prefix too. If a future change moves the setup call, this string is the thing that goes stale
      // silently — there is no test that can assert it without booting Swagger.
      documentation: `/api/v1/${SWAGGER_API_PATH}`,
      health: await this.getHealth(),
    };
  }

  @Get('health')
  async getHealth(): Promise<HealthResponse> {
    const dbHealth = await checkDatabaseHealth();
    const valkeyHealthy = await this.checkValkey();

    // Overall healthy if primary is up and at least one replica is up (if replicas configured)
    const replicasConfigured = dbHealth.replicas.length > 0;
    const primaryUp = dbHealth.primary;
    const replicasUp = replicasConfigured ? dbHealth.replicas.some((r) => r) : true;

    return {
      status: primaryUp && valkeyHealthy && replicasUp ? 'healthy' : 'degraded',
      database: primaryUp ? 'connected' : 'disconnected',
      replicas: dbHealth.replicas.map((r) => (r ? 'connected' : 'disconnected')),
      valkey: valkeyHealthy ? 'connected' : 'disconnected',
      timestamp: new Date().toISOString(),
    };
  }

  private async checkValkey(): Promise<boolean> {
    try {
      await this.valkeyService.ping();
      return true;
    } catch {
      return false;
    }
  }
}
