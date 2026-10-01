import { SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { ExecutionContext } from '@nestjs/common';

export const CACHE_OPTIONS_METADATA = 'hakawi:cache:options';
export const CACHE_INVALIDATE_TAGS_METADATA = 'hakawi:cache:invalidate-tags';
export const CACHE_WARM_TAGS_METADATA = 'hakawi:cache:warm-tags';

export const DEFAULT_CACHE_TTL_SECONDS = 3600;
export const DEFAULT_CACHE_NAMESPACE = 'default';

/** Stands in for the user scope of a request that carries no authenticated user. */
export const ANONYMOUS_USER_SCOPE = 'anon';

/** Stands in for the route identity of a handler that has no usable name. */
export const UNNAMED_ROUTE_SCOPE = 'unnamed';

export interface CacheKeyContext {
  readonly request: Record<string, unknown>;
  readonly params: Record<string, string>;
  readonly userId: string | null;
  /**
   * Identity of the handler the key is being built for (`ClassName.methodName`).
   * Part of the default key because two handlers that share a namespace must not share a key.
   */
  readonly route: string;
}

export interface ResolvedCacheOptions {
  readonly namespace: string;
  readonly ttl: number;
  readonly tags: readonly string[];
  readonly keyParams: readonly string[];
  readonly key?: (context: CacheKeyContext) => string;
}

export type CacheableOptions = Partial<ResolvedCacheOptions>;

const metadataReader = new Reflector();

function normalizeTags(tags: readonly string[] | undefined): readonly string[] {
  if (!tags) {
    return [];
  }
  return tags.map((tag) => tag.trim()).filter((tag) => tag.length > 0);
}

export function Cacheable(options: CacheableOptions = {}): MethodDecorator & ClassDecorator {
  return SetMetadata(CACHE_OPTIONS_METADATA, {
    namespace: options.namespace ?? DEFAULT_CACHE_NAMESPACE,
    ttl: options.ttl ?? DEFAULT_CACHE_TTL_SECONDS,
    tags: normalizeTags(options.tags),
    keyParams: options.keyParams ?? [],
    key: options.key,
  } satisfies CacheableOptions);
}

export function InvalidateCacheTags(tags: readonly string[]): MethodDecorator & ClassDecorator {
  return SetMetadata(CACHE_INVALIDATE_TAGS_METADATA, normalizeTags(tags));
}

export function WarmCacheTags(tags: readonly string[]): MethodDecorator & ClassDecorator {
  return SetMetadata(CACHE_WARM_TAGS_METADATA, normalizeTags(tags));
}

export function resolveCacheOptions(options: CacheableOptions | undefined): ResolvedCacheOptions | null {
  if (!options) {
    return null;
  }
  return {
    namespace: options.namespace ?? DEFAULT_CACHE_NAMESPACE,
    ttl: options.ttl ?? DEFAULT_CACHE_TTL_SECONDS,
    tags: normalizeTags(options.tags),
    keyParams: options.keyParams ?? [],
    key: options.key,
  };
}

export function readCacheOptions(context: ExecutionContext): ResolvedCacheOptions | null {
  const fromHandler = metadataReader.get<CacheableOptions | undefined>(CACHE_OPTIONS_METADATA, context.getHandler());
  const fromClass = metadataReader.get<CacheableOptions | undefined>(CACHE_OPTIONS_METADATA, context.getClass());
  return resolveCacheOptions(fromHandler ?? fromClass);
}

export function readTagMetadata(context: ExecutionContext, metadataKey: string): readonly string[] {
  const fromHandler = metadataReader.get<string[] | undefined>(metadataKey, context.getHandler());
  const fromClass = metadataReader.get<string[] | undefined>(metadataKey, context.getClass());
  return normalizeTags(fromHandler ?? fromClass);
}

export function readInvalidateTags(context: ExecutionContext): readonly string[] {
  return readTagMetadata(context, CACHE_INVALIDATE_TAGS_METADATA);
}

export function readWarmTags(context: ExecutionContext): readonly string[] {
  return readTagMetadata(context, CACHE_WARM_TAGS_METADATA);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Escapes the `:` separator so a value containing one cannot forge a different key by shifting
 * segments across a boundary (`{a: 'x', b: 'y'}` must not collide with `{a: 'x:b', b: 'y'}`).
 */
function escapeSegment(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/:/g, '\\:');
}

/** Renders a query value deterministically: `?tags=a&tags=b` must key the same on every request. */
function queryValueToString(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  if (Array.isArray(value)) {
    return value.map(queryValueToString).join(',');
  }
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }
  return String(value);
}

/**
 * The query string in a canonical order. `?b=2&a=1` and `?a=1&b=2` are the same request and must
 * produce the same key, so entries are sorted by name rather than taken in arrival order.
 */
