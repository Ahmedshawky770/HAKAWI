import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request, Response, NextFunction } from 'express';
import * as express from 'express';

import { AppModule } from './app.module.ts';
import { WinstonLoggerService } from './common/services/winston-logger.service.ts';
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

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: new WinstonLoggerService(),
    bodyParser: false,
  });

  initSentry(app.get(WinstonLoggerService));

  const winstonLogger = app.get(WinstonLoggerService);
  const logger = new Logger('Bootstrap');

  // DELIBERATELY NOT CALLED: app.set('trust proxy', …).
  //
  // Turning it on makes Express derive `req.ip` from `X-Forwarded-For`, a header any
  // client can set. `WafMiddleware` and the throttle tracker both key on the caller's
  // address — a blocklist and a rate limit — so an unverified `req.ip` would let a
  // forged header walk straight through both. Both read the header themselves and only
  // when the shared `THROTTLE_TRUST_PROXY` flag is set, so the trust decision lives in
  // one place. Anyone adding `app.set('trust proxy', true)` here must make that flag
  // true as well, or the two layers will disagree about who the caller is.
  const throttle = app.get(ConfigService).get<ThrottleConfig>('throttle');
  for (const warning of throttle?.globalOverrideWarnings ?? []) {
    winstonLogger.warn(warning, 'ThrottleConfig');
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
  // `GET /api/v1/metrics/cache` and `GET /api/v1/metrics/degradation` are served by
  // `CacheMetricsController`, declared on `CommonModule` — see
  // `common/observability/metrics.controller.ts`. The cache route used to be registered
  // here on the raw Express adapter, where it sat outside the Nest routing tree and
  // therefore outside `JwtAuthGuard`, `RolesGuard`, the global validation pipe, the
  // global exception filter and the global prefix: an unauthenticated caller could read
  // the cache counters. Both routes now go through the same chain as every other route
  // and require a super-admin token.

  app.useGlobalPipes(
    new (await import('@nestjs/common')).ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
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

  await app.listen(port);
  logger.log(`Application is running on: http://localhost:${port}/api/v1`);
  logger.log(`Environment: ${process.env.NODE_ENV ?? 'development'}`);
}

bootstrap().catch((error) => {
  const logger = new Logger('Bootstrap');
  logger.error('Failed to start application', error);
  process.exit(1);
});
