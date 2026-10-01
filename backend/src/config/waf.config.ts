import { registerAs } from '@nestjs/config';
import { z } from 'zod';

const booleanFlag = z
  .union([z.boolean(), z.string()])
  .transform((value) =>
    typeof value === 'boolean' ? value : ['true', '1', 'yes', 'on'].includes(value.toLowerCase()),
  );

const csvList = z
  .string()
  .default('')
  .transform((value) =>
    value
      .split(',')
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0),
  );

/**
 * Controls that a rule needs an explicit operator decision before it can fire.
 *
 * A rule marked with one of these is INERT by default even though it exists in
 * `WAF_RULES`. Registering a control here, rather than special-casing rule ids inside
 * the middleware, keeps the rule catalogue declarative and lets a new opt-in rule be
 * added without touching evaluation logic (Principle #8).
 */
export const WAF_OPT_IN_CONTROLS = ['blockForwardingHeaders'] as const;

export type WafOptInControl = (typeof WAF_OPT_IN_CONTROLS)[number];

const envSchema = z.object({
  WAF_ENABLED: booleanFlag.default(true),
  WAF_LOG_VIOLATIONS: booleanFlag.default(true),
  WAF_BLOCK_ON_VIOLATION: booleanFlag.default(true),
  WAF_FAIL_MODE: z.enum(['open', 'closed']).default('open'),
  WAF_BLOCK_SEVERITY: z.enum(['low', 'medium', 'high', 'critical']).default('high'),
  WAF_DISABLED_RULES: csvList,
  WAF_MAX_REQUEST_SIZE: z.coerce
    .number()
    .int()
    .positive()
    .default(10 * 1024 * 1024),
  WAF_ALLOWED_METHODS: z.string().default('GET,POST,PUT,PATCH,DELETE,OPTIONS,HEAD'),
  WAF_TEMP_BLOCK_SECONDS: z.coerce.number().int().positive().default(3600),
  WAF_VIOLATION_WINDOW_SECONDS: z.coerce.number().int().positive().default(900),
  WAF_VIOLATIONS_BEFORE_TEMP_BLOCK: z.coerce.number().int().positive().default(5),
  WAF_VIOLATIONS_BEFORE_PERMANENT_BLOCK: z.coerce.number().int().positive().default(25),
  /**
   * RESERVED — PARSED, NOT ENFORCED. Geo-blocking is not implemented: there is no
   * GeoIP source, no per-rule country matching, and no code path reads this list. The
   * value is kept so an existing deployment setting it is not silently dropped, and it
   * is named `reserved*` so no operator can mistake it for a control that is on.
   * Setting it has no effect on any request. Removing it is a separate decision because
   * `backend/.env.example` and the deployment docs document the variable.
   */
  WAF_BLOCKED_COUNTRIES: csvList,
  /**
   * Opt-in for the `header-forbidden-forwarding-headers` rule, OFF by default.
   *
   * WHY IT CANNOT BE ON BY DEFAULT. The rule rejects any request carrying
   * `X-Forwarded-Host`, `X-Original-URL`, `X-Rewrite-URL`, `X-Originating-IP`,
   * `X-Custom-IP-Authorization` or `X-Forwarded-Server`. Those headers are exactly what
   * a reverse proxy or load balancer emits, and the WAF cannot tell a header the ingress
   * added from one a client forged. With `WAF_BLOCK_SEVERITY=high` (the default) and this
   * rule at `enabledByDefault: true`, deploying behind ANY proxy 403'd every single
   * request and incremented the per-IP violation counter toward a temporary and then a
   * permanent block — the deployment locked itself out. The intent is sound; the
   * distinction it needs (trusted ingress vs public client) is not available at this
   * layer, so it becomes an operator decision.
   *
   * ENABLE IT ONLY when the application is reachable directly, or when the ingress
   * STRIPS these headers from the client before forwarding. Behind a proxy that forwards
   * them, leave it off.
   */
  WAF_BLOCK_FORWARDING_HEADERS: booleanFlag.default(false),
  /**
   * SHARED WITH THE RATE LIMITER, DELIBERATELY. This is `THROTTLE_TRUST_PROXY`, not a
   * second `WAF_*` variable, because the WAF and the throttle tracker must agree on
   * whether `X-Forwarded-For` is attacker-controllable. If the limiter trusted the
   * header and the WAF did not, a forged header would buy an attacker a fresh rate-limit
   * bucket while the WAF blocked on the real address; if the reverse, a single NAT
   * would share one WAF block. One flag, one meaning, one source of truth
   * (Principle #9). `app.set('trust proxy', …)` is deliberately NOT called anywhere:
   * the two consumers read the header themselves under this flag, so a future change
   * there cannot silently make `X-Forwarded-For` attacker-controlled.
   */
  THROTTLE_TRUST_PROXY: booleanFlag.default(false),
});

