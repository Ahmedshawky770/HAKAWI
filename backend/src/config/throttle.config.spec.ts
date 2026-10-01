import { describe, it, expect } from 'vitest';

import { THROTTLE_TIER_NAMES, THROTTLE_TIERS, buildThrottleConfig, isThrottleTierName } from './throttle.config.ts';

describe('buildThrottleConfig', () => {
  it('returns the documented per-tier limits when nothing is set', () => {
    const config = buildThrottleConfig({});

    expect(config.tiers.default.limit).toBe(30);
    expect(config.tiers.auth.limit).toBe(10);
    expect(config.tiers.upload.limit).toBe(5);
    expect(config.tiers.search.limit).toBe(50);
    expect(config.tiers.auth.tracker).toBe('ip');
  });

  it('applies per-tier overrides independently', () => {
    const config = buildThrottleConfig({
      THROTTLE_DEFAULT_LIMIT: '200',
      THROTTLE_AUTH_LIMIT: '3',
      THROTTLE_UPLOAD_LIMIT: '7',
      THROTTLE_SEARCH_LIMIT: '11',
      THROTTLE_AUTH_TTL: '30000',
    });

    expect(config.tiers.default.limit).toBe(200);
    expect(config.tiers.auth.limit).toBe(3);
    expect(config.tiers.auth.ttlMs).toBe(30_000);
    expect(config.tiers.upload.limit).toBe(7);
    expect(config.tiers.search.limit).toBe(11);
  });

  describe('THROTTLE_BLOCK_DURATION', () => {
    it('defaults to 0 and leaves every declared block window alone', () => {
      const config = buildThrottleConfig({});

      expect(config.defaultBlockDurationMs).toBe(0);
      expect(config.tiers.auth.blockDurationMs).toBe(THROTTLE_TIERS.auth.blockDurationMs);
      expect(config.tiers.upload.blockDurationMs).toBe(THROTTLE_TIERS.upload.blockDurationMs);
      expect(config.tiers.default.blockDurationMs).toBe(0);
      expect(config.tiers.search.blockDurationMs).toBe(0);
    });

    it('supplies the block window for tiers that do not declare one', () => {
      // The variable used to be parsed and then read by nothing, which is why
      // `blockDurationMs` was hardcoded per tier and the knob was decorative.
      const config = buildThrottleConfig({ THROTTLE_BLOCK_DURATION: '9000' });

      expect(config.tiers.default.blockDurationMs).toBe(9000);
      expect(config.tiers.search.blockDurationMs).toBe(9000);
    });

    it('never overrides a block window a tier declares for itself', () => {
      const config = buildThrottleConfig({ THROTTLE_BLOCK_DURATION: '9000' });

      expect(config.tiers.auth.blockDurationMs).toBe(60_000);
      expect(config.tiers.upload.blockDurationMs).toBe(60_000);
    });

    it('accepts an explicit 0', () => {
      const config = buildThrottleConfig({ THROTTLE_BLOCK_DURATION: '0' });

      expect(config.defaultBlockDurationMs).toBe(0);
      expect(config.tiers.default.blockDurationMs).toBe(0);
    });

    it('rejects a negative block duration', () => {
      expect(() => buildThrottleConfig({ THROTTLE_BLOCK_DURATION: '-1' })).toThrow();
    });
  });

  describe('the global escape hatch is opt-in only', () => {
    it('REFUSES THROTTLE_LIMIT without the acknowledgement and keeps the documented limits', () => {
      const config = buildThrottleConfig({ THROTTLE_LIMIT: '100000' });

      expect(config.globalOverrideApplied).toBe(false);
      expect(config.tiers.default.limit).toBe(30);
      expect(config.tiers.auth.limit).toBe(10);
      expect(config.tiers.upload.limit).toBe(5);
      expect(config.tiers.search.limit).toBe(50);
    });

    it('REFUSES THROTTLE_TTL without the acknowledgement', () => {
      const config = buildThrottleConfig({ THROTTLE_TTL: '1000' });

      expect(config.globalOverrideApplied).toBe(false);
      expect(config.tiers.default.ttlMs).toBe(60_000);
      expect(config.tiers.auth.ttlMs).toBe(60_000);
    });

    it('never lets the escape hatch win over a per-tier variable when refused', () => {
      const config = buildThrottleConfig({ THROTTLE_LIMIT: '100000', THROTTLE_AUTH_LIMIT: '3' });

      expect(config.tiers.auth.limit).toBe(3);
    });

    it('says out loud, in a warning a bootstrap can print, that it refused', () => {
      const config = buildThrottleConfig({ THROTTLE_LIMIT: '100000' });

      expect(config.globalOverrideWarnings).toHaveLength(1);
      const warning = config.globalOverrideWarnings[0] ?? '';
      expect(warning).toContain('REFUSED');
      expect(warning).toContain('THROTTLE_LIMIT');
      expect(warning).toContain('THROTTLE_ALLOW_GLOBAL_OVERRIDE=true');
    });

    it('refuses to boot in production rather than serving a rate-limit-free API', () => {
      expect(() => buildThrottleConfig({ NODE_ENV: 'production', THROTTLE_LIMIT: '100000' })).toThrow(
        /Refusing to start with NODE_ENV=production/,
      );
      expect(() => buildThrottleConfig({ NODE_ENV: 'production', THROTTLE_TTL: '1000' })).toThrow(/THROTTLE_TTL/);
    });

    it('still applies the escape hatch once it is acknowledged, and says so', () => {
      const config = buildThrottleConfig({ THROTTLE_LIMIT: '100000', THROTTLE_ALLOW_GLOBAL_OVERRIDE: 'true' });

      expect(config.globalOverrideApplied).toBe(true);
      expect(config.tiers.default.limit).toBe(100_000);
      expect(config.tiers.auth.limit).toBe(100_000);
      expect(config.tiers.upload.limit).toBe(100_000);
      expect(config.tiers.search.limit).toBe(100_000);
      expect(config.globalOverrideWarnings[0]).toContain('APPLIED');
    });

    it('accepts the acknowledgement in every documented truthy spelling', () => {
      for (const truthy of ['true', '1', 'yes', 'on', 'TRUE']) {
        expect(
          buildThrottleConfig({ THROTTLE_LIMIT: '100000', THROTTLE_ALLOW_GLOBAL_OVERRIDE: truthy })
            .globalOverrideApplied,
        ).toBe(true);
      }
    });

    it('keeps an explicitly falsy acknowledgement refused', () => {
      for (const falsy of ['false', '0', 'no', 'off']) {
        expect(
          buildThrottleConfig({ THROTTLE_LIMIT: '100000', THROTTLE_ALLOW_GLOBAL_OVERRIDE: falsy })
            .globalOverrideApplied,
        ).toBe(false);
      }
    });

    it('produces no warning at all on a clean configuration', () => {
      expect(buildThrottleConfig({}).globalOverrideWarnings).toEqual([]);
    });
  });

  it('preserves the tracker and the documentation reference on every tier', () => {
    const config = buildThrottleConfig({ THROTTLE_LIMIT: '100000', THROTTLE_ALLOW_GLOBAL_OVERRIDE: 'true' });

    for (const name of Object.keys(THROTTLE_TIERS) as (keyof typeof THROTTLE_TIERS)[]) {
      expect(config.tiers[name].tracker).toBe(THROTTLE_TIERS[name].tracker);
      expect(config.tiers[name].docRef).toBe(THROTTLE_TIERS[name].docRef);
    }
  });

  it('does not mutate the frozen tier catalogue', () => {
    buildThrottleConfig({ THROTTLE_LIMIT: '1', THROTTLE_ALLOW_GLOBAL_OVERRIDE: 'true', THROTTLE_BLOCK_DURATION: '1' });

    expect(THROTTLE_TIERS.default.limit).toBe(30);
    expect(THROTTLE_TIERS.default.blockDurationMs).toBe(0);
  });

  it('parses the trust proxy flag', () => {
    expect(buildThrottleConfig({ THROTTLE_TRUST_PROXY: 'true' }).trustProxy).toBe(true);
    expect(buildThrottleConfig({ THROTTLE_TRUST_PROXY: 'false' }).trustProxy).toBe(false);
    expect(buildThrottleConfig({}).trustProxy).toBe(false);
  });

  it('rejects a non-numeric limit', () => {
    expect(() => buildThrottleConfig({ THROTTLE_AUTH_LIMIT: 'many' })).toThrow();
  });
});

describe('isThrottleTierName', () => {
  it('accepts every declared tier', () => {
    for (const name of THROTTLE_TIER_NAMES) {
      expect(isThrottleTierName(name)).toBe(true);
    }
  });

  it('rejects anything else', () => {
    expect(isThrottleTierName('admin')).toBe(false);
    expect(isThrottleTierName('')).toBe(false);
  });
});
