import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request, Response, NextFunction } from 'express';
import * as express from 'express';

import { AppModule } from './app.module.ts';
import { WinstonLoggerService } from './common/services/winston-logger.service.ts';
import { SmtpEmailTransporter } from './common/email/smtp-email-transporter.ts';
import { WafMiddleware } from './common/middleware/waf.middleware.ts';
import { CacheInterceptor } from './common/interceptors/cache.interceptor.ts';
import { RedisIoAdapter } from './redis-io.adapter.ts';
import { setupSwagger } from './common/swagger/swagger.config.ts';
import { initSentry } from './common/observability/sentry.config.ts';
import type { ThrottleConfig } from './config/throttle.config.ts';

const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
  // Content-Security-Policy: restrict resources to same origin by default
  // Adjust as needed for external scripts, styles, fonts, etc.
  'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
};

function applySecurityHeaders(req: Request, res: Response, next: NextFunction): void {
  for (const [header, value] of Object.entries(SECURITY_HEADERS)) {
    res.setHeader(header, value);
  }

  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }

  next();
}

function requestSizeLimit(req: Request, res: Response, next: NextFunction): void {
  const MAX_BODY_BYTES = 10 * 1024 * 1024;
  const contentLength = req.headers['content-length'];
  if (contentLength && Number(contentLength) > MAX_BODY_BYTES) {
    res.status(413).json({
      statusCode: 413,
      message: 'Payload too large',
      error: 'Request body exceeds 10MB limit',
    });
    return;
  }
  // A request with no Content-Length — or one that carries a lying, non-numeric one — is not
  // rejected here, because the only number available to compare is the header the client
  // controls. It is `Transfer-Encoding: chunked` that matters: that body is never counted
  // against the limit below, so it must not skip the parsers' own `limit` either. The parsers
  // are mounted with the same 10MB ceiling and abort the stream mid-upload, so nothing
  // unbounded is ever fully buffered. See WafMiddleware.measureBodyBytes for the detection
  // counterpart that reports the violation.
  if (req.headers['transfer-encoding'] !== undefined) {
    res.setHeader('Connection', 'close');
  }
  next();
}

/**
 * Whether an error is the operating system refusing a port.
 *
 * The message is matched rather than the class, because the error that reaches here is Node's
 * own `Error` with `code: 'EADDRINUSE'` — there is no dedicated class to test for.
 */
function isAddressInUse(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'EADDRINUSE'
  );
}

/**
 * What to say when the port is taken.
 *
 * WHY THIS IS WORTH SAYING AT ALL. The bare `EADDRINUSE` names neither the port nor what is
 * holding it, and the consequence is not visible from the API's own logs: the frontend keeps
 * running, the BROWSER keeps talking to the process that has the port, and — if that process is
 * not another instance of this API — it answers without CORS headers. The console then reports
 * "Cross-Origin Request Blocked … (Reason: CORS header 'Access-Control-Allow-Origin' missing)" —
 * a CORS fault, in a file whose CORS configuration is correct, for a request that never reached
 * it.
 *
 * So the message names the port, names the check that diagnoses it, and says plainly that the
 * CORS errors in the browser are this and not a CORS misconfiguration.
 */
