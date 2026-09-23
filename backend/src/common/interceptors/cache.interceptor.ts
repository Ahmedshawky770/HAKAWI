import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable, from, of } from 'rxjs';
import { map, switchMap, catchError } from 'rxjs/operators';

import { ValkeyService } from '../services/valkey.service.ts';
import { WinstonLoggerService } from '../services/winston-logger.service.ts';
import { GetCacheKey, GetCacheTtl } from '../decorators/cache.decorator.ts';

@Injectable()
export class CacheInterceptor implements NestInterceptor {
  constructor(
    private readonly valkeyService: ValkeyService,
    private readonly winstonLogger: WinstonLoggerService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const cacheKey = GetCacheKey(context);
    const ttl = GetCacheTtl(context);

    if (!cacheKey || !ttl) {
      return next.handle();
    }

    return from(this.valkeyService.get(cacheKey)).pipe(
      switchMap((cachedValue) => {
        if (cachedValue) {
          this.winstonLogger.debug(`Cache hit: ${cacheKey}`, 'CacheInterceptor');
          const parsed = JSON.parse(cachedValue) as unknown;
          return of(parsed);
        }
        return next.handle().pipe(
          map((data: unknown) => {
            try {
              void this.valkeyService.set(cacheKey, JSON.stringify(data), ttl);
              this.winstonLogger.debug(`Cache set: ${cacheKey}`, 'CacheInterceptor');
            } catch (error) {
              this.winstonLogger.error(`Cache set error: ${(error as Error).message}`, (error as Error).stack, 'CacheInterceptor');
            }
            return data;
          }),
          catchError((err) => {
            this.winstonLogger.error(`Cache fetch error: ${(err as Error).message}`, (err as Error).stack, 'CacheInterceptor');
            throw err;
          }),
        );
      }),
    );
  }
}
