/**
 * A zero-dependency Prometheus metrics registry.
 *
 * WHY THIS IS HAND-WRITTEN. `prom-client` is the standard answer and it is NOT installed — the npm
 * registry is unreachable, so nothing can be added. The alternative to writing this is to not have
 * metrics, which is the state this file replaces: the app exposed no `Prometheus` endpoint at all
 * (`grep -r prom-client src` returns nothing), so `monitoring/` had nothing to scrape and every alert
 * that would have been written against `http_requests_total` had a blank behind it.
 *
 * WHY AN ALLOWLIST OF SHAPES RATHER THAN A THIN REGISTRY OF NUMBERS. The value this module adds is not
 * counting — it is the part that makes counting USEFUL to a scraper: a metric name Prometheus will
 * accept, a label set that is the same on every sample of the same metric, an exposition body that
 * escapes label values, and a TYPE line that matches what the value actually is. A registry that let a
 * caller emit `myMetric{service="a"}` and `myMetric{service="a",route="b"}` as two unrelated series
 * would produce a body Prometheus rejects outright, and the failure would surface as a scrape error in
 * the monitoring stack rather than as an error here.
 *
 * WHAT IS DELIBERATELY NOT HERE. No HTTP server of its own — the exposition body is rendered by
 * `PrometheusController` behind the same Nest routing tree as every other route (see the comment there).
 * No push gateway, no client-side aggregation, no default collectors beyond
 * `default-metrics.collector.ts`. A registry that counted everything would be a registry nobody could
 * reason about.
 */

/** A metric's kind, as reported on the `# TYPE` line. */
export type MetricType = 'counter' | 'gauge' | 'histogram';

/**
 * One sample's labels.
 *
 * `Readonly<Record<string, string>>` rather than a `Map`: label sets at call sites are written as
 * object literals (`{ method: 'GET', route: '/stories' }`), and forcing a `Map` there would buy nothing
 * but allocation. The VALUES are strings, per the Prometheus data model, and a caller who wants to
 * record a status code passes `String(res.statusCode)` — which is what
 * `common/interceptors/metrics.interceptor.ts` does.
 */
export type MetricLabels = Readonly<Record<string, string>>;

/** Everything the registry needs to know about a metric before it can render it. */
export interface MetricDefinition {
  readonly name: string;
  readonly help: string;
  readonly type: MetricType;
  /**
   * The labels this metric accepts, in the order they are rendered.
   *
   * Fixed at creation because a histogram whose label set grew per sample would produce series that
   * disagree about their own dimensions.
   */
  readonly labelNames: readonly string[];
}

/**
 * A Prometheus metric name: `[a-zA-Z_:][a-zA-Z0-9_:]*`.
 *
 * The pattern is the exposition format's own. A name outside it is not a preference violation — a
 * scraper that reads `# TYPE` for `my-metric` then meets `my_metric{...}` has no way to connect the
 * two, and the series is dropped with a parse error.
 */
export const METRIC_NAME_PATTERN = /^[a-zA-Z_:][a-zA-Z0-9_:]*$/;

/**
 * The default histogram buckets, and why they are Prometheus's own.
 *
 * `.005` to `10` seconds covers an HTTP request on a warm path, and the endpoints beyond that are
 * captured by the `+Inf` bucket and by `_sum`, so a request slower than 10s is still counted — it just
 * lands in the widest bucket rather than disappearing.
 */
export const DEFAULT_HISTOGRAM_BUCKETS: readonly number[] = [
  0.005, 0.01, 0.025, 0.05, 0.075, 0.1, 0.25, 0.5, 0.75, 1, 2.5, 5, 7.5, 10,
];

/**
 * The metrics this process exposes, written out so a scrape response is predictable.
 *
 * Also the reason `render()` can be trusted to be stable: these names are the public surface of this
 * file, and changing one is a breaking change for every dashboard and alert that reads it.
 */
export const DEFAULT_PROCESS_METRIC_NAMES = {
  uptimeSeconds: 'process_uptime_seconds',
  residentMemoryBytes: 'process_resident_memory_bytes',
  heapUsedBytes: 'process_heap_used_bytes',
  heapTotalBytes: 'process_heap_total_bytes',
  eventLoopLagSeconds: 'nodejs_eventloop_lag_seconds',
} as const;

