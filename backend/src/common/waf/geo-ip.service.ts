import { Injectable, Inject, Optional } from '@nestjs/common';
import geoip from 'geoip-lite';

import { WinstonLoggerService } from '../services/winston-logger.service.ts';

const LOG_CONTEXT = 'GeoIpService';

/**
 * GeoIP lookup service.
 *
 * WHY A SEPARATE SERVICE. The WAF middleware evaluates rules on every request.
 * Coupling GeoIP lookup directly into the middleware would:
 *   1. Make the middleware untestable without a GeoIP database
 *   2. Mix concerns (rule evaluation vs IP geolocation)
 *   3. Violate Principle #7 (Module Boundaries) — the WAF module shouldn't own GeoIP logic
 *
 * WHY geoip-lite. It bundles a MaxMind GeoLite2 database, requires no external files,
 * and is fast enough for per-request lookup (~50k lookups/second). For higher accuracy
 * or larger databases, swap this service for `@maxmind/geoip2-node` with a downloaded
 * MaxMind DB — the interface stays the same.
 */
@Injectable()
export class GeoIpService {
  private readonly enabled: boolean;

  constructor(
    @Inject(WinstonLoggerService) private readonly logger: WinstonLoggerService,
    @Optional() private readonly blockedCountries: string[] = [],
  ) {
    this.enabled = blockedCountries.length > 0;
    if (this.enabled) {
      this.logger.info(
        `GeoIP blocking enabled for countries: ${blockedCountries.join(', ')}`,
        LOG_CONTEXT,
      );
    } else {
      this.logger.info('GeoIP blocking disabled (no countries configured)', LOG_CONTEXT);
    }
  }

  /**
   * Look up the ISO 3166-1 alpha-2 country code for an IP address.
   *
   * Returns the uppercase country code (e.g., 'US', 'CN', 'RU') or null if:
   *   - GeoIP blocking is disabled
   *   - The IP is private/internal (10.x, 192.168.x, etc.)
   *   - The IP is not in the database
   *   - The lookup fails
   */
  lookupCountryCode(ip: string): string | null {
    if (!this.enabled) {
      return null;
    }

    // Skip private/internal IPs - they have no meaningful country
    if (this.isPrivateIp(ip)) {
      return null;
    }

    try {
      const lookup = geoip.lookup(ip);
      if (!lookup || !lookup.country) {
        return null;
      }
      return lookup.country.toUpperCase();
    } catch (error) {
      this.logger.warn(
        `GeoIP lookup failed for ${ip}: ${String(error)}`,
        LOG_CONTEXT,
      );
      return null;
    }
  }

  /**
   * Check if an IP's country is in the blocked list.
   *
   * Returns true if the IP should be blocked (country matches blocked list).
   * Returns false if:
   *   - GeoIP blocking is disabled
   *   - The IP is private/internal
   *   - The IP's country is not in the blocked list
   *   - The lookup fails (fail-open for GeoIP errors)
   */
  isBlocked(ip: string): boolean {
    if (!this.enabled) {
      return false;
    }

    const countryCode = this.lookupCountryCode(ip);
    if (!countryCode) {
      // Fail-open: if we can't determine the country, don't block
      return false;
    }

    return this.blockedCountries.includes(countryCode);
  }

  /**
   * Get the list of configured blocked countries (uppercase).
   */
  getBlockedCountries(): readonly string[] {
    return this.blockedCountries.map((c) => c.toUpperCase());
  }

  /**
   * Check if an IP is private/internal (RFC 1918, RFC 4193, etc.).
   * Private IPs have no meaningful country and should never be blocked by GeoIP.
   */
  private isPrivateIp(ip: string): boolean {
    // IPv4 private ranges
    if (ip.startsWith('10.')) return true;
    if (ip.startsWith('192.168.')) return true;
    if (ip.startsWith('172.')) {
      const secondOctet = parseInt(ip.split('.')[1], 10);
      if (!isNaN(secondOctet) && secondOctet >= 16 && secondOctet <= 31) {
        return true;
      }
    }
    // Loopback
    if (ip === '127.0.0.1' || ip.startsWith('127.')) return true;
    // Link-local
    if (ip.startsWith('169.254.')) return true;

    // IPv6 private ranges
    if (ip.startsWith('fc00:') || ip.startsWith('fd00:')) return true; // ULA
    if (ip === '::1') return true; // Loopback
    if (ip.startsWith('fe80:')) return true; // Link-local

    return false;
  }
}