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
import { RestrictionGuard } from './guards/restriction.guard.ts';
import { SmtpEmailTransporter } from './email/smtp-email-transporter.ts';
import { TransactionalEmailService } from './email/transactional-email.service.ts';
import { EMAIL_TRANSPORTER } from './email/email-transporter.interface.ts';
import { AccountRestrictionService } from './services/account-restriction.service.ts';
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
      // Pinned because it was absent from both lists while six documents described it as live, and
      // because `SECURED_GUARDS` composes it — so a missing provider here would fail at runtime on
      // every `@Secured` route rather than at boot.
      ['RestrictionGuard', RestrictionGuard],
    ])('provides %s', (_name, guard) => {
      expect(providers).toContain(guard);
    });

    it.each([
      ['JwtAuthGuard', JwtAuthGuard],
      ['RolesGuard', RolesGuard],
      ['PermissionsGuard', PermissionsGuard],
      ['OwnershipGuard', OwnershipGuard],
      ['RestrictionGuard', RestrictionGuard],
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

  describe('the single email transport', () => {
    it.each([
      ['SmtpEmailTransporter', SmtpEmailTransporter],
      ['TransactionalEmailService', TransactionalEmailService],
    ])('provides and exports %s', (_name, provider) => {
      expect(providers).toContain(provider);
      expect(exports).toContain(provider);
    });

    it('binds the transporter behind EMAIL_TRANSPORTER as the same instance', () => {
      // `useExisting`, not a second `useClass`: two registrations would be two SMTP connections
      // with two independent pools, which is the second configuration this binding exists to prevent.
      const binding = providers.find(
        (provider): provider is { provide: unknown; useExisting: unknown } =>
          typeof provider === 'object' && provider !== null && 'provide' in provider && 'useExisting' in provider,
      );
      expect(binding?.provide).toBe(EMAIL_TRANSPORTER);
      expect(binding?.useExisting).toBe(SmtpEmailTransporter);

      expect(exports).toContain(EMAIL_TRANSPORTER);
    });

    it('exports the token so the auth and notifications email paths resolve the SAME instance', () => {
      // The token is what the consumers inject. Without the export, a global module's provider is
      // still not reachable from outside it, and the auth flows would either fail to boot or
      // reintroduce a transport of their own.
      expect(exports).toContain(EMAIL_TRANSPORTER);
    });
  });

  describe('the shared account restriction reader', () => {
    it('provides and exports AccountRestrictionService', () => {
      // `RestrictionGuard` and `AuthService` both inject it, so it must be resolvable from outside
      // this module. Without the export the graph fails at boot; without the export the auth flows
      // would read the restriction key a second time in their own words.
      expect(providers).toContain(AccountRestrictionService);
      expect(exports).toContain(AccountRestrictionService);
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
