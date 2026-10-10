import { Inject, Injectable, NestMiddleware, Optional } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

import { DEFAULT_WAF_CONFIG, type WafConfig, type WafOptInControl } from '../../config/waf.config.ts';
import { WinstonLoggerService } from '../services/winston-logger.service.ts';
import { DegradationTracker } from '../observability/degradation.ts';
import { IpBlocklistService, type BlockRecord } from '../waf/ip-blocklist.service.ts';
import { GeoIpService } from '../waf/geo-ip.service.ts';
import {
  buildWafViolationLog,
  generateCorrelationId,
  resolveCorrelationId,
  WAF_RESPONSE_HEADERS,
} from '../waf/headers.ts';
import {
  isSeverityAtLeast,
  matchesRuleValue,
  WAF_RULES,
  type WafRule,
  type WafSeverity,
  type WafTarget,
} from '../waf/rules.ts';

export const WAF_CONFIG = 'WAF_CONFIG';

export interface WafViolation {
  readonly ruleId: string;
  readonly ruleName: string;
  readonly layer: WafRule['layer'];
  readonly severity: WafSeverity;
  readonly target: WafTarget;
  readonly sample: string;
}

export interface WafDecision {
  readonly allowed: boolean;
  readonly status: number;
  readonly violations: readonly WafViolation[];
  readonly correlationId: string;
  readonly blockRecord: BlockRecord | null;
}

interface InspectableValue {
  readonly target: WafTarget;
  readonly value: string;
}

const MAX_INSPECTED_VALUES = 200;
const MAX_INSPECTED_LENGTH = 4096;
const MAX_BODY_DEPTH = 8;

const LOG_CONTEXT = 'WafMiddleware';

/**
 * What an attacker gains while the blocklist store is unreachable. `failMode: 'open'`
 * is the deliberate default — see `waf.config.ts` — so the only thing standing between
 * "Valkey is down" and "nobody is being blocked at all" is the noise this line makes.
 */
const BLOCKLIST_DEGRADED_SECURITY_IMPACT =
  'With WAF_FAIL_MODE=open no IP is blocked and no violation is recorded, so temporary and permanent ' +
  'IP blocks cannot be created or escalated while Valkey is unavailable.';

/**
 * Where a request's address came from, and how much it can be believed.
 *
 * Returned rather than a bare string so a caller can log or expose WHY an address is
 * what it is. Trusting an unverified forwarded header is not a cosmetic difference: it
 * is the difference between blocking the attacker and blocking whoever the attacker
 * names.
 */
export interface ClientIpResolution {
  readonly ip: string;
  readonly source: 'forwarded' | 'socket' | 'unknown';
  /** Whether a forwarded header was even eligible to be read. Mirrors `throttle.trustProxy`. */
  readonly trustProxy: boolean;
}

function clampString(value: string): string {
  return value.length > MAX_INSPECTED_LENGTH ? value.slice(0, MAX_INSPECTED_LENGTH) : value;
}

/**
 * How many bytes of body this request actually carried, when `Content-Length` cannot be trusted.
 *
 * `Transfer-Encoding: chunked` requests arrive with no `Content-Length` at all, so a rule that
 * reads only that header measures nothing. By the time the WAF runs, `express.json` /
 * `express.urlencoded` have already buffered the body, so the size is recoverable from what they
 * produced: the raw body captured by their `verify` hook, or failing that the serialised form of
 * the parsed object.
 *
 * This is a *detection* control, not a *prevention* control — the body is already in memory by
 * this point. The prevention control is `express.json({ limit })`, which aborts the stream before
 * buffering. See `requestSizeLimit` in `backend/src/main.ts` for the header-level fast reject.
 */
function measureBodyBytes(req: Request): number {
  const raw = (req as Request & { rawBody?: unknown }).rawBody;
  if (typeof raw === 'string') {
    return Buffer.byteLength(raw, 'utf8');
  }
  if (Buffer.isBuffer(raw)) {
    return raw.length;
  }
  const body = req.body as unknown;
  if (body === undefined || body === null) {
    return 0;
  }
  if (typeof body === 'string') {
    return Buffer.byteLength(body, 'utf8');
  }
  if (Buffer.isBuffer(body)) {
    return body.length;
  }
  try {
    return Buffer.byteLength(JSON.stringify(body), 'utf8');
  } catch {
    // A body that cannot be serialised (circular, BigInt) is not something the JSON parser
    // would have produced, so it is not counted here.
    return 0;
  }
}

function headerAsString(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  if (Array.isArray(value)) {
    const first: unknown = value[0];
    return typeof first === 'string' ? first : '';
  }
  return '';
}