function describeAddressInUse(port: string | number): string {
  return (
    `Port ${port} is already in use, so the API did not start. ` +
    `Another process is holding it. If that process is not another instance of this API, its answers carry no ` +
    `CORS headers, which is what the "CORS header 'Access-Control-Allow-Origin' missing" console errors are; ` +
    `they are not a CORS misconfiguration here. ` +
    `Run \`npm run check:dev-ports\` from the repository root to see what holds it, ` +
    `stop that process, or start the API on another port with PORT.`
  );
}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: new WinstonLoggerService(),
    bodyParser: false,
  });

  initSentry(app.get(WinstonLoggerService));

  const winstonLogger = app.get(WinstonLoggerService);
  const logger = new Logger('Bootstrap');

  const throttle = app.get(ConfigService).get<ThrottleConfig>('throttle');
  for (const warning of throttle?.globalOverrideWarnings ?? []) {
    winstonLogger.warn(warning, 'ThrottleConfig');
  }

  // Enable trust proxy when explicitly configured (required behind reverse proxy for correct client IP)
  // This must match THROTTLE_TRUST_PROXY so that Express, the throttler, and the WAF all agree on the caller's IP
  if (throttle?.trustProxy) {
    app.set('trust proxy', true);
    winstonLogger.info('Trust proxy enabled - req.ip will be derived from X-Forwarded-For', 'Bootstrap');
  }

  const port = process.env.PORT ?? 3001;
  const corsOrigins = (process.env.CORS_ORIGIN ?? 'http://localhost:3000')
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);

  app.enableCors({
    // An array, not a single string: the browser sends a preflight for a credentialed
    // cross-origin POST, and a single-origin allowlist rejects every other frontend origin
    // at that preflight. The client only sees "Failed to fetch", which names neither CORS
    // nor the origin that was refused, so the failure reads as a network outage.
    origin: corsOrigins,
    credentials: true,
  });

  app.setGlobalPrefix('api/v1');

  app.use(requestSizeLimit);

  app.use(
    express.json({
      verify: (req: Request & { rawBody?: string }, _res: Response, buf: Buffer) => {
        req.rawBody = buf.toString('utf8');
      },
      limit: '10mb',
    }),
  );

  app.use(
    express.urlencoded({
      extended: true,
      verify: (req: Request & { rawBody?: string }, _res: Response, buf: Buffer) => {
        req.rawBody = buf.toString('utf8');
      },
      limit: '10mb',
    }),
  );

  app.use(applySecurityHeaders);

  const wafMiddleware = app.get(WafMiddleware);
  app.use((request: Request, response: Response, next: NextFunction) => wafMiddleware.use(request, response, next));

  const { AllExceptionsFilter } = await import('./common/filters/all-exceptions.filter.ts');
  app.useGlobalFilters(new AllExceptionsFilter(winstonLogger));

  const { LoggingInterceptor } = await import('./common/interceptors/logging.interceptor.ts');
  const loggingInterceptor = app.get(LoggingInterceptor);
  app.useGlobalInterceptors(loggingInterceptor);

  const cacheInterceptor = app.get(CacheInterceptor);
  app.useGlobalInterceptors(cacheInterceptor);

  // WHY THIS IS REGISTERED HERE RATHER THAN ON `AppModule`'s PROVIDERS. `useGlobalInterceptors` reads
  // the instance out of the module container, so the interceptor shares the ONE `PrometheusRegistry`
  // that `PrometheusController` renders — the property that makes `GET /api/v1/metrics` worth scraping.
  // Registering it as a plain provider instead would leave it instantiated per module and the endpoint
  // would render a body with no traffic in it.
  //
  // WHY THE ORDER MATTERS AND WHY IT IS LAST. Interceptors run in registration order on the way in and
  // in reverse on the way out. This one does no observable work on the response path — it appends one
  // sample to a counter — so its position costs nothing either way, and registering it last means the
  // `LoggingInterceptor` and `CacheInterceptor` already around it are unaffected. It is after both
  // because a metric that missed a request is a wrong metric, not a slow one.
  const { MetricsInterceptor } = await import('./common/interceptors/metrics.interceptor.ts');
  app.useGlobalInterceptors(app.get(MetricsInterceptor));

  // `GET /api/v1/metrics/cache` and `GET /api/v1/metrics/degradation` are served by
  // `CacheMetricsController`, declared on `CommonModule` — see
  // `common/observability/metrics.controller.ts`. The cache route used to be registered
  // here on the raw Express adapter, where it sat outside the Nest routing tree and
  // therefore outside `JwtAuthGuard`, `RolesGuard`, the global validation pipe, the
  // global exception filter and the global prefix: an unauthenticated caller could read
  // the cache counters. Both routes now go through the same chain as every other route
  // and require a super-admin token. The Prometheus exposition endpoint,
  // `GET /api/v1/metrics`, is deliberately NOT one of them — see
  // `common/observability/prometheus.controller.ts`.

  // The process gauges are samples of state, so something has to sample them. `DefaultMetricsCollector`
  // owns that timer and `onModuleDestroy` clears it; instantiating it here rather than leaving it to the
  // container means the timer starts only once the application is otherwise fully configured.
  const { DefaultMetricsCollector } = await import('./common/observability/default-metrics.collector.ts');
  app.get(DefaultMetricsCollector).start();

  // Startup email-configuration check. In production, an unconfigured SMTP transport means
  // verification and password-reset mail never leaves the process while the auth endpoints
  // answer truthfully that mail is not configured — a silent degradation worth surfacing at
  // boot rather than discovering at 3am. dev and staging may deliberately run without mail.
  if (process.env.NODE_ENV === 'production') {
    const transporter = app.get(SmtpEmailTransporter);
    if (!transporter.isConfigured()) {
      winstonLogger.error(
        'SMTP transporter is not configured in production: EMAIL_HOST, EMAIL_PORT, EMAIL_USER and EMAIL_PASSWORD are missing. Verification and password-reset mail will not be sent.',
        'Bootstrap',
      );
    }
  }

  app.useGlobalPipes(
    new (await import('@nestjs/common')).ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
      // A body that carries a RETIRED field is answered with a sentence that says what
      // to send instead, rather than with "property paymentMethodId should not exist".
      // Every other validation failure is reported exactly as the pipe reports it.
      exceptionFactory: (await import('./common/validation/retired-fields.ts')).validationExceptionFactory,
    }),
  );

  const { ModuleRef } = await import('@nestjs/core');
  const moduleRef = app.get(ModuleRef);
  // The adapter is given the ConfigService so it resolves the Valkey connection from the same
  // `valkey.config` that ValkeyService uses, rather than reading a different set of environment
  // variable names. See the class comment in redis-io.adapter.ts.
  const redisIoAdapter = new RedisIoAdapter(moduleRef, app.get(ConfigService));
  app.useWebSocketAdapter(redisIoAdapter);

  if (process.env.ENABLE_SWAGGER !== 'false') {
    setupSwagger(app);
  }

  try {
    await app.listen(port);
  } catch (error) {
    if (isAddressInUse(error)) {
      logger.error(describeAddressInUse(port));
      // The process is NOT closed gracefully here, and that is deliberate. The application
      // never finished starting, so its shutdown path is not the one that was designed: the
      // WebSocket adapter's engine was never created, and closing it throws from a tick
      // callback that no `await` can catch — an unhandled crash that buries the message
      // above. `process.exit` is the honest ending for a process that never ran.
      //
      // BUT THE MESSAGE IS FLUSHED FIRST. The logger writes to stdout, and a write to a
      // PIPE is asynchronous — which is exactly what stdout is when the process runs
      // under a supervisor, in a container, or in CI. Exiting on the same tick would
      // truncate the one line that says which port is busy, and the failure would look
      // like a crash with no explanation.
      await flushOutput();
      process.exit(1);
    }
    throw error;
  }
  logger.log(`Application is running on: http://localhost:${port}/api/v1`);
  logger.log(`Environment: ${process.env.NODE_ENV ?? 'development'}`);
}

