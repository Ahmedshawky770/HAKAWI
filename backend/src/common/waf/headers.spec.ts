import { describe, it, expect } from 'vitest';

import {
  RATE_LIMIT_HEADERS,
  WAF_RESPONSE_HEADERS,
  buildWafViolationLog,
  generateCorrelationId,
  resolveCorrelationId,
} from './headers.ts';

describe('WAF response headers', () => {
  it('exposes the documented rate limit header names', () => {
    expect(RATE_LIMIT_HEADERS).toEqual({
      limit: 'X-RateLimit-Limit',
      remaining: 'X-RateLimit-Remaining',
      reset: 'X-RateLimit-Reset',
      retryAfter: 'Retry-After',
    });
  });

  it('exposes the WAF response header names', () => {
    expect(WAF_RESPONSE_HEADERS).toEqual({
      requestId: 'X-Request-Id',
      blocked: 'X-Waf-Blocked',
      rule: 'X-Waf-Rule',
      severity: 'X-Waf-Severity',
    });
  });
});

describe('resolveCorrelationId', () => {
  it('accepts a well formed inbound id', () => {
    expect(resolveCorrelationId('abc-123_XYZ', () => 'generated')).toBe('abc-123_XYZ');
  });

  it('accepts the first entry of an array header', () => {
    expect(resolveCorrelationId(['first', 'second'], () => 'generated')).toBe('first');
  });

  it('rejects an id containing spaces or punctuation', () => {
    expect(resolveCorrelationId('has spaces', () => 'generated')).toBe('generated');
    expect(resolveCorrelationId('semi;colon', () => 'generated')).toBe('generated');
  });

  it('rejects an empty id', () => {
    expect(resolveCorrelationId('', () => 'generated')).toBe('generated');
  });

  it('rejects an over-long id', () => {
    expect(resolveCorrelationId('a'.repeat(129), () => 'generated')).toBe('generated');
  });

  it('rejects an array whose first entry is not a usable id', () => {
    expect(resolveCorrelationId(['bad id', 'ok'], () => 'generated')).toBe('generated');
  });

  it('generates an id when the header is missing entirely', () => {
    expect(resolveCorrelationId(undefined, () => 'generated')).toBe('generated');
  });
});

describe('generateCorrelationId', () => {
  it('produces a distinct identifier each time', () => {
    const ids = new Set(Array.from({ length: 200 }, () => generateCorrelationId()));

    expect(ids.size).toBe(200);
  });

  it('produces an id that resolveCorrelationId accepts', () => {
    const generated = generateCorrelationId();

    expect(resolveCorrelationId(generated, () => 'other')).toBe(generated);
  });
});

describe('buildWafViolationLog', () => {
  const fields = {
    ip: '203.0.113.5',
    method: 'POST',
    path: '/api/v1/stories',
    userAgent: 'curl/8.4.0',
    ruleIds: ['sql-tautology'],
    severities: ['critical'],
    action: 'blocked' as const,
  };

  it('emits a parseable JSON record with every documented field', () => {
    const payload: unknown = JSON.parse(buildWafViolationLog('corr-1', fields));

    expect(payload).toEqual({
      level: 'warn',
      message: 'WAF violation detected',
      correlationId: 'corr-1',
      ip: '203.0.113.5',
      userAgent: 'curl/8.4.0',
      path: '/api/v1/stories',
      method: 'POST',
      violationTypes: ['sql-tautology'],
      severities: ['critical'],
      action: 'blocked',
    });
  });

  it('supports the observed action', () => {
    const payload: unknown = JSON.parse(buildWafViolationLog('corr-2', { ...fields, action: 'observed' }));

    expect(payload).toEqual(expect.objectContaining({ action: 'observed' }));
  });
});