/** The one counter recorded per HTTP request, and the label order it is rendered in. */
export const HTTP_REQUESTS_TOTAL_NAME = 'http_requests_total';
export const HTTP_REQUESTS_TOTAL_LABELS: readonly string[] = ['method', 'route', 'status'];

/**
 * A metric name that Prometheus will not accept, or a duplicate registration.
 *
 * THROWN RATHER THAN COERCED. Silently renaming `http-requests-total` to something acceptable would
 * move the failure to whoever reads the metric and finds an empty series; throwing it here makes it
 * fail at the one place that already knows what the name was supposed to be.
 */
export class MetricNameError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MetricNameError';
  }
}

/**
 * A label that this metric never declared.
 *
 * WHY THIS IS AN ERROR AND NOT A WARNING. A sample recorded under labels the metric does not declare
 * renders with a label nobody documented, and the series then answers a different question from the
 * one beside it — two answers to "how many requests", which is exactly the ambiguity this registry
 * exists to remove.
 */
export class MetricLabelError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MetricLabelError';
  }
}

/**
 * Escapes a label VALUE for the exposition format.
 *
 * Three characters per the spec — backslash, double quote, and newline — and nothing else. A value
 * containing a newline is a real case: a route template can carry whitespace, and an unescaped one
 * would end the line, truncating the sample and leaving the parser to read the rest as a new one.
 */
function escapeLabelValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
}

/** Escapes a HELP string, which is free text on a comment line. */
function escapeHelp(help: string): string {
  return help.replace(/\\/g, '\\\\').replace(/\n/g, '\\n');
}

/**
 * Renders a number the way the exposition format expects.
 *
 * `String()` is used for finite values because JavaScript's shortest-round-trip form is also valid
 * Prometheus syntax: `String(0.005)` is `"0.005"`, and an exponent form such as `"5e-7"` is accepted
 * by the parser too. The special cases are called out explicitly because `String()` would produce
 * `"Infinity"` and `"-Infinity"`, neither of which Prometheus reads.
 */
function formatValue(value: number): string {
  if (Number.isNaN(value)) {
    return 'NaN';
  }
  if (value === Number.POSITIVE_INFINITY) {
    return '+Inf';
  }
  if (value === Number.NEGATIVE_INFINITY) {
    return '-Inf';
  }
  return String(value);
}

/** The bucket boundaries of a histogram series, cumulated at render time. */
interface BucketBoundary {
  readonly le: number;
  count: number;
}

/** One series of one metric: a fixed label set and the value(s) recorded against it. */
interface MetricSeries {
  /** The declared label names, rendered in this order. */
  readonly labelNames: readonly string[];
  /** The label values for this series, aligned with `labelNames`. */
  readonly labels: readonly string[];
  /** The counter or gauge value. */
  value: number;
  /** The histogram observation count and sum. */
  count: number;
  sum: number;
  /** Cumulative bucket counts, `null` for a counter or gauge. */
  readonly buckets: readonly BucketBoundary[] | null;
}

/**
 * The key a series is stored under.
 *
 * `JSON.stringify` of the aligned pairs rather than a concatenation: two label values that contain the
 * separator would otherwise collide (`{a: 'x|y', b: 'z'}` and `{a: 'x', b: 'y|z'}` both produce
 * `x|y|z`), and a collision between two series is a metric that silently under-counts.
 */
function seriesKey(labelNames: readonly string[], labelValues: readonly string[]): string {
  return JSON.stringify(labelNames.map((name, index) => [name, labelValues[index] ?? '']));
}

/**
 * Resolves a caller-supplied label object against the declared names, in declaration order.
 *
 * WHY IT RETURNS A VALUE RATHER THAN MUTATING A MAP. The declared order is a property of the metric, so
 * the returned array is built once per recording and the renderer can index straight into it — which
 * also means a series can never accidentally render its labels in a different order from its sibling.
 */
