import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

import { AppModule } from './app.module.ts';
import { WinstonLoggerService } from './common/services/winston-logger.service.ts';
import { WafMiddleware } from './common/middleware/waf.middleware.ts';


async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: new WinstonLoggerService(),
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

  await app.listen(port);
  logger.log(`Application is running on: http://localhost:${port}/api/v1`);
  logger.log(`Environment: ${process.env.NODE_ENV ?? 'development'}`);
}

bootstrap().catch((error) => {
  const logger = new Logger('Bootstrap');
  logger.error('Failed to start application', error);
  process.exit(1);
});
