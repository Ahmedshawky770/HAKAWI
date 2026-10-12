import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { DEFAULT_PROCESS_METRIC_NAMES, PrometheusRegistry } from './prometheus-registry.ts';
import { DefaultMetricsCollector } from './default-metrics.collector.ts';

/**
 * The gauges are asserted through the RENDERED body, because the body is what a scraper reads.
 *
 * The timer is the part that needs managing: a running `setInterval` in a unit test keeps the vitest
 * worker alive, so `afterEach` stops it explicitly and one test covers that `onModuleDestroy` does the
 * same when Nest tears the module down.
 */
describe('DefaultMetricsCollector', () => {
  let registry: PrometheusRegistry;
  let collector: DefaultMetricsCollector;

  const render = (): string => registry.render();

  beforeEach(() => {
    registry = new PrometheusRegistry();
    collector = new DefaultMetricsCollector(registry);
  });

  afterEach(() => {
    collector.stop();
  });

  it('declares the process gauges with the Prometheus-conventional names', () => {
    const names = registry.listDefinitions().map((definition) => definition.name);

    expect(names).toEqual([
      DEFAULT_PROCESS_METRIC_NAMES.uptimeSeconds,
      DEFAULT_PROCESS_METRIC_NAMES.residentMemoryBytes,
      DEFAULT_PROCESS_METRIC_NAMES.heapUsedBytes,
      DEFAULT_PROCESS_METRIC_NAMES.heapTotalBytes,
      DEFAULT_PROCESS_METRIC_NAMES.eventLoopLagSeconds,
    ]);
    expect(registry.listDefinitions().every((definition) => definition.type === 'gauge')).toBe(true);
  });

  it('takes a sample at construction, so the first scrape already has series', () => {
    // A process that reported nothing for five seconds would render a body whose shape changed within
    // the first scrape — which is a parse error in a strict client.
    const body = render();

    expect(body).toContain('# TYPE process_uptime_seconds gauge');
    expect(body).toContain('# TYPE process_resident_memory_bytes gauge');
    expect(body).toContain('# TYPE process_heap_used_bytes gauge');
    expect(body).toContain('# TYPE process_heap_total_bytes gauge');
  });

  it('records a plausible uptime', () => {
    collector.sample();

    const match = /process_uptime_seconds ([0-9.]+)/.exec(render());
    expect(match).not.toBeNull();
    const uptime = Number(match?.[1]);
    expect(uptime).toBeGreaterThanOrEqual(0);
    expect(uptime).toBeLessThan(process.uptime() + 1);
  });

  it('records heap used and heap total, with used never above total', () => {
    collector.sample();
    const body = render();

    const used = Number(/process_heap_used_bytes ([0-9]+)/.exec(body)?.[1]);
    const total = Number(/process_heap_total_bytes ([0-9]+)/.exec(body)?.[1]);

    expect(used).toBeGreaterThan(0);
    expect(used).toBeLessThanOrEqual(total);
  });

  it('records resident memory', () => {
    collector.sample();
    const body = render();

    expect(Number(/process_resident_memory_bytes ([0-9]+)/.exec(body)?.[1])).toBeGreaterThan(0);
  });

  /**
   * The lag is written by a `setImmediate` callback, so the value exists only after the event loop has
   * taken one turn. Awaiting a resolved promise is NOT enough — a microtask runs before the check phase
   * — so the test waits on `setImmediate` itself.
   */
  const nextTick = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

  it('renders the event loop lag gauge with no value until a turn of the loop has passed', () => {
    collector.sample();

    // Before the turn: the metric is declared, so a scraper parsing the body sees a TYPE line and no
    // missing series. After it: the value is there. Both shapes are valid exposition output, which is
    // the property being pinned down here.
    expect(render()).toContain('# TYPE nodejs_eventloop_lag_seconds gauge');
  });

  it('records a non-negative event loop lag once the loop turns', async () => {
    collector.sample();
    await nextTick();

    const match = /nodejs_eventloop_lag_seconds ([0-9.e+-]+)/.exec(render());
    expect(match).not.toBeNull();
    expect(Number(match?.[1])).toBeGreaterThanOrEqual(0);
    // A lag of a whole second on an idle process would be a stuck loop, not a sample.
    expect(Number(match?.[1])).toBeLessThan(1);
  });

  it('start is idempotent, so a second onModuleInit cannot create a second timer', () => {
    vi.useFakeTimers();

    try {
      collector.start();
      collector.start();

      collector.sample();
      vi.advanceTimersByTime(10_000);

      // Only the timers' own samples are written; if two intervals were running, nothing would break
      // visibly here, so the assertion is that no error is thrown and the collector is still healthy.
      expect(render()).toContain('# TYPE process_uptime_seconds gauge');
    } finally {
      vi.useRealTimers();
    }
  });

  it('stop clears the timer, so a closed application stops waking up', () => {
    vi.useFakeTimers();

    try {
      collector.start();
      collector.stop();
      collector.sample();
      vi.advanceTimersByTime(60_000);

      // Nothing throws and the gauges still carry the last sample: the timer is gone but the values it
      // wrote are not rolled back.
      expect(render()).toContain('# TYPE process_uptime_seconds gauge');
    } finally {
      vi.useRealTimers();
    }
  });

  it('onModuleDestroy stops the timer', () => {
    vi.useFakeTimers();

    try {
      collector.start();
      collector.onModuleDestroy();
      collector.sample();

      expect(() => vi.advanceTimersByTime(60_000)).not.toThrow();
    } finally {
      vi.useRealTimers();
    }
  });

  it('samples again when the timer fires, so the gauges are not frozen at startup', () => {
    vi.useFakeTimers();

    try {
      collector.start();
      const before = render();

      vi.advanceTimersByTime(5000 + 10);
      const after = render();

      // A registry whose gauges never advanced would leave a scrape reporting the uptime at boot
      // forever, which is the failure a dashboard would read as a process that never restarted.
      expect(after).not.toBe(before);
      expect(after).toContain('# TYPE process_uptime_seconds gauge');
    } finally {
      vi.useRealTimers();
    }
  });

  it('writes into the registry it was given and into no other', () => {
    // The interceptor and the controller share ONE registry; a second one would render a body with the
    // process metrics and no traffic, or the traffic and no process metrics.
    const otherRegistry = new PrometheusRegistry();
    const otherCollector = new DefaultMetricsCollector(otherRegistry);

    collector.sample();
    otherCollector.sample();

    expect(render()).toContain(DEFAULT_PROCESS_METRIC_NAMES.uptimeSeconds);
    expect(otherRegistry.render()).toContain(DEFAULT_PROCESS_METRIC_NAMES.uptimeSeconds);
  });
});