export type WafFailMode = 'open' | 'closed';
export type WafBlockSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface WafConfig {
  readonly enabled: boolean;
  readonly logViolations: boolean;
  readonly blockOnViolation: boolean;
  readonly failMode: WafFailMode;
  readonly blockSeverity: WafBlockSeverity;
  readonly disabledRules: readonly string[];
  readonly maxRequestSizeBytes: number;
  readonly allowedMethods: readonly string[];
  readonly tempBlockSeconds: number;
  readonly violationWindowSeconds: number;
  readonly violationsBeforeTempBlock: number;
  readonly violationsBeforePermanentBlock: number;
  /**
   * Which opt-in controls the operator has turned on. A rule that declares
   * `optInControl` fires only while its control appears here.
   */
  readonly enabledOptInControls: readonly WafOptInControl[];
  /**
   * RESERVED, NOT ENFORCED — see `WAF_BLOCKED_COUNTRIES` above. Kept so a setting is
   * never silently discarded, named so it cannot be read as an active control.
   */
  readonly reservedBlockedCountries: readonly string[];
  readonly blockForwardingHeaders: boolean;
  /** Shared with the rate limiter; see `THROTTLE_TRUST_PROXY` above. */
  readonly trustProxy: boolean;
}

export const DEFAULT_WAF_CONFIG: WafConfig = {
  enabled: true,
  logViolations: true,
  blockOnViolation: true,
  failMode: 'open',
  blockSeverity: 'high',
  disabledRules: [],
  maxRequestSizeBytes: 10 * 1024 * 1024,
  allowedMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'],
  tempBlockSeconds: 3600,
  violationWindowSeconds: 900,
  violationsBeforeTempBlock: 5,
  violationsBeforePermanentBlock: 25,
  enabledOptInControls: [],
  reservedBlockedCountries: [],
  blockForwardingHeaders: false,
  trustProxy: false,
};

export function buildWafConfig(source: NodeJS.ProcessEnv): WafConfig {
  const env = envSchema.parse(source);
  const blockForwardingHeaders = env.WAF_BLOCK_FORWARDING_HEADERS;
  return {
    enabled: env.WAF_ENABLED,
    logViolations: env.WAF_LOG_VIOLATIONS,
    blockOnViolation: env.WAF_BLOCK_ON_VIOLATION,
    failMode: env.WAF_FAIL_MODE,
    blockSeverity: env.WAF_BLOCK_SEVERITY,
    disabledRules: env.WAF_DISABLED_RULES,
    maxRequestSizeBytes: env.WAF_MAX_REQUEST_SIZE,
    allowedMethods: env.WAF_ALLOWED_METHODS.split(',')
      .map((method) => method.trim().toUpperCase())
      .filter((method) => method.length > 0),
    tempBlockSeconds: env.WAF_TEMP_BLOCK_SECONDS,
    violationWindowSeconds: env.WAF_VIOLATION_WINDOW_SECONDS,
    violationsBeforeTempBlock: env.WAF_VIOLATIONS_BEFORE_TEMP_BLOCK,
    violationsBeforePermanentBlock: env.WAF_VIOLATIONS_BEFORE_PERMANENT_BLOCK,
    enabledOptInControls: blockForwardingHeaders ? ['blockForwardingHeaders'] : [],
    reservedBlockedCountries: env.WAF_BLOCKED_COUNTRIES,
    blockForwardingHeaders,
    trustProxy: env.THROTTLE_TRUST_PROXY,
  };
}

export default registerAs('waf', () => buildWafConfig(process.env));
