import type { Server } from 'node:http';

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { DEFAULT_PROCESS_METRIC_NAMES, HTTP_REQUESTS_TOTAL_NAME, PrometheusRegistry } from './prometheus-registry.ts';
import { PrometheusController } from './prometheus.controller.ts';

/**
 * The route is asserted over real HTTP rather than by calling the controller method, because the thing
 * under test is the response — its CONTENT TYPE is half of the contract. A scraper that receives
 * `application/json` on a path it scrapes as text discards the body, and the endpoint would then look
 * healthy while reporting nothing.
 */
describe('PrometheusController', () => {
  let app: INestApplication<Server>;
  let registry: PrometheusRegistry;

  const httpServer = (): Server => app.getHttpServer() as Server;

  beforeEach(async () => {
    registry = new PrometheusRegistry();
    registry
      .createCounter('http_requests_total', 'Total HTTP requests processed', ['method', 'route', 'status'])
      .inc({ method: 'GET', route: '/stories', status: '200' });

    const moduleRef = await Test.createTestingModule({
      controllers: [PrometheusController],
      providers: [{ provide: PrometheusRegistry, useValue: registry }],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  it('answers the exposition format with its exact content type', async () => {
    const res = await request(httpServer()).get('/metrics').expect(200);

    // `text/plain; version=0.0.4` is the Prometheus text exposition format's identifier, and
    // `monitoring/prometheus.yml` scrapes this path expecting it. Express's `res.send` prepends
    // `charset=utf-8` to any `text/*` body, so the served header carries both — and the `version`
    // parameter is what makes it the exposition format rather than plain text.
    expect(res.headers['content-type']).toBe('text/plain; charset=utf-8; version=0.0.4');
  });

  it('returns the registry body verbatim', async () => {
    const res = await request(httpServer()).get('/metrics').expect(200);

    expect(res.text).toBe(
      '# HELP http_requests_total Total HTTP requests processed\n' +
        '# TYPE http_requests_total counter\n' +
        'http_requests_total{method="GET",route="/stories",status="200"} 1\n',
    );
  });

  it('needs no authentication, because a scrape carries no token', async () => {
    await request(httpServer()).get('/metrics').expect(200);
  });

  it('writes the body as text and not as an escaped JSON string', async () => {
    const res = await request(httpServer()).get('/metrics').expect(200);

    expect(res.text.startsWith('#')).toBe(true);
    // A JSON body would wrap the whole response in quotes and escape every newline.
    expect(res.text).not.toContain('\\n');
  });

  it('renders whatever the registry holds, including the process gauges', async () => {
    // The default metrics are registered in the running application by `DefaultMetricsCollector`,
    // which owns the registry and its sampling timer. Here the registry is built by hand so the route
    // can be tested without the timer; the assertion is that the controller renders every metric the
    // registry holds, whether a timer or a test put it there.
    registry.createGauge(DEFAULT_PROCESS_METRIC_NAMES.uptimeSeconds, 'Process uptime in seconds').set(undefined, 12);

    const res = await request(httpServer()).get('/metrics').expect(200);

    expect(res.text).toContain('process_uptime_seconds 12');
    // The counter the beforeEach registered is the one the interceptor writes into in production.
    expect(res.text).toContain(`# TYPE ${HTTP_REQUESTS_TOTAL_NAME} counter`);
  });

  it('renders an empty body for an empty registry rather than a placeholder', async () => {
    const emptyRegistry = new PrometheusRegistry();

    const moduleRef = await Test.createTestingModule({
      controllers: [PrometheusController],
      providers: [{ provide: PrometheusRegistry, useValue: emptyRegistry }],
    }).compile();
    const emptyApp = moduleRef.createNestApplication();
    await emptyApp.init();

    const res = await request(emptyApp.getHttpServer() as Server).get('/metrics').expect(200);

    // A placeholder would be read by a scraper as a series that exists and is empty, which is a
    // different statement from "this process has recorded nothing yet".
    expect(res.text).toBe('');
    await emptyApp.close();
  });

  it('declares the metrics path and nothing more, so the global prefix is what makes it api/v1', () => {
    // `main.ts` calls `app.setGlobalPrefix('api/v1')`, which applies the prefix to every registered
    // route. This controller declares no prefix of its own: if it did, the production path would be
    // `/api/v1/metrics/metrics` and `monitoring/prometheus.yml` would scrape a 404.
    const declaredPath = Reflect.getMetadata('path', PrometheusController) as string | undefined;
    expect(declaredPath).toBe('metrics');
  });

  /**
   * The production path, end to end.
   *
   * `monitoring/prometheus.yml` is already configured to scrape `/api/v1/metrics`, so this is the
   * assertion that the code and an existing external configuration still agree. The prefix comes from
   * `main.ts`'s `setGlobalPrefix`, not from anything this controller declares — which is why the test
   * sets the prefix the same way `main.ts` does.
   */
  it('serves GET /api/v1/metrics under the global prefix, which is what Prometheus scrapes', async () => {
    const prefixed = await Test.createTestingModule({
      controllers: [PrometheusController],
      providers: [{ provide: PrometheusRegistry, useValue: registry }],
    }).compile();

    const prefixedApp = prefixed.createNestApplication();
    prefixedApp.setGlobalPrefix('api/v1');
    await prefixedApp.init();

    try {
      const res = await request(prefixedApp.getHttpServer() as Server).get('/api/v1/metrics').expect(200);

      expect(res.headers['content-type']).toBe('text/plain; charset=utf-8; version=0.0.4');
      expect(res.text).toContain('# TYPE http_requests_total counter');
      // The unprefixed path is NOT also served: a scraper pointed at `/metrics` must get a 404 rather
      // than a body it would happily parse, so a misconfigured scrape target is visible.
      await request(prefixedApp.getHttpServer() as Server).get('/metrics').expect(404);
    } finally {
      await prefixedApp.close();
    }
  });
});