function resolveLabels(labelNames: readonly string[], labels: MetricLabels | undefined): string[] {
  if (labelNames.length === 0) {
    return [];
  }

  const resolved: string[] = [];
  for (const name of labelNames) {
    const value = labels?.[name];
    if (value === undefined) {
      throw new MetricLabelError(`Metric label "${name}" is required`);
    }
    resolved.push(value);
  }

  const unexpected = Object.keys(labels ?? {}).filter((name) => !labelNames.includes(name));
  if (unexpected.length > 0) {
    throw new MetricLabelError(
      `Metric does not declare label(s) ${unexpected.map((name) => `"${name}"`).join(', ')}`,
    );
  }

  return resolved;
}

/**
 * The storage and rendering every metric shares, and the reason none of them is an `any`.
 *
 * A `Counter` and a `Gauge` differ in one method and one constraint; a `Histogram` differs in the extra
 * series data. That difference is one `if` in `render()` and one validation in the mutator, so the
 * shape is shared and the behaviour is specialized rather than the hierarchy being three near-copies.
 */
abstract class BaseMetric {
  protected readonly series = new Map<string, MetricSeries>();

  constructor(readonly definition: MetricDefinition) {}

  /** Renders this metric's block: HELP, TYPE, then one line per series. */
  render(): string {
    const lines: string[] = [
      `# HELP ${this.definition.name} ${escapeHelp(this.definition.help)}`,
      `# TYPE ${this.definition.name} ${this.definition.type}`,
    ];

    for (const series of this.series.values()) {
      lines.push(...this.renderSeries(series));
    }

    return `${lines.join('\n')}\n`;
  }

  /** Renders the label set exactly as declared, so every series of a metric agrees. */
  protected labelSuffix(series: MetricSeries, extra?: readonly { name: string; value: number }[]): string {
    if (series.labelNames.length === 0 && (extra === undefined || extra.length === 0)) {
      return '';
    }

    const pairs: string[] = series.labelNames.map(
      (name, index) => `${name}="${escapeLabelValue(series.labels[index] ?? '')}"`,
    );

    for (const item of extra ?? []) {
      // `formatValue` and not `String`, because the `+Inf` bucket boundary renders as `+Inf` — the
      // spelling Prometheus's own parser reads. `String(Number.POSITIVE_INFINITY)` is `"Infinity"`,
      // which a scraper rejects and the whole histogram with it.
      pairs.push(`${item.name}="${escapeLabelValue(formatValue(item.value))}"`);
    }

    return `{${pairs.join(',')}}`;
  }

  protected abstract renderSeries(series: MetricSeries): string[];

  /** Drops every series. Used by tests, which must not observe each other's samples. */
  reset(): void {
    this.series.clear();
  }
}

/**
 * A counter: monotonically increasing, and reset only when the process restarts.
 *
 * `inc` with a negative value is refused rather than wrapped. A counter that went down is a counter
 * whose `rate()` a dashboard will read as a wrap-around and plot as a spike, which is worse than the
 * crash that produced the negative value.
 */
export class Counter extends BaseMetric {
  /** Adds `value` to the series, creating the series on first use. */
  inc(labels?: MetricLabels, value = 1): void {
    if (value < 0) {
      throw new MetricLabelError('A counter can only increase');
    }

    const series = this.seriesFor(labels);
    series.value += value;
  }

  /** The recorded total for one label set, `0` when the series was never touched. */
  value(labels?: MetricLabels): number {
    return this.series.get(seriesKey(this.definition.labelNames, resolveLabels(this.definition.labelNames, labels)))
      ?.value ?? 0;
  }

  protected renderSeries(series: MetricSeries): string[] {
    return [`${this.definition.name}${this.labelSuffix(series)} ${formatValue(series.value)}`];
  }

  private seriesFor(labels?: MetricLabels): MetricSeries {
    const values = resolveLabels(this.definition.labelNames, labels);
    const key = seriesKey(this.definition.labelNames, values);
    const existing = this.series.get(key);
    if (existing !== undefined) {
      return existing;
    }

    const created: MetricSeries = {
      labelNames: this.definition.labelNames,
      labels: values,
      value: 0,
      count: 0,
      sum: 0,
      buckets: null,
    };
    this.series.set(key, created);
    return created;
  }
}

