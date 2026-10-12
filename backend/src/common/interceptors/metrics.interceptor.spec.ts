import type { Server } from 'node:http';

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  Controller,
  Get,
  HttpException,
  HttpStatus,
  NotFoundException,
  type CallHandler,
  type ExecutionContext,
  type INestApplication,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { of, throwError } from 'rxjs';

import { HTTP_REQUESTS_TOTAL_NAME, PrometheusRegistry } from '../observability/prometheus-registry.ts';

import { MetricsInterceptor, UNRESOLVED_ROUTE_LABEL } from './metrics.interceptor.ts';

@Controller('stories')
class MetricsFixtureController {
  @Get(':id')
  findOne(): { id: string } {
    return { id: 'story-1' };
  }

  @Get('missing/:id')
  findMissing(): never {
    throw new NotFoundException('Story not found');
  }
}

/**
 * The shape of the request this interceptor reads, mirrored locally rather than imported: the
 * interceptor's own type is a private implementation detail, and a test that imported it would fail on
 * any refactor that renamed it — a rename that cannot change the behaviour asserted here.
 */
type AnnotatedRequest = {
  method: string;
  baseUrl?: string;
  route?: { path?: string };
};

/**
 * The route LABEL is the behaviour under test, and it can only be observed over real HTTP: Express
 * populates `request.route` while resolving the request, so a unit test that called `intercept()` with a
 * fabricated context would be asserting against a value the test itself had chosen.
 *
 * Every assertion below reads the RENDERED body rather than an internal counter. That is deliberate: the
 * body is what a scraper parses, and a counter that counted correctly while rendering a label no parser
 * accepts is the failure this interceptor has to avoid.
 */
