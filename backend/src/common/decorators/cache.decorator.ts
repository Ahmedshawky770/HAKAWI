import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const CACHE_KEY_METADATA = 'cache:key';
export const CACHE_TTL_METADATA = 'cache:ttl';

export interface CacheOptions {
  key: string;
  ttl: number;
}

export function Cacheable(options: CacheOptions): MethodDecorator {
  return function (target: unknown, propertyKey: string | symbol, descriptor: PropertyDescriptor) {
    Reflect.defineMetadata(CACHE_KEY_METADATA, options.key, descriptor.value);
    Reflect.defineMetadata(CACHE_TTL_METADATA, options.ttl, descriptor.value);
    return descriptor;
  };
}

export function GetCacheKey(context: ExecutionContext): string | undefined {
  const handler = context.getHandler();
  return Reflect.getMetadata(CACHE_KEY_METADATA, handler);
}

export function GetCacheTtl(context: ExecutionContext): number | undefined {
  const handler = context.getHandler();
  return Reflect.getMetadata(CACHE_TTL_METADATA, handler);
}
