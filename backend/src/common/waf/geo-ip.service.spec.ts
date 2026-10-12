import { describe, it, expect, vi, beforeEach } from 'vitest';
import geoip from 'geoip-lite';

import { WinstonLoggerService } from '../services/winston-logger.service.ts';

import { GeoIpService } from './geo-ip.service.ts';

vi.mock('geoip-lite', () => ({
  default: {
    lookup: vi.fn(),
  },
}));

type MockWinstonLoggerService = {
  info: ReturnType<typeof vi.fn>;
  warn: ReturnType<typeof vi.fn>;
  log: ReturnType<typeof vi.fn>;
  error: ReturnType<typeof vi.fn>;
  debug: ReturnType<typeof vi.fn>;
  verbose: ReturnType<typeof vi.fn>;
};

const mockGeoip = geoip as unknown as { lookup: ReturnType<typeof vi.fn> };

describe('GeoIpService', () => {
  let logger: MockWinstonLoggerService;

  beforeEach(() => {
    vi.clearAllMocks();
    logger = {
      info: vi.fn(),
      warn: vi.fn(),
      log: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      verbose: vi.fn(),
    };
    mockGeoip.lookup.mockReturnValue(null);
  });

  describe('when disabled (no blocked countries)', () => {
    it('should log that GeoIP is disabled', () => {
      new GeoIpService(logger as unknown as WinstonLoggerService, []);
      expect(logger.info).toHaveBeenCalled();
    });

    it('should return null from lookupCountryCode when disabled', () => {
      const service = new GeoIpService(logger as unknown as WinstonLoggerService, []);
      expect(service.lookupCountryCode('8.8.8.8')).toBeNull();
    });

    it('should return false from isBlocked when disabled', () => {
      const service = new GeoIpService(logger as unknown as WinstonLoggerService, []);
      expect(service.isBlocked('8.8.8.8')).toBe(false);
    });

    it('should return empty array of blocked countries', () => {
      const service = new GeoIpService(logger as unknown as WinstonLoggerService, []);
      expect(service.getBlockedCountries()).toEqual([]);
    });
  });

  describe('when enabled with blocked countries', () => {
    it('should log enabled countries', () => {
      new GeoIpService(logger as unknown as WinstonLoggerService, ['US']);
      expect(logger.info).toHaveBeenCalled();
    });

    it('should lookup and return country code in uppercase', () => {
      mockGeoip.lookup.mockReturnValue({ country: 'us' });
      const service = new GeoIpService(logger as unknown as WinstonLoggerService, ['US']);
      expect(service.lookupCountryCode('8.8.8.8')).toBe('US');
    });

    it('should return null when geoip lookup returns null', () => {
      mockGeoip.lookup.mockReturnValue(null);
      const service = new GeoIpService(logger as unknown as WinstonLoggerService, ['US']);
      expect(service.lookupCountryCode('8.8.8.8')).toBeNull();
    });

    it('should return null when geoip lookup returns object without country', () => {
      mockGeoip.lookup.mockReturnValue({ region: 'CA' });
      const service = new GeoIpService(logger as unknown as WinstonLoggerService, ['US']);
      expect(service.lookupCountryCode('8.8.8.8')).toBeNull();
    });

    it('should handle lookup errors gracefully', () => {
      mockGeoip.lookup.mockImplementation(() => {
        throw new Error('lookup failed');
      });
      const service = new GeoIpService(logger as unknown as WinstonLoggerService, ['US']);
      expect(service.lookupCountryCode('8.8.8.8')).toBeNull();
      expect(logger.warn).toHaveBeenCalled();
    });

    it('should block IP from blocked country', () => {
      mockGeoip.lookup.mockReturnValue({ country: 'CN' });
      const service = new GeoIpService(logger as unknown as WinstonLoggerService, ['US', 'CN']);
      expect(service.isBlocked('1.2.3.4')).toBe(true);
    });

    it('should not block IP from non-blocked country', () => {
      mockGeoip.lookup.mockReturnValue({ country: 'GB' });
      const service = new GeoIpService(logger as unknown as WinstonLoggerService, ['US', 'CN']);
      expect(service.isBlocked('1.2.3.4')).toBe(false);
    });

    it('should fail-open when country cannot be determined', () => {
      mockGeoip.lookup.mockReturnValue(null);
      const service = new GeoIpService(logger as unknown as WinstonLoggerService, ['US']);
      expect(service.isBlocked('1.2.3.4')).toBe(false);
    });

    it('should return blocked countries in uppercase', () => {
      const service = new GeoIpService(logger as unknown as WinstonLoggerService, ['us', 'cn']);
      expect(service.getBlockedCountries()).toEqual(['US', 'CN']);
    });
  });

  describe('private IP handling', () => {
    it('should not lookup for private IPv4 addresses', () => {
      const service = new GeoIpService(logger as unknown as WinstonLoggerService, ['US']);
      mockGeoip.lookup.mockClear();
      service.lookupCountryCode('10.0.0.1');
      service.lookupCountryCode('192.168.1.1');
      service.lookupCountryCode('172.16.0.1');
      expect(mockGeoip.lookup).not.toHaveBeenCalled();
    });

    it('should not block private IPs even if from blocked country', () => {
      const service = new GeoIpService(logger as unknown as WinstonLoggerService, ['US']);
      expect(service.isBlocked('10.0.0.1')).toBe(false);
    });

    it('should not lookup for private IPv6 addresses', () => {
      const service = new GeoIpService(logger as unknown as WinstonLoggerService, ['US']);
      mockGeoip.lookup.mockClear();
      service.lookupCountryCode('fc00::1');
      service.lookupCountryCode('::1');
      expect(mockGeoip.lookup).not.toHaveBeenCalled();
    });

    it('should handle 172.17.0.1 (inside private range 16-31)', () => {
      mockGeoip.lookup.mockReturnValue({ country: 'US' });
      const service = new GeoIpService(logger as unknown as WinstonLoggerService, ['US']);
      expect(service.lookupCountryCode('172.17.0.1')).toBeNull();
    });

    // WHY THESE FOUR EXIST. `isPrivateIp` is a branch-per-range guard, and the per-path coverage
    // ratchet for `src/common/waf/**` (backend/vitest.config.ts, branches 94) is the difference
    // between the ranges the spec actually exercises and the ranges the code checks. The suite
    // covered the positive arm of 172.16/12, `127.`, `169.254.` and `fe80:` and never the
    // negative one, so a refactor that dropped a range — or widened 172.16/12 to the whole 172/8
    // — would have passed every existing test. Each case below pins one arm of one branch.
    it('should treat 172.200.0.1 as PUBLIC, because 16-31 is the whole 172.16/12 block', () => {
      mockGeoip.lookup.mockReturnValue({ country: 'US' });
      const service = new GeoIpService(logger as unknown as WinstonLoggerService, ['US']);
      mockGeoip.lookup.mockClear();

      expect(service.lookupCountryCode('172.200.0.1')).toBe('US');
      expect(mockGeoip.lookup).toHaveBeenCalledWith('172.200.0.1');
    });

    it('should treat 127.0.0.1 itself as private, not only 127.0.0.2+', () => {
      const service = new GeoIpService(logger as unknown as WinstonLoggerService, ['US']);
      mockGeoip.lookup.mockClear();

      expect(service.lookupCountryCode('127.0.0.1')).toBeNull();
      expect(mockGeoip.lookup).not.toHaveBeenCalled();
      // isBlocked must not consult GeoIP for it either: a loopback caller is never geo-blocked.
      expect(service.isBlocked('127.0.0.1')).toBe(false);
    });

    it('should treat 169.254.x (link-local) as private', () => {
      const service = new GeoIpService(logger as unknown as WinstonLoggerService, ['US']);
      mockGeoip.lookup.mockClear();

      expect(service.lookupCountryCode('169.254.1.1')).toBeNull();
      expect(service.isBlocked('169.254.1.1')).toBe(false);
      expect(mockGeoip.lookup).not.toHaveBeenCalled();
    });

    it('should treat fe80:: (IPv6 link-local) as private', () => {
      const service = new GeoIpService(logger as unknown as WinstonLoggerService, ['US']);
      mockGeoip.lookup.mockClear();

      expect(service.lookupCountryCode('fe80::1')).toBeNull();
      expect(service.isBlocked('fe80::1')).toBe(false);
      expect(mockGeoip.lookup).not.toHaveBeenCalled();
    });
  });
});
