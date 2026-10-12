import { Controller, Get, Header, Inject } from '@nestjs/common';

import { Public } from '../decorators/roles.decorator.ts';

import { PrometheusRegistry } from './prometheus-registry.ts';

/**
 * `GET /api/v1/metrics` — the Prometheus scrape endpoint (Prometheus text exposition format, version
 * `0.0.4`).
 *
 * WHY THIS IS A CONTROLLER ROUTE AND NOT A RAW EXPRESS HANDLER. `main.ts` used to mount
 * `/api/v1/metrics/cache` directly on the Express adapter, after the WAF middleware, and the
 * `common/observability/metrics.controller.ts` header records what that bought: a handler on the raw
 * adapter is outside the Nest routing tree, so it bypassed `JwtAuthGuard`, `RolesGuard`, the global
 * `ValidationPipe`, the global `AllExceptionsFilter` and the global `api/v1` prefix, and it answered any
 * anonymous caller. Declaring this route on a `@Controller` puts it behind the same chain — including
 * the global `ThrottlerGuard`, which through its `default` tier bounds it at roughly 100 requests per
 * minute per verified-or-anonymous caller. A scrape interval of 15–60s is nowhere near that budget, and
 * a runaway poller is held off instead of taking a serving replica's request path with it.
 *
 * WHY THIS FILE AND NOT `metrics.controller.ts`. That controller owns the two JSON operational routes,
 * `cache` and `degradation`, both requiring a super-admin token. They stay exactly as they are: a route
 * that renders the whole exposition body is a different audience from a route that reports cache
 * hit-rate counters, and merging them would put one guard decision over both. Keeping them apart is the
 * loose coupling Principle #7 asks for — one module, two concerns, no shared guard.
 */
@Controller('metrics')
export class PrometheusController {
  constructor(@Inject(PrometheusRegistry) private readonly registry: PrometheusRegistry) {}

  /**
   * `@Public()` IS AN INTENT MARKER ON THIS ROUTE, NOT THE THING THAT MAKES IT PUBLIC. Nothing reads
   * `IS_PUBLIC_KEY` while handling this request: the only guard this application binds globally is
   * `ThrottlerGuard` (`common.module.ts`), and `JwtAuthGuard`, `RolesGuard`, `PermissionsGuard` and
   * `OwnershipGuard` are all attached per route by the module that owns the route — none of which is
   * this one. The route is unauthenticated because NO GUARD CHAIN IS ATTACHED TO IT, not because a
   * guard was told to stand down.
   *
   * The decorator is kept anyway, and this is why: the day somebody attaches `JwtAuthGuard` globally,
   * or copies this handler into a module that already has one, the metadata is what stops the scrape
   * from returning 401 with no code change of its own. Removing it would make the route work today and
   * break silently later.
   *
   * WHAT THE EXPOSURE ACTUALLY IS. The body discloses the deployment's traffic pattern — request counts
   * per route template, process uptime, heap size — and it deliberately carries nothing request-scoped:
   * no path with an id in it, no query string, no username, no correlation id (see
   * `common/interceptors/metrics.interceptor.ts` for why the route label is a template). Who can reach
   * the port at all is decided one layer up: in production the Service is `ClusterIP` and the ingress
   * carries `nginx.ingress.kubernetes.io/whitelist-source-range: "10.0.0.0/8"`
   * (`infrastructure/helm/backend/values-production.yaml`), so only the cluster and the VPC can scrape
   * it. The endpoint is public in the sense that a scrape carries no bearer token, and reachable only
   * from inside.
   *
   * WHY `@Header` AND NOT `@Res()`. Nest's `@Header` decorator sets the header on the response and
   * leaves the return value to be written as the body, so this handler stays a plain function whose
   * return type is `string` — no coupling to express, and nothing to break if the adapter changes.
   *
   * WHY `charset` IS NOT SPELLED OUT. Express's `res.send` runs `setCharset` over any `text/*` body,
   * which moves `charset` to the front of the parameter list. Both parameter orders parse — Prometheus
   * reads media type parameters in any order — so the version parameter is the one worth writing and
   * the charset is left to the framework that is going to set it anyway.
   */
  @Public()
  @Get()
  @Header('Content-Type', 'text/plain; version=0.0.4')
  render(): string {
    return this.registry.render();
  }
}