function canonicalQuery(query: unknown): readonly string[] {
  if (!isRecord(query)) {
    return [];
  }
  return Object.entries(query)
    .filter(([name]) => name.length > 0)
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([name, value]) => `${escapeSegment(name)}=${escapeSegment(queryValueToString(value))}`);
}

function keyParamValues(options: ResolvedCacheOptions, context: CacheKeyContext): readonly string[] {
  return options.keyParams.map((name) => {
    const value = context.params[name] ?? context.request[name];
    return value === null || value === undefined ? '' : String(value);
  });
}

/**
 * Builds the Valkey key for a cached response.
 *
 * ## Why the default path is built the way it is
 *
 * The previous default was `cache:<namespace>:<keyParams joined>` — and `keyParams` defaults to
 * `[]`, so *every* request to a `@Cacheable({ namespace: 'feed' })` route collapsed onto
 * `cache:feed:default`. On an authenticated or paginated route that served one user's response to
 * every other user. The interceptor is bound globally, so a decorator that merely forgot
 * `keyParams` was enough to turn a cache into a cross-user data leak, and nothing failed loudly:
 * the response was valid JSON from a valid-looking key.
 *
 * A cache that can silently serve one user's data to another is worse than no cache, so the
 * default now fails safe by construction. Everything that can change the response is in the key:
 *
 *   cache:<namespace>:<route>:u:<userId|anon>[:p:<keyParams>][:q:<canonical query>]
 *
 * so a misconfigured decorator — no `key`, no `keyParams` — still separates different users,
 * different query strings and different routes. Two requests only share a key when the route,
 * the user, the declared key params and the query string are all equal, i.e. when they genuinely
 * asked for the same thing.
 *
 * A custom `key` function is still honoured verbatim: it is an explicit opt-out that receives the
 * full context (`userId`, `params`, `request.query`) and is therefore responsible for whatever
 * dimensions it chooses to encode.
 */
export function buildCacheKey(options: ResolvedCacheOptions, context: CacheKeyContext): string {
  if (options.key) {
    return `cache:${options.namespace}:${options.key(context)}`;
  }

  const segments = [context.route, context.userId === null ? ANONYMOUS_USER_SCOPE : `u:${context.userId}`];

  const params = keyParamValues(options, context);
  if (params.length > 0) {
    segments.push(`p:${params.map(escapeSegment).join(':')}`);
  }

  const query = canonicalQuery(context.request.query);
  if (query.length > 0) {
    segments.push(`q:${query.join('&')}`);
  }

  return `cache:${options.namespace}:${segments.join(':')}`;
}

/** `ClassName.methodName` for the handler being cached. */
function routeIdentity(context: ExecutionContext): string {
  const handlerName = context.getHandler().name;
  const className = context.getClass()?.name ?? '';
  if (className === '' || handlerName === '') {
    return UNNAMED_ROUTE_SCOPE;
  }
  return `${className}.${handlerName}`;
}

function stringParams(request: Record<string, unknown>): Record<string, string> {
  const params = request.params;
  if (!isRecord(params)) {
    return {};
  }
  const normalized: Record<string, string> = {};
  for (const [key, entry] of Object.entries(params)) {
    normalized[key] = typeof entry === 'string' ? entry : String(entry);
  }
  return normalized;
}

function stringUserId(request: Record<string, unknown>): string | null {
  const user = request.user;
  if (typeof user === 'object' && user !== null) {
    const id = (user as { id?: unknown }).id;
    if (typeof id === 'string') {
      return id;
    }
    if (typeof id === 'number') {
      return String(id);
    }
  }
  if (typeof request.userId === 'string') {
    return request.userId;
  }
  return null;
}

/**
 * Builds the {@link CacheKeyContext} for a request. Lives beside {@link buildCacheKey} so the
 * dimensions a key is made of, and where each dimension is read from, are one reviewable unit —
 * a dimension that is documented in one file and read in another is a dimension that gets dropped.
 */
export function resolveCacheKeyContext(context: ExecutionContext): CacheKeyContext {
  const request = context.switchToHttp().getRequest<Record<string, unknown>>();
  return {
    request,
    params: stringParams(request),
    userId: stringUserId(request),
    route: routeIdentity(context),
  };
}

/** The Valkey set that indexes every cache key written under `tag`. */
export function tagIndexKey(tag: string): string {
  return `cache:tag:${tag}`;
}

/**
 * The Valkey counter that marks "everything cached under this tag has been invalidated".
 * Persistent on purpose — see `modules/shared/cache/tag-generation.ts`.
 */
export function tagGenerationKey(tag: string): string {
  return `cache:taggen:${tag}`;
}
