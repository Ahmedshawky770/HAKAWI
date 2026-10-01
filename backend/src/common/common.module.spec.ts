import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import { SetMetadata } from '@nestjs/common';
import { getStorageToken } from '@nestjs/throttler';

import { WafMiddleware } from './middleware/waf.middleware.ts';
import { IpBlocklistService } from './waf/ip-blocklist.service.ts';
import { ValkeyThrottlerStorage } from './throttler/valkey-throttler.storage.ts';
import { JwtAuthGuard } from './guards/jwt-auth.guard.ts';
import { RolesGuard } from './guards/roles.guard.ts';
import { PermissionsGuard } from './guards/permissions.guard.ts';
import { OwnershipGuard } from './guards/ownership.guard.ts';
import { CacheMetricsController } from './observability/metrics.controller.ts';
import { CommonModule } from './common.module.ts';

/**
 * Nest stores `@Module()` metadata on the class, so the wiring can be asserted without
 * booting the container. Booting `CommonModule` for real would open a Postgres pool and
 * a Valkey client, and the properties under test here are purely declarative: whether a
 * class is listed as a provider and as an export is exactly what decides whether
 * `@UseGuards(OwnershipGuard)` resolves in another module.
 */
function metadataOf(key: string): unknown[] {
  const value: unknown = Reflect.getMetadata(key, CommonModule);
  return Array.isArray(value) ? (value as unknown[]) : [];
}

describe('CommonModule wiring', () => {
  const providers = metadataOf('providers');
  const exports = metadataOf('exports');
  const controllers = metadataOf('controllers');

  describe('guards that must be resolvable by any module', () => {
    it.each([
      ['JwtAuthGuard', JwtAuthGuard],
      ['RolesGuard', RolesGuard],
      ['PermissionsGuard', PermissionsGuard],
      ['OwnershipGuard', OwnershipGuard],
    ])('provides %s', (_name, guard) => {
      expect(providers).toContain(guard);
    });

    it.each([
      ['JwtAuthGuard', JwtAuthGuard],
      ['RolesGuard', RolesGuard],
      ['PermissionsGuard', PermissionsGuard],
      ['OwnershipGuard', OwnershipGuard],
    ])('exports %s so @UseGuards() resolves outside this module', (_name, guard) => {
      expect(exports).toContain(guard);
    });

    it('registers OwnershipGuard as the injectable class, not only as a factory helper', () => {
      // Before this change the guard existed as a class with a private factory
      // (`createOwnershipGuard`) and appeared nowhere in the module, so `@UseGuards(
      // OwnershipGuard)` could not resolve. A factory-only registration would leave the
      // same trap in place.
      expect(providers).toContain(OwnershipGuard);
    });
  });

  describe('throttle and WAF infrastructure', () => {
    it.each([
      ['IpBlocklistService', IpBlocklistService],
      ['WafMiddleware', WafMiddleware],
    ])('provides and exports %s as a class', (_name, provider) => {
      expect(providers).toContain(provider);
      expect(exports).toContain(provider);
    });

    it('binds ValkeyThrottlerStorage behind the throttler storage token', () => {
      // Registered through `getStorageToken()` so the `ThrottlerGuard` and the metrics
      // controller receive the SAME instance (the in-memory counter state is shared).
      const storageTokens = providers
        .filter((provider): provider is { provide: unknown } => typeof provider === 'object' && provider !== null)
        .map((provider) => provider.provide);

      expect(storageTokens).toContain(getStorageToken());
      expect(providers).not.toContain(ValkeyThrottlerStorage);
    });

    it('binds the rate limiter as a global APP_GUARD', () => {
      const appGuards = providers.filter(
        (provider): provider is { provide: unknown } =>
          typeof provider === 'object' && provider !== null && 'provide' in provider,
      );

      expect(appGuards.map((provider) => provider.provide)).toContain('APP_GUARD');
    });
  });

  describe('the admin metrics endpoints live in the Nest routing tree', () => {
    it('declares CacheMetricsController', () => {
      // Registered on the raw Express adapter in `main.ts` it sat outside every guard,
      // pipe and filter. As a controller it is inside the module graph.
      expect(controllers).toContain(CacheMetricsController);
    });

    it('declares a handler for each documented metric route', () => {
      const handlers: Record<string, () => unknown> = {
        snapshot: CacheMetricsController.prototype.snapshot,
        degradation: CacheMetricsController.prototype.degradation,
      };
      const routes: string[] = [];
      for (const handler of Object.values(handlers)) {
        const path: unknown = Reflect.getMetadata('path', handler);
        if (typeof path === 'string') {
          routes.push(path);
        }
      }

      expect(routes).toEqual(['cache', 'degradation']);
    });
  });

  describe('module hygiene', () => {
    it('has no provider declared twice', () => {
      // A duplicate class provider silently shadows itself in the Nest container; a
      // duplicate token provider does the same. Both are cheap to introduce and hard
      // to spot, so the declaration list is checked mechanically.
      const classProviders = providers.filter(
        (provider): provider is abstract new (...args: never[]) => unknown => typeof provider === 'function',
      );
      const tokenProviders = providers
        .filter((provider): provider is { provide: unknown } => typeof provider === 'object' && provider !== null)
        .map((provider) => provider.provide);

      expect(new Set(classProviders).size).toBe(classProviders.length);
      expect(new Set(tokenProviders).size).toBe(tokenProviders.length);
    });

    it('keeps the string REFLECTOR token the e2e suites override', () => {
      // `src/test/helpers/test-context.ts` and every `*.e2e-spec.ts` provide this exact
      // token. Removing it silently changes what those suites inject.
      const tokens = providers
        .filter((provider): provider is { provide: unknown } => typeof provider === 'object' && provider !== null)
        .map((provider) => provider.provide);

      expect(tokens).toContain('REFLECTOR');
    });

    it('still exposes the decorator metadata the guards read', () => {
      class Probe {
        @SetMetadata('probe', true)
        handler(): void {
          return undefined;
        }
      }

      expect(Reflect.getMetadata('probe', Probe.prototype.handler)).toBe(true);
    });
  });
});
