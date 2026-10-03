import { describe, it, expect } from 'vitest';

import { symbol } from './symbol.util.ts';

/**
 * A one-line helper with a one-line spec, plus the one property that surprised me.
 *
 * `Symbol(name)` allocates a NEW symbol on every call, so this is NOT a stable identity — two
 * calls with the same name return different symbols. That is correct for what it is actually
 * used for (a unique, greppable key in a map or a set), and it would be a bug if it were used
 * as a Nest injection token, because `@Inject(symbol('X'))` would resolve against a different
 * object on every call and nothing would ever be injectable.
 *
 * It has no caller in `src/` today. The test is here to record WHICH contract this has, so
 * the next person to reach for it as a DI token finds this rather than finding a runtime
 * resolution failure.
 */
describe('symbol', () => {
  it('returns a symbol', () => {
    expect(typeof symbol('TOKEN')).toBe('symbol');
  });

  it('returns a DIFFERENT symbol on each call, so it is not usable as an injection token', () => {
    expect(symbol('TOKEN')).not.toBe(symbol('TOKEN'));
  });

  it('returns different symbols for different names', () => {
    expect(symbol('A')).not.toBe(symbol('B'));
  });

  it('keeps the name for debugging, without exposing it as a string identity', () => {
    // The description is what shows up in a DI error message. A string key would collide
    // with any other string-keyed token in the same container.
    expect(symbol('TOKEN').description).toBe('TOKEN');
  });
});
