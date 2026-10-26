import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';

import { checkDatabaseHealth } from './db/router.ts';
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
 * The names a readiness failure can report, and the only vocabulary a probe's log aggregator should
 * have to parse. A string union rather than an enum: the value is written into an HTTP body that an
 * operator reads, and a nameless `0` would make the answer useless.
 */
export type ReadinessDependency = 'postgres' | 'valkey';

/**
 * The 200 body for `GET /health/ready`.
 *
 * `status: 'ready'` rather than `healthy`, so the two routes never answer the same word. `GET /health`
 * says `healthy` when it is degraded but reachable; a probe reading `healthy` on this route would be a
 * different sentence from the one the index makes.
 */
export type ReadinessSuccessBody = {
  status: 'ready';
  timestamp: string;
};

/**
 * One failing dependency, as it appears in the 503 body's `details` array.
 *
 * WHY THE FAILING DEPENDENCY IS A NAMED OBJECT AND NOT A BARE STRING. The body is read by a human
 * after a probe has fired, and by a log aggregator that greps it. `{"dependency":"postgres"}` is
 * answerable without a lookup; `"postgres"` alone would be indistinguishable from a message
 * fragment once the envelope is flattened.
 */
export type ReadinessFailureDetail = {
  readonly dependency: ReadinessDependency;
};

/**
 * The payload the 503 carries.
 *
 * SHAPED TO SURVIVE `AllExceptionsFilter` — see the note on `getReadiness` for why that is the whole
 * design here. The filter rebuilds every error body into the application's single envelope
 * (`error`, `message`, `details`, `statusCode`, `timestamp`, `path`) and passes through exactly those
 * fields, so the failing dependencies are carried in `details` and named again in `message`: the
 * envelope is the same one every other route already returns, and the information is still there.
 */
export type ReadinessFailureBody = {
  error: 'NOT_READY';
  message: string;
  details: readonly ReadinessFailureDetail[];
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
      replicas: dbHealth.replicas.map((r) => (r?.healthy ? 'connected' : 'disconnected')),
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

  /**
   * `GET /health/ready` — the readiness probe. 200 only when BOTH the PostgreSQL primary and Valkey
   * answer; 503 otherwise, naming which one did not.
   *
   * WHY THIS ROUTE EXISTS AND WHY `GET /health` WAS NOT CHANGED. `GET /health` answers 200 with a
   * `degraded` body when a dependency is down, by design: an index that 500s when the database is
   * unreachable is useless to the thing that most needs it. A Kubernetes `httpGet` probe only fails on
   * a non-2xx, so it cannot use that route — the exact cost recorded in the note above
   * `ApiIndexResponse`. This route is the separate thing that note called for, and it leaves
   * `GET /health` untouched rather than changing its meaning: a probe wants a binary, a human wants a
   * description, and one route cannot be both.
   *
   * WHY UNAUTHENTICATED. A probe carries no token. Gating this route on a credential would make the
   * readiness answer depend on the thing being probed, which is circular.
   *
   * WHY IT RE-RUNS THE PROBES INSTEAD OF READING `getHealth()`'S ANSWER. `getHealth()` returns a body,
   * not an exception, so its answer cannot be distinguished here without re-parsing a string it
   * produced for a different reader. The HEALTH question and the READINESS question differ only in
   * their threshold — readiness needs the primary AND Valkey, where `health` also passes on a replica
   * outage — so both call the same two probes (`checkDatabaseHealth`, `ValkeyService.ping`) and differ
   * in one comparison. Sharing the probe and not the answer is what keeps `GET /health` answering 200
   * when it should (Principle #9): there is no code path where a probe's semantics leak into the index.
   *
   * WHY THE REPLICAS ARE NOT IN THE 503 BODY. A replica outage does not make the service unready — it
   * can serve reads from the primary — so a replica is never a reason for the 503 and a body that
   * mentioned it would be naming a dependency that had not failed. `GET /health` reports the replica
   * state for exactly this reason: the top-level view of the topology belongs to the route that is
   * always 200, and the failure reason belongs to the route that is a probe.
   *
   * WHY THE PAYLOAD IS SHAPED THE WAY IT IS. The global `AllExceptionsFilter` REBUILDS every error body
   * into the application's single envelope (`error`, `message`, `details`, `statusCode`, `timestamp`,
   * `path`) and passes through exactly those fields — a bespoke body attached to the exception is
   * discarded, and the failing dependency it named would be gone before the response was written. So
   * the dependencies are carried in `details` (the array the envelope already has for structured
   * detail) and named again in `message`, which keeps this route's 503 inside the one envelope every
   * other route already returns. The alternative — a route-scoped filter, or a bespoke body — would
   * make this the only error response in the API that a client has to parse differently (Principle #9).
   */
  @Get('health/ready')
  async getReadiness(): Promise<ReadinessSuccessBody> {
    const dbHealth = await checkDatabaseHealth();
    const valkeyHealthy = await this.checkValkey();

    const failing: ReadinessDependency[] = [];
    if (!dbHealth.primary) {
      failing.push('postgres');
    }
    if (!valkeyHealthy) {
      failing.push('valkey');
    }

    if (failing.length > 0) {
      throw new ServiceUnavailableException({
        error: 'NOT_READY',
        message: `Service is not ready: ${failing.join(', ')}`,
        details: failing.map((dependency) => ({ dependency }) satisfies ReadinessFailureDetail),
      } satisfies ReadinessFailureBody);
    }

    return { status: 'ready', timestamp: new Date().toISOString() };
  }
}