/**
 * Upper bound on percent-decoding passes. Two passes leave `%25252e` (triple-encoded) intact,
 * so the iteration runs until the value stops changing and this cap is the only thing stopping
 * an attacker from sending a deeply-nested encoding to burn CPU here.
 */
const MAX_DECODE_PASSES = 8;

export function decodeForInspection(value: string): string {
  let decoded = value;
  for (let pass = 0; pass < MAX_DECODE_PASSES; pass += 1) {
    let next: string;
    try {
      next = decodeURIComponent(decoded);
    } catch {
      break;
    }
    if (next === decoded) {
      break;
    }
    decoded = next;
  }
  return decoded.replace(/\+/g, ' ');
}

function collectBodyStrings(value: unknown, depth: number, sink: string[]): void {
  if (sink.length >= MAX_INSPECTED_VALUES || depth > MAX_BODY_DEPTH) {
    return;
  }
  if (typeof value === 'string') {
    sink.push(clampString(value));
    return;
  }
  if (Array.isArray(value)) {
    if (value.length > 0) {
      sink.push(clampString(JSON.stringify(value)));
    }
    for (const entry of value) {
      collectBodyStrings(entry, depth + 1, sink);
      if (sink.length >= MAX_INSPECTED_VALUES) {
        return;
      }
    }
    return;
  }
  if (typeof value === 'object' && value !== null) {
    if (Object.keys(value).length > 0) {
      sink.push(clampString(JSON.stringify(value)));
    }
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      sink.push(clampString(key));
      collectBodyStrings(entry, depth + 1, sink);
      if (sink.length >= MAX_INSPECTED_VALUES) {
        return;
      }
    }
  }
}

function queryValuesOf(req: Request): string[] {
  const raw = req.query as unknown;
  if (typeof raw !== 'object' || raw === null) {
    return [];
  }
  const values: string[] = [];
  for (const [key, entry] of Object.entries(raw as Record<string, unknown>)) {
    values.push(clampString(key));
    if (Array.isArray(entry)) {
      for (const item of entry) {
        if (typeof item === 'string') {
          values.push(clampString(item));
        }
      }
    } else if (typeof entry === 'string') {
      values.push(clampString(entry));
    }
    if (values.length >= MAX_INSPECTED_VALUES) {
      break;
    }
  }
  return values;
}

function headerValuesOf(req: Request): string[] {
  const values: string[] = [];
  for (const [name, entry] of Object.entries(req.headers)) {
    values.push(name.toLowerCase());
    if (typeof entry === 'string') {
      values.push(clampString(entry));
    } else if (Array.isArray(entry)) {
      for (const item of entry) {
        if (typeof item === 'string') {
          values.push(clampString(item));
        }
      }
    }
    if (values.length >= MAX_INSPECTED_VALUES) {
      break;
    }
  }
  return values;
}

export function collectInspectableValues(req: Request): InspectableValue[] {
  const values: InspectableValue[] = [];

  const push = (target: WafTarget, raw: string): void => {
    if (values.length >= MAX_INSPECTED_VALUES) {
      return;
    }
    const normalized = decodeForInspection(raw);
    if (normalized.length === 0) {
      return;
    }
    values.push({ target, value: normalized });
  };

  const originalUrl = typeof req.originalUrl === 'string' && req.originalUrl.length > 0 ? req.originalUrl : req.url;
  if (typeof originalUrl === 'string' && originalUrl.length > 0) {
    push('url', originalUrl);
  }

  for (const value of queryValuesOf(req)) {
    push('query', value);
  }

  for (const value of headerValuesOf(req)) {
    push('header', value);
  }

  const bodyStrings: string[] = [];
  collectBodyStrings(req.body, 0, bodyStrings);
  for (const value of bodyStrings) {
    push('body', value);
  }

  return values;
}

@Injectable()
export class WafMiddleware implements NestMiddleware {
  private readonly config: WafConfig;
  private readonly disabledRuleIds: ReadonlySet<string>;
  private readonly enabledOptInControls: ReadonlySet<WafOptInControl>;
  private readonly blocklistDegradation: DegradationTracker;

  constructor(
    @Inject(WinstonLoggerService) private readonly logger: WinstonLoggerService,
    @Inject(IpBlocklistService) private readonly blocklist: IpBlocklistService,
    @Inject(GeoIpService) private readonly geoIp: GeoIpService,
    @Optional() @Inject(WAF_CONFIG) config: WafConfig | null,
  ) {
    this.config = config ?? DEFAULT_WAF_CONFIG;
    this.disabledRuleIds = new Set(this.config.disabledRules);
    this.enabledOptInControls = new Set(this.config.enabledOptInControls);
    this.blocklistDegradation = new DegradationTracker(this.logger, generateCorrelationId);
  }