/**
 * A gauge: a value that can go up or down, such as a memory sample or an uptime reading.
 *
 * The one that goes DOWN without being told to is uptime — `process.uptime()` advances between
 * samples, so `set` (not `inc`) is what the collector uses.
 */
export class Gauge extends BaseMetric {
  set(labels: MetricLabels | undefined, value: number): void {
    this.seriesFor(labels).value = value;
  }

  inc(labels?: MetricLabels, value = 1): void {
    this.seriesFor(labels).value += value;
  }

  dec(labels?: MetricLabels, value = 1): void {
    this.seriesFor(labels).value -= value;
  }

  value(labels?: MetricLabels): number {
    return this.series.get(seriesKey(this.definition.labelNames, resolveLabels(this.definition.labelNames, labels)))
      ?.value ?? 0;
  }

  protected renderSeries(series: MetricSeries): string[] {
    return [`${this.definition.name}${this.labelSuffix(series)} ${formatValue(series.value)}`];
  }

  private seriesFor(labels?: MetricLabels): MetricSeries {
    const values = resolveLabels(this.definition.labelNames, labels);
    const key = seriesKey(this.definition.labelNames, values);
    const existing = this.series.get(key);
    if (existing !== undefined) {
      return existing;
    }

    const created: MetricSeries = {
      labelNames: this.definition.labelNames,
      labels: values,
      value: 0,
      count: 0,
      sum: 0,
      buckets: null,
    };
    this.series.set(key, created);
    return created;
  }
}

/**
 * A histogram: an observation count, a sum, and cumulative bucket counts.
 *
 * WHY CUMULATIVE AND NOT PER-BUCKET. Prometheus's `histogram_quantile()` expects the buckets to be
 * cumulative, so `le="0.5"` counts every observation less than or equal to 0.5 — including those under
 * 0.005. Rendering them per-bucket would produce a body the function reads as a flat distribution and
 * reports a wrong quantile for, which is the kind of error nobody notices until a latency alert fires
 * at the wrong threshold.
 */
export class Histogram extends BaseMetric {
  private readonly bucketBoundaries: readonly number[];

  constructor(definition: MetricDefinition, buckets: readonly number[] = DEFAULT_HISTOGRAM_BUCKETS) {
    super(definition);
    const sorted = [...buckets].sort((left, right) => left - right);
    if (sorted.some((boundary) => boundary < 0)) {
      throw new MetricNameError('Histogram buckets must not be negative');
    }
    this.bucketBoundaries = sorted;
  }

  /**
   * Records one observation.
   *
   * A negative observation is refused: the buckets are durations, and a duration that went backwards
   * would land in no bucket at all while still incrementing the count, leaving `_count` and the sum of
   * the buckets disagreeing about how many observations there were.
   */
  observe(labels: MetricLabels | undefined, value: number): void {
    if (value < 0) {
      throw new MetricLabelError('A histogram can only observe non-negative values');
    }

    const series = this.seriesFor(labels);
    series.count += 1;
    series.sum += value;
    for (const bucket of series.buckets ?? []) {
      if (value <= bucket.le) {
        bucket.count += 1;
      }
    }
  }

  /** The number of observations, for tests and for callers that want the raw total. */
  count(labels?: MetricLabels): number {
    return this.seriesFor(labels).count;
  }

  protected renderSeries(series: MetricSeries): string[] {
    const lines: string[] = [];
    const name = this.definition.name;

    for (const bucket of series.buckets ?? []) {
      lines.push(`${name}_bucket${this.labelSuffix(series, [{ name: 'le', value: bucket.le }])} ${bucket.count}`);
    }
    lines.push(`${name}_bucket${this.labelSuffix(series, [{ name: 'le', value: Number.POSITIVE_INFINITY }])} ${series.count}`);
    lines.push(`${name}_count${this.labelSuffix(series)} ${series.count}`);
    lines.push(`${name}_sum${this.labelSuffix(series)} ${formatValue(series.sum)}`);

    return lines;
  }

