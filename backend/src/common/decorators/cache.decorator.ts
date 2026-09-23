import { ExecutionContext } from '@nestjs/common';

export const CACHE_KEY_METADATA = 'cache:key';
export const CACHE_TTL_METADATA = 'cache:ttl';

export interface CacheOptions {
  key: string;
  ttl: number;
}

export function Cacheable(options: CacheOptions): MethodDecorator {
  return function (target: object, propertyKey: string | symbol, descriptor: PropertyDescriptor) {
    Reflect.defineMetadata(CACHE_KEY_METADATA, options.key, descriptor.value as object);
    Reflect.defineMetadata(CACHE_TTL_METADATA, options.ttl, descriptor.value as object);
    return descriptor;
  };
}

export function GetCacheKey(context: ExecutionContext): string | undefined {
  const handler = context.getHandler();
  return Reflect.getMetadata(CACHE_KEY_METADATA, handler) as string | undefined;
}

export function GetCacheTtl(context: ExecutionContext): number | undefined {
  const handler = context.getHandler();
  return Reflect.getMetadata(CACHE_TTL_METADATA, handler) as number | undefined;
}