  private isRuleActive(rule: WafRule): boolean {
    if (this.disabledRuleIds.has(rule.id.toUpperCase())) {
      return false;
    }
    // An opt-in rule is inert until its control is on, no matter what
    // `enabledByDefault` says. See `WafRuleBase.optInControl`.
    if (rule.optInControl !== undefined) {
      return this.enabledOptInControls.has(rule.optInControl);
    }
    return rule.enabledByDefault;
  }

  private evaluateNonPatternRules(req: Request): WafViolation[] {
    const violations: WafViolation[] = [];

    for (const rule of WAF_RULES) {
      if ((rule.kind !== 'allowed-methods' && rule.kind !== 'max-bytes' && rule.id !== 'geo-blocked-country') || !this.isRuleActive(rule)) {
        continue;
      }

      if (rule.kind === 'allowed-methods') {
        const method = (req.method ?? '').toUpperCase();
        const allowed = this.config.allowedMethods.length > 0 ? this.config.allowedMethods : rule.allowed;
        if (!allowed.includes(method)) {
          violations.push({
            ruleId: rule.id,
            ruleName: rule.name,
            layer: rule.layer,
            severity: rule.severity,
            target: 'url',
            sample: method,
          });
        }
        continue;
      }

      if (rule.id === 'geo-blocked-country') {
        // Geo-blocking is handled by GeoIpService, not by pattern matching
        const ip = resolveClientIp(req, this.config.trustProxy).ip;
        if (this.geoIp.isBlocked(ip)) {
          const countryCode = this.geoIp.lookupCountryCode(ip) ?? '??';
          violations.push({
            ruleId: rule.id,
            ruleName: rule.name,
            layer: rule.layer,
            severity: rule.severity,
            target: 'header',
            sample: `X-Forwarded-For: ${ip} (${countryCode})`,
          });
        }
        continue;
      }

      const contentLength = Number.parseInt(headerAsString(req.headers['content-length']), 10);
      // A chunked request carries no Content-Length, so trusting that header alone lets
      // "Transfer-Encoding: chunked" skip the limit entirely. The body has already been
      // buffered by the JSON/urlencoded parsers at this point, so the honest measurement is
      // the number of bytes actually received — Content-Length when it is present and sane,
      // and the real serialised size of the parsed body otherwise.
      const observedBytes = Number.isFinite(contentLength) && contentLength > 0 ? contentLength : measureBodyBytes(req);
      if (observedBytes === 0) {
        continue;
      }
      const maxBytes = rule.id === 'body-size-limit'
        ? this.config.maxRequestSizeBytes
        : (rule as import('../waf/rules.ts').WafMaxBytesRule).maxBytes;
      if (observedBytes > maxBytes) {
        violations.push({
          ruleId: rule.id,
          ruleName: rule.name,
          layer: rule.layer,
          severity: rule.severity,
          target: 'body',
          sample: String(observedBytes),
        });
      }
    }

    return violations;
  }

  evaluate(req: Request): WafViolation[] {
    const violations = this.evaluateNonPatternRules(req);
    const values = collectInspectableValues(req);

    for (const rule of WAF_RULES) {
      if (!this.isRuleActive(rule)) {
        continue;
      }
      if (rule.kind === 'allowed-methods' || rule.kind === 'max-bytes') {
        continue;
      }
      for (const candidate of values) {
        if (!rule.targets.includes(candidate.target)) {
          continue;
        }
        const matched =
          rule.kind === 'control-char' ? candidate.value.includes(rule.char) : matchesRuleValue(rule, candidate.value);
        if (matched) {
          violations.push({
            ruleId: rule.id,
            ruleName: rule.name,
            layer: rule.layer,
            severity: rule.severity,
            target: candidate.target,
            sample: candidate.value.slice(0, 120),
          });
          break;
        }
      }
    }

    return violations;
  }

