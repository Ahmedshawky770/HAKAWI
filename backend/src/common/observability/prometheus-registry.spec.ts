import { describe, it, expect } from 'vitest';

import {
  DEFAULT_PROCESS_METRIC_NAMES,
  HTTP_REQUESTS_TOTAL_LABELS,
  HTTP_REQUESTS_TOTAL_NAME,
  METRIC_NAME_PATTERN,
  MetricLabelError,
  MetricNameError,
  PrometheusRegistry,
} from './prometheus-registry.ts';

/**
 * The assertions here are on the exposition BODY, not on the in-memory counters.
 *
 * Why: a registry that counted correctly and rendered wrongly is a registry that produces a scrape
 * error in Prometheus and a target that shows as down, which is the failure mode the endpoint exists
 * to avoid. The two are checked together on purpose — the counter is internal, the body is the
 * contract, and it is the body that `monitoring/prometheus.yml` reads.
 */
describe('PrometheusRegistry', () => {
  describe('metric name validation', () => {
    it('accepts the names the exposition format allows', () => {
      for (const name of ['http_requests_total', 'http:requests_total', '_private', 'a', 'nodejs_x1']) {
        expect(METRIC_NAME_PATTERN.test(name)).toBe(true);
      }
    });

    it('rejects a name a scraper cannot parse', () => {
      for (const name of ['', '1metric', 'my-metric', 'my metric', 'metric!', 'my.metric', 'hé']) {
        expect(() => new PrometheusRegistry().createCounter(name, 'help')).toThrow(MetricNameError);
      }
    });

    it('rejects the reserved __ prefix, which Prometheus overwrites', () => {
      expect(() => new PrometheusRegistry().createCounter('__name', 'help')).toThrow(MetricNameError);
    });

    it('refuses to register the same name twice', () => {
      const registry = new PrometheusRegistry();
      registry.createCounter('http_requests_total', 'help');

      expect(() => registry.createGauge('http_requests_total', 'other help')).toThrow(MetricNameError);
    });

    it('rejects a label name a scraper cannot parse', () => {
      expect(() => new PrometheusRegistry().createCounter('m', 'help', ['my-label'])).toThrow(MetricLabelError);
    });

    it('rejects the reserved le label, which the histogram renders itself', () => {
      expect(() => new PrometheusRegistry().createCounter('m', 'help', ['le'])).toThrow(MetricLabelError);
    });
  });

  describe('counter', () => {
    it('renders HELP, TYPE and the sample line', () => {
      const registry = new PrometheusRegistry();
      registry.createCounter('http_requests_total', 'Total HTTP requests processed').inc(undefined, 3);

      expect(registry.render()).toBe(
        '# HELP http_requests_total Total HTTP requests processed\n' +
          '# TYPE http_requests_total counter\n' +
          'http_requests_total 3\n',
      );
    });

    it('defaults an increment to one', () => {
      const registry = new PrometheusRegistry();
      const counter = registry.createCounter('m', 'help');
      counter.inc();
      counter.inc();

      expect(counter.value()).toBe(2);
    });

    it('renders labels in declaration order, not in caller order', () => {
      const registry = new PrometheusRegistry();
      registry
        .createCounter('http_requests_total', 'help', ['method', 'route', 'status'])
        .inc({ status: '200', route: '/stories', method: 'GET' });

      expect(registry.render()).toContain('http_requests_total{method="GET",route="/stories",status="200"} 1');
    });

    it('keeps each label set as its own series', () => {
      const registry = new PrometheusRegistry();
      const counter = registry.createCounter('http_requests_total', 'help', ['method']);
      counter.inc({ method: 'GET' });
      counter.inc({ method: 'GET' });
      counter.inc({ method: 'POST' });

      const body = registry.render();
      expect(body).toContain('http_requests_total{method="GET"} 2');
      expect(body).toContain('http_requests_total{method="POST"} 1');
    });

    it('refuses a decrement, because a rate() over a counter that went down is a wrap-around spike', () => {
      const counter = new PrometheusRegistry().createCounter('m', 'help');

      expect(() => counter.inc(undefined, -1)).toThrow(MetricLabelError);
    });

    it('reports zero for a series that was never recorded', () => {
      const counter = new PrometheusRegistry().createCounter('m', 'help', ['method']);

      expect(counter.value({ method: 'GET' })).toBe(0);
    });

    it('rejects a label the metric never declared', () => {
      const counter = new PrometheusRegistry().createCounter('m', 'help', ['method']);

      expect(() => counter.inc({ method: 'GET', route: '/stories' })).toThrow(MetricLabelError);
    });

    it('rejects a missing required label', () => {
      const counter = new PrometheusRegistry().createCounter('m', 'help', ['method', 'status']);

      expect(() => counter.inc({ method: 'GET' })).toThrow(MetricLabelError);
    });
  });

  describe('gauge', () => {
    it('renders an absolute value that may go down', () => {
      const registry = new PrometheusRegistry();
      const gauge = registry.createGauge(DEFAULT_PROCESS_METRIC_NAMES.residentMemoryBytes, 'Resident memory');
      gauge.set(undefined, 1000);
      gauge.set(undefined, 500);

      expect(registry.render()).toContain('process_resident_memory_bytes 500');
    });

    it('supports inc and dec', () => {
      const gauge = new PrometheusRegistry().createGauge('m', 'help');
      gauge.inc(undefined, 5);
      gauge.dec(undefined, 2);

      expect(gauge.value()).toBe(3);
    });
  });

  describe('histogram', () => {
    it('renders cumulative buckets plus count and sum', () => {
      const registry = new PrometheusRegistry();
      const histogram = registry.createHistogram('m', 'help', [], [0.1, 0.5, 1]);
      histogram.observe(undefined, 0.05);
      histogram.observe(undefined, 0.3);
      histogram.observe(undefined, 2);

      const body = registry.render();
      expect(body).toContain('# TYPE m histogram');
      expect(body).toContain('m_bucket{le="0.1"} 1');
      expect(body).toContain('m_bucket{le="0.5"} 2');
      expect(body).toContain('m_bucket{le="1"} 2');
      expect(body).toContain('m_bucket{le="+Inf"} 3');
      expect(body).toContain('m_count 3');
      expect(body).toContain('m_sum 2.35');
    });

    it('renders the le bucket alongside the declared labels', () => {
      const registry = new PrometheusRegistry();
      registry.createHistogram('m', 'help', ['route'], [0.5]).observe({ route: '/stories' }, 0.1);

      expect(registry.render()).toContain('m_bucket{route="/stories",le="0.5"} 1');
    });

    it('sorts the buckets rather than trusting the caller', () => {
      const registry = new PrometheusRegistry();
      registry.createHistogram('m', 'help', [], [1, 0.5]).observe(undefined, 0.7);

      const body = registry.render();
      expect(body.indexOf('le="0.5"')).toBeLessThan(body.indexOf('le="1"'));
    });

    it('refuses a negative observation, which would leave count and buckets disagreeing', () => {
      const histogram = new PrometheusRegistry().createHistogram('m', 'help');

      expect(() => histogram.observe(undefined, -1)).toThrow(MetricLabelError);
    });

    it('defaults to Prometheus\'s own buckets', () => {
      const registry = new PrometheusRegistry();
      registry.createHistogram('m', 'help').observe(undefined, 0.2);

      // 0.2 is over the first five boundaries (…, 0.075, 0.1) and under 0.25, so the cumulative count
      // becomes 1 exactly at 0.25 and stays 1 from there to +Inf.
      const body = registry.render();
      expect(body).toContain('m_bucket{le="0.1"} 0');
      expect(body).toContain('m_bucket{le="0.25"} 1');
      expect(body).toContain('m_bucket{le="+Inf"} 1');
    });

    it('refuses a negative bucket boundary', () => {
      expect(() => new PrometheusRegistry().createHistogram('m', 'help', [], [-1])).toThrow(MetricNameError);
    });
  });

  describe('rendering', () => {
    it('escapes a backslash, a double quote and a newline in a label value', () => {
      const registry = new PrometheusRegistry();
      registry.createCounter('m', 'help', ['route']).inc({ route: 'a\\b"c\nd' });

      expect(registry.render()).toContain('m{route="a\\\\b\\"c\\nd"} 1');
    });

    it('escapes a HELP string so it cannot end the comment line', () => {
      const registry = new PrometheusRegistry();
      registry.createCounter('m', 'help\nwith a second line').inc(undefined, 1);

      expect(registry.render()).toContain('# HELP m help\\nwith a second line');
    });

    it('renders one block per metric, in registration order', () => {
      const registry = new PrometheusRegistry();
      registry.createCounter('first_total', 'help');
      registry.createGauge('second_bytes', 'help');

      expect(registry.render()).toBe(
        '# HELP first_total help\n# TYPE first_total counter\n' +
          '# HELP second_bytes help\n# TYPE second_bytes gauge\n',
      );
    });

    it('renders an empty body for an empty registry', () => {
      expect(new PrometheusRegistry().render()).toBe('');
    });

    it('formats the special values the exposition format spells out', () => {
      const registry = new PrometheusRegistry();
      registry.createGauge('finite', 'help').set(undefined, 0.005);
      registry.createGauge('infinite', 'help').set(undefined, Number.POSITIVE_INFINITY);
      registry.createGauge('undefined', 'help').set(undefined, Number.NaN);

      const body = registry.render();
      expect(body).toContain('finite 0.005');
      expect(body).toContain('infinite +Inf');
      expect(body).toContain('undefined NaN');
    });

    it('lists its definitions for a test that needs to assert what is registered', () => {
      const registry = new PrometheusRegistry();
      registry.createCounter('m', 'help', ['method']);

      expect(registry.listDefinitions()).toEqual([{ name: 'm', help: 'help', type: 'counter', labelNames: ['method'] }]);
    });

    it('reset drops the samples and keeps the declarations', () => {
      const registry = new PrometheusRegistry();
      registry.createCounter('m', 'help', ['method']).inc({ method: 'GET' });

      registry.reset();

      expect(registry.listDefinitions()).toHaveLength(1);
      expect(registry.render()).not.toContain('method="GET"');
    });

    it('never collides two series whose label values contain the separator', () => {
      const registry = new PrometheusRegistry();
      const counter = registry.createCounter('m', 'help', ['a', 'b']);
      counter.inc({ a: 'x|y', b: 'z' });
      counter.inc({ a: 'x', b: 'y|z' });

      expect(counter.value({ a: 'x|y', b: 'z' })).toBe(1);
      expect(counter.value({ a: 'x', b: 'y|z' })).toBe(1);
    });
  });

  describe('the process and HTTP metrics this process declares', () => {
    it('uses the Prometheus-conventional process metric names', () => {
      expect(DEFAULT_PROCESS_METRIC_NAMES.uptimeSeconds).toBe('process_uptime_seconds');
      expect(DEFAULT_PROCESS_METRIC_NAMES.residentMemoryBytes).toBe('process_resident_memory_bytes');
      expect(DEFAULT_PROCESS_METRIC_NAMES.heapUsedBytes).toBe('process_heap_used_bytes');
      expect(DEFAULT_PROCESS_METRIC_NAMES.heapTotalBytes).toBe('process_heap_total_bytes');
      expect(DEFAULT_PROCESS_METRIC_NAMES.eventLoopLagSeconds).toBe('nodejs_eventloop_lag_seconds');
    });

    it('declares the HTTP counter with a bounded label set', () => {
      expect(HTTP_REQUESTS_TOTAL_NAME).toBe('http_requests_total');
      expect(HTTP_REQUESTS_TOTAL_LABELS).toEqual(['method', 'route', 'status']);
      // The route label carries a TEMPLATE, not a URL. If this list ever grows to include an id, the
      // cardinality of the counter grows with the number of requests.
      expect(HTTP_REQUESTS_TOTAL_LABELS).not.toContain('url');
      expect(HTTP_REQUESTS_TOTAL_LABELS).not.toContain('path');
    });

    it('accepts a status recorded as a string label', () => {
      const registry = new PrometheusRegistry();
      registry.createCounter(HTTP_REQUESTS_TOTAL_NAME, 'help', [...HTTP_REQUESTS_TOTAL_LABELS]).inc({
        method: 'GET',
        route: '/stories',
        status: '200',
      });

      expect(registry.render()).toContain('http_requests_total{method="GET",route="/stories",status="200"} 1');
    });
  });
});
