import { Injectable, NestInterceptor, ExecutionContext, CallHandler, Inject } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { type Request, type Response } from 'express';

import { WinstonLoggerService } from '../services/winston-logger.service.ts';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  constructor(@Inject(WinstonLoggerService) private readonly logger: WinstonLoggerService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    const method = request.method;
    const url = request.url;
    const ip = request.ip;
    const userAgent = request.get('user-agent') || 'unknown';
    const userId = (request.user as { sub?: string } | undefined)?.sub || 'anonymous';

    this.logger.info(`Request: ${method} ${url} - IP: ${String(ip)} - User: ${userId} - UA: ${userAgent}`);

    return next.handle().pipe(
      tap({
        next: () => {
          const statusCode = response.statusCode ?? 0;
          this.logger.info(`Response: ${method} ${url} - ${statusCode}`);
        },
        error: (error) => {
          this.logger.error(`Error: ${method} ${url} - ${error instanceof Error ? error.message : String(error)}`, error instanceof Error ? error.stack : undefined);
        },
      }),
    );
  }
}