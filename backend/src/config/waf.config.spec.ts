import { describe, it, expect } from 'vitest';

import { DEFAULT_WAF_CONFIG, WAF_OPT_IN_CONTROLS, buildWafConfig } from './waf.config.ts';

describe('buildWafConfig', () => {
  it('matches the documented defaults', () => {
    const config = buildWafConfig({});

    expect(config).toEqual(DEFAULT_WAF_CONFIG);
    expect(config.enabled).toBe(true);
    expect(config.blockOnViolation).toBe(true);
    expect(config.blockSeverity).toBe('high');
    expect(config.maxRequestSizeBytes).toBe(10 * 1024 * 1024);
    expect(config.allowedMethods).toEqual(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD']);
  });

  it('parses the boolean flags in every documented spelling', () => {
    for (const truthy of ['true', '1', 'yes', 'on', 'TRUE']) {
      expect(buildWafConfig({ WAF_ENABLED: truthy }).enabled).toBe(true);
    }
    for (const falsy of ['false', '0', 'no', 'off', 'FALSE']) {
      expect(buildWafConfig({ WAF_ENABLED: falsy }).enabled).toBe(false);
    }
  });

  it('parses the CSV lists and trims whitespace', () => {
    const config = buildWafConfig({
      WAF_DISABLED_RULES: ' xss-script-tag , sql-exec-eval ,, ',
      WAF_BLOCKED_COUNTRIES: 'US, CN',
    });

    expect(config.disabledRules).toEqual(['xss-script-tag', 'sql-exec-eval']);
    expect(config.reservedBlockedCountries).toEqual(['US', 'CN']);
  });

  it('normalises the allowed method list to upper case', () => {
    const config = buildWafConfig({ WAF_ALLOWED_METHODS: 'get, post ,PUT' });

    expect(config.allowedMethods).toEqual(['GET', 'POST', 'PUT']);
  });

  it('parses the block escalation thresholds', () => {
    const config = buildWafConfig({
      WAF_TEMP_BLOCK_SECONDS: '60',
      WAF_VIOLATION_WINDOW_SECONDS: '120',
      WAF_VIOLATIONS_BEFORE_TEMP_BLOCK: '2',
      WAF_VIOLATIONS_BEFORE_PERMANENT_BLOCK: '4',
    });

    expect(config.tempBlockSeconds).toBe(60);
    expect(config.violationWindowSeconds).toBe(120);
    expect(config.violationsBeforeTempBlock).toBe(2);
    expect(config.violationsBeforePermanentBlock).toBe(4);
  });

  it('rejects an unknown fail mode', () => {
    expect(() => buildWafConfig({ WAF_FAIL_MODE: 'maybe' })).toThrow();
  });

  it('rejects a non-positive request size', () => {
    expect(() => buildWafConfig({ WAF_MAX_REQUEST_SIZE: '0' })).toThrow();
    expect(() => buildWafConfig({ WAF_MAX_REQUEST_SIZE: 'not-a-number' })).toThrow();
  });

  it('is independent from the exported default object', () => {
    const config = buildWafConfig({ WAF_MAX_REQUEST_SIZE: '1024' });

    expect(config.maxRequestSizeBytes).toBe(1024);
    expect(DEFAULT_WAF_CONFIG.maxRequestSizeBytes).toBe(10 * 1024 * 1024);
  });

  describe('WAF_BLOCK_FORWARDING_HEADERS is opt-in', () => {
    it('is OFF by default so a proxied deployment is not bricked', () => {
      // Left on by default, this rule 403'd every request behind any reverse proxy and
      // walked the per-IP violation counter toward a temporary then a permanent block.
      const config = buildWafConfig({});

      expect(config.blockForwardingHeaders).toBe(false);
      expect(config.enabledOptInControls).toEqual([]);
    });

    it('turns the control on when the operator opts in', () => {
      const config = buildWafConfig({ WAF_BLOCK_FORWARDING_HEADERS: 'true' });

      expect(config.blockForwardingHeaders).toBe(true);
      expect(config.enabledOptInControls).toContain('blockForwardingHeaders');
    });

    it('accepts every documented truthy spelling', () => {
      for (const truthy of ['true', '1', 'yes', 'on', 'TRUE']) {
        expect(buildWafConfig({ WAF_BLOCK_FORWARDING_HEADERS: truthy }).blockForwardingHeaders).toBe(true);
      }
    });

    it('only ever enables controls that are declared in the registry', () => {
      const config = buildWafConfig({ WAF_BLOCK_FORWARDING_HEADERS: 'true' });

      for (const control of config.enabledOptInControls) {
        expect(WAF_OPT_IN_CONTROLS).toContain(control);
      }
    });
  });

  describe('THROTTLE_TRUST_PROXY is shared with the rate limiter', () => {
    it('is off by default', () => {
      expect(buildWafConfig({}).trustProxy).toBe(false);
    });

    it('is read from the one shared variable, not a second WAF_* flag', () => {
      // The WAF and the throttle tracker key blocklists and budgets on an address. If
      // they disagreed about whether a forwarded header is forgeable, one of the two
      // protections would be bypassable.
      expect(buildWafConfig({ THROTTLE_TRUST_PROXY: 'true' }).trustProxy).toBe(true);
    });

    it('is not confused by a WAF_TRUST_PROXY variable that does not exist', () => {
      const config = buildWafConfig({ WAF_TRUST_PROXY: 'true' } as NodeJS.ProcessEnv);

      expect(config.trustProxy).toBe(false);
    });
  });

  describe('WAF_BLOCKED_COUNTRIES is reserved, not a control', () => {
    it('still parses so an existing deployment setting is not silently dropped', () => {
      expect(buildWafConfig({ WAF_BLOCKED_COUNTRIES: 'RU, CN' }).reservedBlockedCountries).toEqual(['RU', 'CN']);
    });

    it('is named so it cannot be read as something that is enforced', () => {
      const config = buildWafConfig({ WAF_BLOCKED_COUNTRIES: 'RU' });

      expect(Object.keys(config)).not.toContain('blockedCountries');
      expect(config).not.toHaveProperty('blockCountries');
    });
  });
});