  private seriesFor(labels?: MetricLabels): MetricSeries {
    const values = resolveLabels(this.definition.labelNames, labels);
    const key = seriesKey(this.definition.labelNames, values);
    const existing = this.series.get(key);
    if (existing !== undefined) {
      return existing;
    }

    const created: MetricSeries = {
      labelNames: this.definition.labelNames,
      labels: values,
      value: 0,
      count: 0,
      sum: 0,
      buckets: this.bucketBoundaries.map((le) => ({ le, count: 0 })),
    };
    this.series.set(key, created);
    return created;
  }
}

/**
 * The registry itself: the one place a metric name is validated and the one place the exposition body
 * is built.
 *
 * As an injectable class rather than a plain module, so a test can substitute it and so the
 * `MetricsInterceptor` and `PrometheusController` reach the SAME instance — which is the property that
 * makes the endpoint worth scraping at all. Two registries (one per consumer) would render a body with
 * half of each metric's samples.
 */
export class PrometheusRegistry {
  /**
   * Insertion-ordered, so `render()` is deterministic.
   *
   * A `Map` gives that for free; an object keyed by metric name would sort the names alphabetically on
   * some runtimes and by insertion on others, and a scraping body whose series order changed between
   * scrapes is a body nobody can diff against the previous one.
   */
  private readonly metrics = new Map<string, BaseMetric>();

  /** Declares a counter, refusing a name the exposition format rejects or one already registered. */
  createCounter(name: string, help: string, labelNames: readonly string[] = []): Counter {
    return this.register(new Counter(this.definition(name, help, 'counter', labelNames)));
  }

  /** Declares a gauge. */
  createGauge(name: string, help: string, labelNames: readonly string[] = []): Gauge {
    return this.register(new Gauge(this.definition(name, help, 'gauge', labelNames)));
  }

  /** Declares a histogram, with the default buckets unless others are given. */
  createHistogram(name: string, help: string, labelNames: readonly string[] = [], buckets?: readonly number[]): Histogram {
    return this.register(new Histogram(this.definition(name, help, 'histogram', labelNames), buckets));
  }

  /** The definitions this registry holds, in registration order. */
  listDefinitions(): readonly MetricDefinition[] {
    return [...this.metrics.values()].map((metric) => metric.definition);
  }

  /** Drops every series from every metric, leaving the declarations. */
  reset(): void {
    for (const metric of this.metrics.values()) {
      metric.reset();
    }
  }

  /**
   * Builds the whole exposition body.
   *
   * One trailing newline after each metric's block and no blank line between blocks: the format
   * describes a sequence of `# HELP` / `# TYPE` / sample lines, and a blank line is ignored by a
   * lenient parser and rejected by a strict one.
   */
  render(): string {
    return [...this.metrics.values()].map((metric) => metric.render()).join('');
  }

  private definition(
    name: string,
    help: string,
    type: MetricType,
    labelNames: readonly string[],
  ): MetricDefinition {
    if (!METRIC_NAME_PATTERN.test(name)) {
      throw new MetricNameError(
        `Metric name "${name}" must match [a-zA-Z_:][a-zA-Z0-9_:]* to be a valid Prometheus metric name`,
      );
    }
    if (name.startsWith('__')) {
      // Reserved by Prometheus for its own metadata; a client that emits one is overwritten.
      throw new MetricNameError(`Metric name "${name}" uses the reserved "__" prefix`);
    }
    if (this.metrics.has(name)) {
      throw new MetricNameError(`Metric "${name}" is already registered`);
    }

    for (const labelName of labelNames) {
      if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(labelName)) {
        throw new MetricLabelError(`Label name "${labelName}" must match [a-zA-Z_][a-zA-Z0-9_]*`);
      }
      if (labelName === 'le') {
        // `le` is the histogram bucket boundary label and is rendered by the histogram itself.
        throw new MetricLabelError(`Label name "le" is reserved by histograms`);
      }
    }

    return { name, help, type, labelNames: [...labelNames] };
  }

  private register<T extends BaseMetric>(metric: T): T {
    this.metrics.set(metric.definition.name, metric);
    return metric;
  }
}
