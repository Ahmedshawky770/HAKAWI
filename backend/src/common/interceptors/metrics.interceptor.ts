import { HttpStatus, Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import type { Response } from 'express';

import { HTTP_REQUESTS_TOTAL_NAME, PrometheusRegistry } from '../observability/prometheus-registry.ts';
import type { Counter } from '../observability/prometheus-registry.ts';
import { statusFromException } from '../filters/all-exceptions.filter.ts';

/**
 * The route label used when no route matched the request.
 *
 * A constant, NOT the raw URL. `GET /stories/does-not-exist` and `GET /stories/also-does-not` are two
 * different paths; using them as labels would create one series per miss, and the cardinality of that
 * series grows with the number of id-less requests a client makes — which is unbounded, and is
 * precisely the shape that makes a Prometheus instance fall over. One series named `unresolved` says
 * what a dashboard needs to know and no more.
 */
export const UNRESOLVED_ROUTE_LABEL = 'unresolved';

/**
 * The shape of the request this interceptor reads.
 *
 * DECLARED LOCALLY AND NOT DERIVED FROM EXPRESS'S `Request`. `@types/express` declares
 * `Request.route` as `any` (`Request extends http.IncomingMessage`, and `route` is set by the router,
 * not by the type), so an intersection with a typed `route` collapses back to `any` — and the
 * sanitizer's sibling rule (Principle #1) is that `any` at a boundary is how an unchecked value
 * becomes a behaviour. Declaring the three fields this interceptor actually reads keeps them typed
 * through the whole path, and costs one extra type.
 */
type AnnotatedRequest = {
  readonly method: string;
  readonly baseUrl?: string;
  readonly route?: { readonly path?: string };
};

/**
 * Counts every request the application handles, by method, ROUTE TEMPLATE and status.
 *
 * WHY THIS IS AN INTERCEPTOR AND NOT MIDDLEWARE. A middleware mounted with `app.use` sits before the
 * router, so it runs on requests that never reach a controller — including the WAF middleware chain's
 * own early rejections. An interceptor runs for routes that resolved, and `request.route.path` is
 * therefore the Express PATTERN (`/stories/:id`) rather than the URL the caller typed
 * (`/stories/abc`). A counter keyed on the pattern is bounded by the number of routes; a counter keyed
 * on the URL is bounded by the number of requests.
 *
 * WHY THE LABEL IS THE PATTERN AND NOT `originalUrl`. It is the same problem one level down: a search
 * page is `/search?q=…`, and the query string is caller-controlled, so every distinct query would
 * mint a series. A series that grows without bound eventually costs more than the request it counted.
 *
 * WHAT THE THREE LABELS ARE FOR. `method` and `route` say WHERE the traffic went; `status` says
 * WHETHER it worked. Together they are the denominator for every other metric this process emits —
 * a per-route error rate is `http_requests_total{status=~"5.."}` over `http_requests_total`, and
 * neither number is computable without the other.
 */
@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  private readonly requestCounter: Counter;

  constructor(registry: PrometheusRegistry) {
    this.requestCounter = registry.createCounter(
      HTTP_REQUESTS_TOTAL_NAME,
      'Total HTTP requests processed, by route template and status',
      ['method', 'route', 'status'],
    );
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<AnnotatedRequest>();
    const response = context.switchToHttp().getResponse<Response>();
    const method = request.method;

    // The route is read in the RESPONSE phase and not in the request phase. `request.route` is
    // populated by the router, which runs as part of the handler chain: at the moment `intercept` is
    // entered it is not there yet, so a template resolved up front would be `unresolved` for every
    // request and the metric would never name a single route.
    return next.handle().pipe(
      tap({
        next: () => this.record(request, method, response.statusCode),
        error: (error: unknown) => this.record(request, method, this.resolveStatus(error, response.statusCode)),
      }),
    );
  }

  /**
   * Resolves the status to record for a request that failed.
   *
   * WHY NOT JUST `response.statusCode`. The `AllExceptionsFilter` runs AFTER this interceptor's error
   * callback — it is what actually writes the status — so at the moment this records, the express
   * response still carries the 200 it was initialised with. Reading it directly would count every
   * `NotFoundException` as a success, and an error-rate alert built on
   * `http_requests_total{status=~"5.."} / http_requests_total` would divide the failures by a
   * denominator that has already swallowed them.
   *
   * WHY THE STATUS IS NOT RE-DERIVED HERE. The mapping from an exception to a status belongs to the
   * filter — it is the filter's body that tells the client what happened — so it is imported from it
   * (`statusFromException`) rather than re-implemented. What THIS method still decides is the one thing
   * the filter cannot know: whether the handler had already put a status of its own on the response
   * before it threw. That status is the better answer, because it is the one the client receives once
   * the filter runs.
   */
  private resolveStatus(error: unknown, responseStatusCode: number): number {
    const fallback = responseStatusCode >= 400 ? responseStatusCode : HttpStatus.INTERNAL_SERVER_ERROR;
    return statusFromException(error, fallback);
  }

  /**
   * Records one sample.
   *
   * WHY THE STATUS IS READ FROM THE RESPONSE AND NOT INFERRED FROM THE EXCEPTION. The
   * `AllExceptionsFilter` runs after this interceptor's `error` callback, so the status it writes is
   * not on the `express` response yet — and counting every failure as 500 would count a
   * `NotFoundException`'s 404 as a server error, which is the one distinction a latency/error alert
   * turns on. What is read instead is the status at the moment of recording, which is 200 for a
   * successful response and whatever the handler itself set before throwing.
   *
   * WHY THE STATUS IS `String()`ED. Prometheus label values are strings and `statusCode` is a number;
   * converting at the boundary rather than declaring the label as a number keeps the label map's type
   * honest and the rendered body spec-conformant.
   */
  private record(request: AnnotatedRequest, method: string, statusCode: number): void {
    this.requestCounter.inc({ method, route: this.resolveRouteTemplate(request), status: String(statusCode) });
  }

  /**
   * Builds the route template for one request.
   *
   * `request.route.path` is the matched pattern and `request.baseUrl` is whatever the router was
   * mounted under — the global `api/v1` prefix in this application, and `''` in a unit test that boots
   * a bare `NestApplication`. Concatenating them reproduces the full path an operator sees in a log
   * line, so the same route has the same label in a test and in production.
   */
  private resolveRouteTemplate(request: AnnotatedRequest): string {
    const routePath = request.route?.path;
    if (routePath === undefined || routePath === '') {
      return UNRESOLVED_ROUTE_LABEL;
    }
    return `${request.baseUrl ?? ''}${routePath}`;
  }
}
