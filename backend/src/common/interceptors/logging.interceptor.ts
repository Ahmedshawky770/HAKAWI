import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { WinstonLoggerService } from '../services/winston-logger.service.ts';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  constructor(private readonly logger: WinstonLoggerService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest();
    const { method, url, ip } = request;
    const userAgent = request.get('user-agent') || 'unknown';
    const userId = request.user?.sub || 'anonymous';

    this.logger.info(`Request: ${method} ${url} - IP: ${ip} - User: ${userId} - UA: ${userAgent}`);

    return next.handle().pipe(
      tap({
        next: (data) => {
          const response = context.switchToHttp().getResponse();
          this.logger.info(`Response: ${method} ${url} - ${response.statusCode}`);
        },
        error: (error) => {
          this.logger.error(`Error: ${method} ${url} - ${error instanceof Error ? error.message : String(error)}`, error instanceof Error ? error.stack : undefined);
        },
      }),
    );
  }
}