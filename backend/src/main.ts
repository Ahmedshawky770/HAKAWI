import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import * as express from 'express';

import { AppModule } from './app.module.ts';
import { WinstonLoggerService } from './common/services/winston-logger.service.ts';
import { WafMiddleware } from './common/middleware/waf.middleware.ts';
import { RedisIoAdapter } from './redis-io.adapter.ts';
import { setupSwagger } from './common/swagger/swagger.config.ts';

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
  const contentLength = req.headers['content-length'];
  if (contentLength && Number(contentLength) > 10 * 1024 * 1024) {
    res.status(413).json({
      statusCode: 413,
      message: 'Payload too large',
      error: 'Request body exceeds 10MB limit',
    });
    return;
  }
  next();
}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: new WinstonLoggerService(),
    bodyParser: false,
  });

  const port = process.env.PORT ?? 3001;
  const corsOrigin = process.env.CORS_ORIGIN ?? 'http://localhost:3000';

  app.enableCors({
    origin: corsOrigin,
    credentials: true,
  });

  app.setGlobalPrefix('api/v1');

  const winstonLogger = app.get(WinstonLoggerService);
  const logger = new Logger('Bootstrap');

  app.use(requestSizeLimit);

  app.use(express.json({
    verify: (req: Request & { rawBody?: string }, _res: Response, buf: Buffer) => {
      req.rawBody = buf.toString('utf8');
    },
    limit: '10mb',
  }));

  app.use(express.urlencoded({
    extended: true,
    verify: (req: Request & { rawBody?: string }, _res: Response, buf: Buffer) => {
      req.rawBody = buf.toString('utf8');
    },
    limit: '10mb',
  }));

  if (process.env.SENTRY_DSN) {
    try {
      const { SentryModule } = await import('@sentry/nestjs');
      app.use(SentryModule.HTTP_HANDLER);
    } catch {
      winstonLogger.warn('Sentry DSN configured but @sentry/nestjs is not installed', 'Bootstrap');
    }
  }

  app.use(applySecurityHeaders);

  const wafMiddleware = new WafMiddleware(winstonLogger);
  app.use((request: Request, response: Response, next: NextFunction) => wafMiddleware.use(request, response, next));

  const { AllExceptionsFilter } = await import('./common/filters/all-exceptions.filter.ts');
  app.useGlobalFilters(new AllExceptionsFilter(winstonLogger));

  const { LoggingInterceptor } = await import('./common/interceptors/logging.interceptor.ts');
  const loggingInterceptor = app.get(LoggingInterceptor);
  app.useGlobalInterceptors(loggingInterceptor);

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
  const redisIoAdapter = new RedisIoAdapter(moduleRef);
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