/**
 * Waits for whatever has been written to stdout and stderr to actually leave the process.
 *
 * A write to a terminal is synchronous, so this returns at once; a write to a pipe or a
 * file is not, and the bytes sit in the stream's buffer until the event loop gets to
 * them. `process.exit` does not wait for that buffer, so the last thing a process
 * prints before it exits is the thing most likely to be lost.
 */
function flushOutput(): Promise<void> {
  const streams = [process.stdout, process.stderr];
  const pending = streams.filter((stream) => stream.writableLength > 0);

  if (pending.length === 0) {
    return Promise.resolve();
  }

  const drained = Promise.all(
    pending.map(
      (stream) =>
        new Promise<void>((resolve) => {
          // The drain never comes if the reader is gone, and the stream says so with an
          // error rather than an event — an unhandled one would end the process with a
          // stack trace instead of the sentence it was about to print.
          const settle = () => {
            stream.off("error", settle);
            resolve();
          };
          stream.once("error", settle);
          stream.once("drain", settle);
        }),
    ),
  ).then(() => undefined);

  // A process that waits forever for a message nobody will read is worse than one that
  // loses the message, so the wait is bounded. The timer is NOT unref'd: an unref'd timer
  // does not keep the event loop alive, so in the very case this bound exists for — a
  // pending write and nothing else — the process would exit on its own, with the
  // SUCCESS code, before the failure was ever reported.
  const giveUp = new Promise<void>((resolve) => {
    setTimeout(resolve, 250);
  });

  return Promise.race([drained, giveUp]);
}

bootstrap().catch(async (error) => {
  const logger = new Logger('Bootstrap');
  logger.error('Failed to start application', error);
  await flushOutput();
  process.exit(1);
});