  private async lookupBlock(req: Request, correlationId: string): Promise<BlockRecord | null> {
    try {
      const record = await this.blocklist.isBlocked(resolveClientIp(req, this.config.trustProxy).ip);
      this.blocklistDegradation.leave(LOG_CONTEXT, 'the Valkey-backed IP blocklist');
      return record;
    } catch (error) {
      this.blocklistDegradation.enter(
        LOG_CONTEXT,
        'blocklist lookup failed',
        BLOCKLIST_DEGRADED_SECURITY_IMPACT,
        error,
      );
      this.logger.error(
        `WAF blocklist lookup failed (${correlationId}): ${String(error)} failMode=${this.config.failMode}`,
        undefined,
        LOG_CONTEXT,
      );
      if (this.config.failMode === 'closed') {
        return {
          ip: resolveClientIp(req, this.config.trustProxy).ip,
          kind: 'temporary',
          reason: 'waf-fail-closed',
          ruleId: null,
          blockedAt: 0,
          expiresAt: null,
        };
      }
      return null;
    }
  }

  private async escalate(req: Request, violation: WafViolation, ip: string): Promise<void> {
    if (violation.severity === 'critical') {
      const blocked = await this.blocklist.block(ip, {
        kind: 'permanent',
        reason: `critical:${violation.ruleId}`,
        ruleId: violation.ruleId,
      });
      this.noteEscalationOutcome(blocked, ip, violation.ruleId);
      return;
    }

    const count = await this.blocklist.recordViolation(ip, this.config.violationWindowSeconds);
    // `recordViolation` can only return 0 when the Valkey command failed, never on a
    // successful INCR. A 0 here therefore means the violation counter did not move, so
    // the temporary/permanent thresholds below can never be reached for this caller.
    // Without this check the escalation ladder silently stops existing during an outage
    // and the attacker simply keeps going.
    this.noteEscalationOutcome(count > 0, ip, violation.ruleId);

    if (count >= this.config.violationsBeforePermanentBlock) {
      const blocked = await this.blocklist.block(ip, {
        kind: 'permanent',
        reason: `repeat-offender:${violation.ruleId}`,
        ruleId: violation.ruleId,
      });
      this.noteEscalationOutcome(blocked, ip, violation.ruleId);
      return;
    }
    if (count >= this.config.violationsBeforeTempBlock) {
      const blocked = await this.blocklist.block(ip, {
        kind: 'temporary',
        ttlSeconds: this.config.tempBlockSeconds,
        reason: `repeated-violations:${violation.ruleId}`,
        ruleId: violation.ruleId,
      });
      this.noteEscalationOutcome(blocked, ip, violation.ruleId);
    }
  }

  private noteEscalationOutcome(succeeded: boolean, ip: string, ruleId: string): void {
    if (succeeded) {
      return;
    }
    this.blocklistDegradation.enter(
      LOG_CONTEXT,
      `blocklist write failed for ip=${ip} rule=${ruleId}`,
      BLOCKLIST_DEGRADED_SECURITY_IMPACT,
    );
  }

  async decide(req: Request): Promise<WafDecision> {
    const correlationId = resolveCorrelationId(
      req.headers['x-request-id'] ?? req.headers['x-correlation-id'],
      generateCorrelationId,
    );
    const ip = resolveClientIp(req, this.config.trustProxy).ip;

    // WAF_ENABLED=false must mean the WAF is off, not "the WAF is off except for the
    // Valkey-backed blocklist". Consulted BEFORE lookupBlock so a disabled deployment also
    // stops paying a Valkey GET on every request and stops emitting a degradation warning
    // per request during an outage. An operator who wants the blocklist without rule
    // evaluation is not a state the two flags can currently express; WAF_ENABLED is the
    // single switch and it now switches everything.
    if (!this.config.enabled) {
      return { allowed: true, status: 200, violations: [], correlationId, blockRecord: null };
    }

    const blockRecord = await this.lookupBlock(req, correlationId);
    if (blockRecord !== null) {
      return { allowed: false, status: 403, violations: [], correlationId, blockRecord };
    }

    const violations = this.evaluate(req);
    if (violations.length === 0) {
      return { allowed: true, status: 200, violations: [], correlationId, blockRecord: null };
    }

    const blocking = violations.filter((violation) => isSeverityAtLeast(violation.severity, this.config.blockSeverity));
    const shouldBlock = this.config.blockOnViolation && blocking.length > 0;

    if (this.config.logViolations) {
      this.logger.warn(
        buildWafViolationLog(correlationId, {
          ip,
          method: req.method ?? 'UNKNOWN',
          path: typeof req.originalUrl === 'string' && req.originalUrl.length > 0 ? req.originalUrl : (req.url ?? ''),
          userAgent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : '',
          ruleIds: violations.map((violation) => violation.ruleId),
          severities: violations.map((violation) => violation.severity),
          action: shouldBlock ? 'blocked' : 'observed',
        }),
        LOG_CONTEXT,
      );
    }

    if (!shouldBlock) {
      return { allowed: true, status: 200, violations, correlationId, blockRecord: null };
    }

    for (const violation of blocking) {
      await this.escalate(req, violation, ip);
    }

    return { allowed: false, status: 403, violations, correlationId, blockRecord: null };
  }