describe('MetricsInterceptor', () => {
  let app: INestApplication<Server>;
  let registry: PrometheusRegistry;
  let interceptor: MetricsInterceptor;

  const body = (): string => registry.render();

/**
 * Drives the interceptor once with a fabricated request/response, the same
 * `as unknown as ExecutionContext` shape the neighbouring guard and cache specs use.
 *
 * WHY THIS EXISTS ALONGSIDE THE HTTP TESTS. Some branches are unreachable through the router — a
 * request with no `request.route` never reaches an interceptor — and the outcomes that depend on the
 * exception rather than on the response are otherwise only observable through a full app with the
 * exception filter registered.
 */
function drive(
  request: AnnotatedRequest,
  response: { statusCode: number },
  outcome: { ok: boolean; error?: unknown },
): void {
  const observed = interceptor.intercept(
    {
      getHandler: () => (): void => undefined,
      getClass: () => class {},
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => response,
      }),
    } as unknown as ExecutionContext,
    {
      handle: () => (outcome.ok ? of({ ok: true }) : throwError(() => outcome.error)),
    } as CallHandler,
  );

  // `tap` fires on subscription, and nothing subscribes until the application does. A driver that
  // stopped at `intercept` would assert against a counter that had never been incremented.
  observed.subscribe({
    next: () => undefined,
    error: () => undefined,
  });
}


  beforeEach(async () => {
    registry = new PrometheusRegistry();
    // ONE interceptor for the whole suite. A second instance on the same registry would throw on the
    // duplicate counter, which is the failure this registry's uniqueness rule exists to catch.
    interceptor = new MetricsInterceptor(registry);

    const moduleRef = await Test.createTestingModule({
      controllers: [MetricsFixtureController],
      providers: [{ provide: PrometheusRegistry, useValue: registry }],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalInterceptors(interceptor);
    await app.init();
  });

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  it('registers one counter with the bounded label set', () => {
    const definitions = registry.listDefinitions().filter((definition) => definition.name === HTTP_REQUESTS_TOTAL_NAME);

    expect(definitions).toHaveLength(1);
    expect(definitions[0]?.labelNames).toEqual(['method', 'route', 'status']);
    // No `url` and no `path`: those label values are caller-controlled, and one series per request is
    // the cardinality failure this interceptor exists to avoid.
    expect(definitions[0]?.type).toBe('counter');
  });

  it('counts a request under the ROUTE TEMPLATE and not the URL', async () => {
    await request(app.getHttpServer()).get('/stories/story-1').expect(200);
    await request(app.getHttpServer()).get('/stories/story-2').expect(200);

    // Both requests land on one series, because `/stories/:id` is the route and the id is not a
    // dimension.
    expect(body()).toContain('http_requests_total{method="GET",route="/stories/:id",status="200"} 2');
    expect(body()).not.toContain('story-1');
    expect(body()).not.toContain('story-2');
  });

  it('separates series by method and by status', async () => {
    await request(app.getHttpServer()).get('/stories/story-1').expect(200);
    await request(app.getHttpServer()).get('/stories/missing/story-1').expect(404);

    expect(body()).toContain('http_requests_total{method="GET",route="/stories/:id",status="200"} 1');
    expect(body()).toContain('http_requests_total{method="GET",route="/stories/missing/:id",status="404"} 1');
  });

  it('counts an error response too, so the denominator is complete', async () => {
    await request(app.getHttpServer()).get('/stories/missing/story-1').expect(404);

    // An error-rate alert is 5xx over the total; if a 404 were not counted the rate would be computed
    // against a number that is missing the failures.
    expect(body()).toContain('status="404"');
  });

  it('uses a constant label when no route matched, and never the raw URL', async () => {
    // A path no route matches: Nest's router finds nothing, so `intercept` is never entered and no
    // sample is written at all. That is the property that matters — the counter is bounded by the
    // number of ROUTES, not by the number of requests, because a request that names an object nobody
    // has cannot create a series.
    await request(app.getHttpServer()).get('/does-not-exist-abc').expect(404);

    expect(body()).not.toContain('does-not-exist-abc');
    expect(body()).not.toContain('route=');
  });

  /**
   * The fallback is unreachable through the router (a request with no `request.route` never reaches an
   * interceptor), so it is exercised directly with a fabricated context — the same
   * `as unknown as ExecutionContext` shape the neighbouring guard and cache specs use for the same
   * reason. WHAT IT PROTECTS AGAINST: an express-level handler, a future route mounted outside Nest's
   * router, or a `request.route` that resolves to an empty string. Any of those must produce one
   * series named `unresolved`, never a series named after the caller's path.
   */
  it('falls back to a constant label when the request carries no route template', () => {
    drive({ method: 'GET', baseUrl: '/api/v1' }, { statusCode: 200 }, { ok: true });

    expect(body()).toContain(`route="${UNRESOLVED_ROUTE_LABEL}"`);
    expect(body()).not.toContain('/api/v1/');
  });

  it('prefixes the route template with baseUrl, so the label matches the URL an operator sees', () => {
    drive(
      { method: 'GET', baseUrl: '/api/v1', route: { path: '/stories/:id' } },
      { statusCode: 200 },
      { ok: true },
    );

    expect(body()).toContain('route="/api/v1/stories/:id"');
  });

  it('records the exception\'s own status, because the filter writes it after this interceptor runs', () => {
    drive(
      { method: 'GET', baseUrl: '', route: { path: '/stories/:id' } },
      // Express initialises the status to 200; this is what a 404 handler that throws looks like at
      // the moment `intercept` records it.
      { statusCode: 200 },
      { ok: false, error: new NotFoundException('Story not found') },
    );

    // Counting the 200 the response still carries would swallow every 404 into the denominator of an
    // error-rate alert.
    expect(body()).toContain('status="404"');
  });

  it('records a 500 for an exception that is not an HttpException', () => {
    drive(
      { method: 'GET', baseUrl: '', route: { path: '/stories/:id' } },
      { statusCode: 200 },
      { ok: false, error: new Error('relation "stories" does not exist') },
    );

    expect(body()).toContain('status="500"');
  });

  it('records a status the handler set itself before throwing', () => {
    drive(
      { method: 'POST', baseUrl: '', route: { path: '/stories' } },
      { statusCode: 429 },
      { ok: false, error: new Error('too many requests') },
    );

    expect(body()).toContain('status="429"');
  });

  it('records the status an HttpException carries over the one the response happens to hold', () => {
    drive(
      { method: 'GET', baseUrl: '', route: { path: '/stories/:id' } },
      { statusCode: 200 },
      { ok: false, error: new HttpException('Service unavailable', HttpStatus.SERVICE_UNAVAILABLE) },
    );

    expect(body()).toContain('status="503"');
  });

  it('renders a body a scraper can parse end to end', async () => {
    await request(app.getHttpServer()).get('/stories/story-1').expect(200);

    expect(body()).toBe(
      `# HELP ${HTTP_REQUESTS_TOTAL_NAME} Total HTTP requests processed, by route template and status\n` +
        `# TYPE ${HTTP_REQUESTS_TOTAL_NAME} counter\n` +
        'http_requests_total{method="GET",route="/stories/:id",status="200"} 1\n',
    );
  });

  it('increments once per request and not once per registration', async () => {
    // A second interceptor on the same registry would double-count; a second registry would render
    // nothing here. Both are the failure this asserts against.
    await request(app.getHttpServer()).get('/stories/story-1').expect(200);

    expect(body()).toContain('status="200"} 1');
  });
});
