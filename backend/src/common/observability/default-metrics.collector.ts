import { Injectable } from '@nestjs/common';
import type { OnModuleDestroy } from '@nestjs/common';

import type { Gauge } from './prometheus-registry.ts';
import { DEFAULT_PROCESS_METRIC_NAMES, PrometheusRegistry } from './prometheus-registry.ts';

/**
 * The default (process) metrics, and the timer that samples them.
 *
 * WHY THIS IS A CLASS AND NOT A MODULE-LEVEL `setInterval`. The process gauges are samples of state that
 * changes over time, so SOMETHING has to own a timer, and that something has to be able to stop it: a
 * bare `setInterval` at module scope stays alive until the process exits, which in the unit suite means
 * a vitest worker that does not exit and a test run that hangs. Holding it on a provider with
 * `onModuleDestroy` means the same timer is cleared when the application closes (Principle #8 — one
 * owner, and an owner that can be shut down).
 *
 * WHY THE SAMPLE INTERVAL IS 5 SECONDS AND NOT 1. The gauges are read by a scraper every 15–60s. A
 * 1s interval would spend most of its life overwriting a value nobody has read, for no extra
 * resolution, and each sample is a `process.memoryUsage()` call and a `setImmediate` — cheap
 * individually, and not free when multiplied across replicas. 5s is short enough that a restart or a
 * memory curve is visible, and long enough that the cost is a rounding error.
 */
const SAMPLE_INTERVAL_MS = 5000;

/**
 * The registry this collector writes into.
 *
 * WHY IT IS PASSED THE REGISTRY RATHER THAN CREATING ONE. The metrics have to be visible on the SAME
 * registry the `PrometheusController` renders and the `MetricsInterceptor` increments — a second
 * registry would render an empty body, and the failure would be a scraping endpoint that returns only
 * the process metrics and no traffic at all.
 */
@Injectable()
export class DefaultMetricsCollector implements OnModuleDestroy {
  private readonly gauges: {
    uptimeSeconds: Gauge;
    residentMemoryBytes: Gauge;
    heapUsedBytes: Gauge;
    heapTotalBytes: Gauge;
    eventLoopLagSeconds: Gauge;
  };

  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(registry: PrometheusRegistry) {
    this.gauges = {
      uptimeSeconds: registry.createGauge(DEFAULT_PROCESS_METRIC_NAMES.uptimeSeconds, 'Process uptime in seconds'),
      residentMemoryBytes: registry.createGauge(
        DEFAULT_PROCESS_METRIC_NAMES.residentMemoryBytes,
        'Resident memory size in bytes',
      ),
      heapUsedBytes: registry.createGauge(DEFAULT_PROCESS_METRIC_NAMES.heapUsedBytes, 'Heap memory used in bytes'),
      heapTotalBytes: registry.createGauge(DEFAULT_PROCESS_METRIC_NAMES.heapTotalBytes, 'Heap memory allocated in bytes'),
      eventLoopLagSeconds: registry.createGauge(
        DEFAULT_PROCESS_METRIC_NAMES.eventLoopLagSeconds,
        'Event loop lag in seconds',
      ),
    };
  }

  /** Starts sampling. Idempotent, so a double `onModuleInit` cannot produce two timers. */
  start(): void {
    if (this.timer !== null) {
      return;
    }

    this.sample();

    this.timer = setInterval(() => this.sample(), SAMPLE_INTERVAL_MS);
    // The timer must not be the reason the process stays alive. In the unit suite the application is
    // created and torn down inside the process, and a referenced interval would keep vitest's worker
    // from exiting.
    this.timer.unref();
  }

  /**
   * Stops sampling. Called by Nest when the module is destroyed.
   *
   * WHY THIS IS NOT OPTIONAL. A stopped application that keeps a 5s timer is a stopped application
   * that still wakes up, still calls `process.memoryUsage()`, and still writes to a registry nothing
   * renders — and in a test suite that is the difference between a clean exit and a hang.
   */
  stop(): void {
    if (this.timer === null) {
      return;
    }
    clearInterval(this.timer);
    this.timer = null;
  }

  onModuleDestroy(): void {
    this.stop();
  }

  /**
   * Records every gauge once, right now.
   *
   * WHY IT IS PUBLIC AND NOT ONLY CALLED ON THE TIMER. A process that has just started has no samples
   * until the first tick, so `GET /api/v1/metrics` on a fresh replica would render the process gauges
   * with no series at all — and a scrape response that changes shape within the first seconds of life
   * is the kind a scraper logs a parse error for. Taking one sample at startup makes the body stable
   * from the first scrape.
   */
  sample(): void {
    const memory = process.memoryUsage();

    this.gauges.uptimeSeconds.set(undefined, process.uptime());
    this.gauges.residentMemoryBytes.set(undefined, memory.rss);
    this.gauges.heapUsedBytes.set(undefined, memory.heapUsed);
    this.gauges.heapTotalBytes.set(undefined, memory.heapTotal);
    this.sampleEventLoopLag();
  }

  /**
   * Measures how long the event loop took to come back to this process.
   *
   * WHY `setImmediate` AND NOT `perf_hooks`' `monitorEventLoopDelay`. The `perf_hooks` histogram needs
   * an `init` call per process, a `enable()`, its own buckets and a `disable()` on shutdown, and it
   * measures a different quantity than what a dashboard needs — it is a histogram, where this is a
   * "is the loop currently stuck" gauge. Scheduling one immediate callback per sample and timing the
   * hand-off answers that question for the cost of a single callback.
   *
   * WHY THE LAG IS CLAMPED AT ZERO. `performance.now()` is monotonic within a context but the delta is
   * taken across an asynchronous boundary, so a clock adjustment or a context switch can make it
   * marginally negative. A negative duration is meaningless as a duration and renders as one.
   *
   * WHY THE SAMPLE IS TAKEN INSIDE THE CALLBACK AND NOT SCHEDULED FROM IT. The lag of THIS iteration is
   * measured by the callback the previous iteration scheduled; writing the gauge inside the callback
   * means the value a scraper reads is the most recent measurement, not the one before it.
   */
  private sampleEventLoopLag(): void {
    const startedAt = performance.now();
    setImmediate(() => {
      const lagMs = performance.now() - startedAt;
      this.gauges.eventLoopLagSeconds.set(undefined, Math.max(0, lagMs / 1000));
    });
  }
}
