export const RATE_LIMIT_HEADERS = {
  limit: 'X-RateLimit-Limit',
  remaining: 'X-RateLimit-Remaining',
  reset: 'X-RateLimit-Reset',
  retryAfter: 'Retry-After',
} as const;

export const WAF_RESPONSE_HEADERS = {
  requestId: 'X-Request-Id',
  blocked: 'X-Waf-Blocked',
  rule: 'X-Waf-Rule',
  severity: 'X-Waf-Severity',
} as const;

const CORRELATION_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

export function resolveCorrelationId(candidate: string | string[] | undefined, fallback: () => string): string {
  if (typeof candidate === 'string' && CORRELATION_ID_PATTERN.test(candidate)) {
    return candidate;
  }
  if (Array.isArray(candidate) && candidate.length > 0) {
    const first = candidate[0];
    if (typeof first === 'string' && CORRELATION_ID_PATTERN.test(first)) {
      return first;
    }
  }
  return fallback();
}

export function generateCorrelationId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function buildWafViolationLog(
  correlationId: string,
  fields: {
    readonly ip: string;
    readonly method: string;
    readonly path: string;
    readonly userAgent: string;
    readonly ruleIds: readonly string[];
    readonly severities: readonly string[];
    readonly action: 'blocked' | 'observed';
  },
): string {
  return JSON.stringify({
    level: 'warn',
    message: 'WAF violation detected',
    correlationId,
    ip: fields.ip,
    userAgent: fields.userAgent,
    path: fields.path,
    method: fields.method,
    violationTypes: fields.ruleIds,
    severities: fields.severities,
    action: fields.action,
  });
}
