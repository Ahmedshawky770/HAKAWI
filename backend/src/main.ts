import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { Logger } from '@nestjs/common';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter.js';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor.js';
import { WinstonLoggerService } from './common/services/winston-logger.service.js';
import { WafMiddleware } from './common/middleware/waf.middleware.js';
import { runMigrations } from './db/migrations/migration-runner.js';
import { Request, Response, NextFunction } from 'express';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: new WinstonLoggerService(),
  });
  const logger = new Logger('Bootstrap');

  const port = process.env.PORT ?? 3001;
  const corsOrigin = process.env.CORS_ORIGIN ?? 'http://localhost:3000';

  app.enableCors({
    origin: corsOrigin,
    credentials: true,
  });

  app.setGlobalPrefix('api/v1');

  const winstonLogger = app.get(WinstonLoggerService);
  const wafMiddleware = new WafMiddleware(winstonLogger);
  app.use((request: Request, response: Response, next: NextFunction) => wafMiddleware.use(request, response, next));

  app.useGlobalFilters(new AllExceptionsFilter(winstonLogger));

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

  if (process.env.RUN_MIGRATIONS === 'true') {
    try {
      await runMigrations();
      logger.log('Database migrations executed successfully');
    } catch (error) {
      logger.error('Failed to run database migrations', error as Error, 'Bootstrap');
    }
  }

  await app.listen(port);
  logger.log(`Application is running on: http://localhost:${port}/api/v1`);
  logger.log(`Environment: ${process.env.NODE_ENV ?? 'development'}`);
}
bootstrap();