  use(req: Request, res: Response, next: NextFunction): void {
    void this.handle(req, res, next);
  }

  private async handle(req: Request, res: Response, next: NextFunction): Promise<void> {
    let decision: WafDecision;
    try {
      decision = await this.decide(req);
    } catch (error) {
      this.logger.error(
        `WAF evaluation failed: ${String(error)} failMode=${this.config.failMode}`,
        undefined,
        LOG_CONTEXT,
      );
      if (this.config.failMode === 'closed') {
        res.status(503).json({ statusCode: 503, message: 'Service Unavailable', error: 'WAF evaluation failed' });
        return;
      }
      next();
      return;
    }

    res.setHeader(WAF_RESPONSE_HEADERS.requestId, decision.correlationId);

    if (decision.allowed) {
      next();
      return;
    }

    res.setHeader(WAF_RESPONSE_HEADERS.blocked, 'true');
    const primary = decision.violations.find((violation) =>
      isSeverityAtLeast(violation.severity, this.config.blockSeverity),
    );
    if (primary) {
      res.setHeader(WAF_RESPONSE_HEADERS.rule, primary.ruleId);
      res.setHeader(WAF_RESPONSE_HEADERS.severity, primary.severity);
    }

    if (decision.blockRecord !== null) {
      res.status(403).json({
        statusCode: 403,
        message: 'Forbidden',
        error: 'Source IP is blocked',
        reason: decision.blockRecord.reason,
      });
      return;
    }

    const oversized = decision.violations.find((violation) => violation.ruleId === 'body-size-limit');
    res.status(oversized ? 413 : 403).json({
      statusCode: oversized ? 413 : 403,
      message: oversized ? 'Payload too large' : 'Forbidden',
      error: 'Suspicious request blocked',
      correlationId: decision.correlationId,
    });
  }

  /**
   * Whether the IP blocklist store is reachable, and whether it has degraded at any
   * point since boot. Cheap: reports the last known state without probing Valkey.
   * Surfaced by `GET /api/v1/metrics/degradation` so a deployment can alert on the
   * signal as well as on the WARN line.
   */
  health(): { degraded: boolean; blocklist: { degraded: boolean } } {
    return {
      degraded: this.blocklistDegradation.isDegraded,
      blocklist: { degraded: this.blocklistDegradation.isDegraded },
    };
  }
}

/**
 * Resolve the client address, honouring the shared `trust proxy` decision.
 *
 * WHY THE GATE EXISTS. This used to be `req.ip ?? req.socket?.remoteAddress`, with no
 * condition. That is only safe while nothing calls `app.set('trust proxy', true)`:
 * Express then rewrites `req.ip` from `X-Forwarded-For`, a header ANY client can set, so
 * a single forged header would let an attacker walk straight through the blocklist —
 * pick a fresh `X-Forwarded-For` per request and never accumulate a violation, never be
 * blocked. The rate limiter already gated the same header behind
 * `throttle.trustProxy`; the WAF did not, so the two layers could disagree about who the
 * caller is. Both now read `THROTTLE_TRUST_PROXY` (see `waf.config.ts`).
 *
 * When `trustProxy` is false the socket address is the only thing that can be believed,
 * so a forged header is ignored no matter what Express computed for `req.ip`.
 */
export function resolveClientIp(req: Request, trustProxy: boolean): ClientIpResolution {
  if (trustProxy) {
    const forwarded = req.headers['x-forwarded-for'];
    const raw = Array.isArray(forwarded) ? forwarded[0] : forwarded;
    if (typeof raw === 'string') {
      const first = raw.split(',')[0]?.trim();
      if (first !== undefined && first.length > 0) {
        return { ip: first, source: 'forwarded', trustProxy: true };
      }
    }
  }

  const socketIp = req.ip ?? req.socket?.remoteAddress;
  if (typeof socketIp === 'string') {
    return { ip: socketIp, source: 'socket', trustProxy };
  }
  return { ip: 'unknown', source: 'unknown', trustProxy };
}

/**
 * Convenience wrapper for callers that only need the address. Defaults to NOT trusting
 * a forwarded header, so forgetting the flag fails closed rather than open.
 */
export function clientIpOf(req: Request, trustProxy = false): string {
  return resolveClientIp(req, trustProxy).ip;
}
