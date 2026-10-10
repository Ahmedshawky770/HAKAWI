import { describe, it, expect } from 'vitest';

import { WAF_OPT_IN_CONTROLS } from '../../config/waf.config.ts';

import {
  WAF_LAYERS,
  WAF_RULES,
  WAF_SEVERITY_RANK,
  WAF_SEVERITIES,
  WAF_TARGETS,
  getRuleById,
  isSeverityAtLeast,
  matchesRuleValue,
  type WafPatternRule,
} from './rules.ts';

const patternRules = WAF_RULES.filter((rule): rule is WafPatternRule => rule.kind === 'pattern');

/** Rules the operator has to switch on explicitly before they can fire. */
const optInRules = WAF_RULES.filter((rule) => rule.optInControl !== undefined);

describe('WAF rule catalogue integrity', () => {
  it('has unique rule ids', () => {
    const ids = WAF_RULES.map((rule) => rule.id);

    expect(new Set(ids).size).toBe(ids.length);
  });

  it('has unique rule names', () => {
    const names = WAF_RULES.map((rule) => rule.name);

    expect(new Set(names).size).toBe(names.length);
  });

  it('covers every documented layer', () => {
    const layers = new Set(WAF_RULES.map((rule) => rule.layer));

    for (const layer of WAF_LAYERS) {
      expect(layers.has(layer), `layer ${layer} must be represented`).toBe(true);
    }
  });

  it('covers every SQLi, NoSQLi, command and LDAP injection family', () => {
    const ids = WAF_RULES.map((rule) => rule.id);

    expect(ids.some((id) => id.startsWith('sql-'))).toBe(true);
    expect(ids.some((id) => id.startsWith('nosql-'))).toBe(true);
    expect(ids.some((id) => id.startsWith('command-'))).toBe(true);
    expect(ids.some((id) => id.startsWith('ldap-'))).toBe(true);
  });

  it('uses only declared severities and targets', () => {
    for (const rule of WAF_RULES) {
      expect(WAF_SEVERITIES).toContain(rule.severity);
      expect(rule.targets.length).toBeGreaterThan(0);
      for (const target of rule.targets) {
        expect(WAF_TARGETS).toContain(target);
      }
    }
  });

  it('documents every rule', () => {
    for (const rule of WAF_RULES) {
      expect(rule.description.length, `${rule.id} description`).toBeGreaterThan(20);
      expect(rule.name.length, `${rule.id} name`).toBeGreaterThan(0);
    }
  });

  it('explains why the old blanket pattern was removed', () => {
    const replacement = getRuleById('sql-comment-terminator');

    expect(replacement?.description).toContain('REPLACES the old blanket');
    expect(replacement?.targets).not.toContain('body');
  });

  it('never uses a stateful /g regex', () => {
    for (const rule of patternRules) {
      expect(rule.pattern.global, `${rule.id} must not use /g`).toBe(false);
    }
  });

  it('anchors the non-HTTP scheme rule so prose cannot trigger it', () => {
    const rule = getRuleById('ssrf-non-http-scheme');
    if (rule === undefined || rule.kind !== 'pattern') {
      throw new Error('ssrf-non-http-scheme must be a pattern rule');
    }

    expect(rule.pattern.source.startsWith('^')).toBe(true);
    expect(matchesRuleValue(rule, 'file:///etc/passwd')).toBe(true);
    expect(matchesRuleValue(rule, 'he kept a dictionary under his pillow')).toBe(false);
    expect(matchesRuleValue(rule, 'the dictionary of Arabic poetry')).toBe(false);
  });

  it('names only registered opt-in controls', () => {
    for (const rule of optInRules) {
      expect(WAF_OPT_IN_CONTROLS, `${rule.id} names an unregistered opt-in control`).toContain(rule.optInControl);
    }
  });

  it('marks exactly the forwarding-header and geo-blocking rules as opt-in', () => {
    // The forwarding-header rule cannot tell a header the ingress added from one a client forged,
    // so it has to be an operator decision rather than an unconditional 403.
    // The geo-blocking rule requires a GeoIP service which may not be available in all deployments.
    expect(optInRules.map((rule) => rule.id).sort()).toEqual(['geo-blocked-country', 'header-forbidden-forwarding-headers']);
    expect(getRuleById('header-forbidden-forwarding-headers')?.optInControl).toBe('blockForwardingHeaders');
    expect(getRuleById('geo-blocked-country')?.optInControl).toBe('geoBlocking');
  });

  it('explains why the forwarding-header rule is opt-in', () => {
    const rule = getRuleById('header-forbidden-forwarding-headers');

    expect(rule?.description).toContain('OPT-IN');
    expect(rule?.description).toContain('WAF_BLOCK_FORWARDING_HEADERS');
  });
});

describe('matchesRuleValue', () => {
  it('requires every co-occurrence signal when requiresAny is present', () => {
    const rule = getRuleById('sql-dml-statement');
    if (rule === undefined || rule.kind !== 'pattern') {
      throw new Error('sql-dml-statement must be a pattern rule');
    }

    expect(matchesRuleValue(rule, 'select a gift from the market')).toBe(false);
    expect(matchesRuleValue(rule, "' UNION ALL SELECT * FROM users --")).toBe(true);
  });

  it('matches when no co-occurrence signal is required', () => {
    const rule = getRuleById('sql-stacked-query');
    if (rule === undefined || rule.kind !== 'pattern') {
      throw new Error('sql-stacked-query must be a pattern rule');
    }

    expect(matchesRuleValue(rule, '1; DROP TABLE users')).toBe(true);
    expect(matchesRuleValue(rule, 'a sentence; with a semicolon')).toBe(false);
  });

  it('is stable across repeated evaluation', () => {
    const rule = getRuleById('sql-tautology');
    if (rule === undefined || rule.kind !== 'pattern') {
      throw new Error('sql-tautology must be a pattern rule');
    }

    for (let index = 0; index < 5; index += 1) {
      expect(matchesRuleValue(rule, "' OR '1'='1")).toBe(true);
    }
  });
});

describe('isSeverityAtLeast', () => {
  it('orders the severities', () => {
    expect(WAF_SEVERITY_RANK.low).toBeLessThan(WAF_SEVERITY_RANK.medium);
    expect(WAF_SEVERITY_RANK.medium).toBeLessThan(WAF_SEVERITY_RANK.high);
    expect(WAF_SEVERITY_RANK.high).toBeLessThan(WAF_SEVERITY_RANK.critical);
  });

  it.each([
    ['critical', 'high', true],
    ['high', 'high', true],
    ['medium', 'high', false],
    ['low', 'high', false],
    ['low', 'low', true],
    ['critical', 'low', true],
  ] as const)('%s at least %s is %s', (severity, minimum, expected) => {
    expect(isSeverityAtLeast(severity, minimum)).toBe(expected);
  });
});

describe('getRuleById', () => {
  it('finds an existing rule', () => {
    expect(getRuleById('xss-script-tag')?.layer).toBe('xss');
  });

  it('returns undefined for an unknown id', () => {
    expect(getRuleById('not-a-rule')).toBeUndefined();
  });
});
