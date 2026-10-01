import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest';
import { generateKeyPairSync } from 'node:crypto';

import { AppleJwksService, type JwtHelper } from './jwt.util.ts';

/**
 * Tests for the JWKS cache itself, rather than for the token verification that consumes it.
 *
 * The verification specs inject a stubbed `AppleJwksService`, which is right for testing the
 * signature path and useless for testing the fetching. That left this class — the only code in
 * the platform that talks to a third party on a login request — with no coverage at all, while
 * its own test suite reported 43 passing cases.
 *
 * The behaviours that matter are the ones that would otherwise only be observed in production:
 * a refetch per request, a cache that never expires, one unimportable key taking down every
 * login, and an unexpected response shape being trusted.
 */
describe('AppleJwksService', () => {
  const originalFetch = globalThis.fetch;
  let keyPair: ReturnType<typeof generateKeyPairSync>;
  let logger: { debug: ReturnType<typeof vi.fn>; warn: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn> };

  const jwkFor = (kid: string): Record<string, unknown> => {
    const jwk = keyPair.publicKey.export({ format: 'jwk' }) as { n: string; e: string };
    return { kid, kty: 'RSA', use: 'sig', alg: 'RS256', n: jwk.n, e: jwk.e };
  };

  const respondWith = (body: unknown, ok = true, status = 200): void => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok,
        status,
        json: async (): Promise<unknown> => body,
      }),
    );
  };

  beforeEach(() => {
    keyPair = generateKeyPairSync('rsa', { modulusLength: 2048 });
    logger = { debug: vi.fn(), warn: vi.fn(), error: vi.fn() };
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    globalThis.fetch = originalFetch;
    vi.useRealTimers();
  });

  it('resolves a published key by its key id', async () => {
    respondWith({ keys: [jwkFor('apple-key-1')] });
    const service = new AppleJwksService(logger as never);

    const key = await service.resolveKey('apple-key-1');

    expect(key).not.toBeNull();
    expect(key?.asymmetricKeyType).toBe('rsa');
  });

  it('returns null for a key id Apple did not publish, so the signature is treated as unproved', async () => {
    respondWith({ keys: [jwkFor('apple-key-1')] });
    const service = new AppleJwksService(logger as never);

    // The distinction that matters: an unknown kid is NOT the same as a fetch failure. It is
    // either a token Apple did not sign or a rotation we have not seen, and either way the
    // login must be refused rather than verified against something.
    await expect(service.resolveKey('some-other-kid')).resolves.toBeNull();
  });

  it('fetches once and reuses the cache for subsequent lookups', async () => {
    respondWith({ keys: [jwkFor('apple-key-1')] });
    const service = new AppleJwksService(logger as never);

    await service.resolveKey('apple-key-1');
    await service.resolveKey('apple-key-1');
    await service.resolveKey('apple-key-1');

    // Without the cache this is three HTTPS round trips to Apple for one page load.
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(logger.debug).toHaveBeenCalledWith(expect.stringContaining('1 key'), 'AppleJwksService');
  });

  it('refetches once the cache has expired, so a key rotation is picked up', async () => {
    respondWith({ keys: [jwkFor('apple-key-1')] });
    const service = new AppleJwksService(logger as never);
    await service.resolveKey('apple-key-1');

    // Apple rotates its signing keys. A cache with no expiry would make every token signed
    // with the new key unverifiable until the process restarted.
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 7 * 60 * 60 * 1000);
    await service.resolveKey('apple-key-1');

    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  it('does not refetch just before the cache expires', async () => {
    respondWith({ keys: [jwkFor('apple-key-1')] });
    const service = new AppleJwksService(logger as never);
    await service.resolveKey('apple-key-1');

    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 5 * 60 * 60 * 1000);
    await service.resolveKey('apple-key-1');

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it('throws when the key set is empty, rather than caching an empty map', async () => {
    respondWith({ keys: [] });
    const service = new AppleJwksService(logger as never);

    // An empty set means every login fails. Failing loudly here is better than caching an
    // empty map and reporting "key not found" for every request until the TTL expires.
    await expect(service.resolveKey('apple-key-1')).rejects.toThrow(/no usable RSA signing key/);
  });

  it('skips one unusable entry instead of failing every login on it', async () => {
    // A rotation that published an entry we cannot import must not take the whole key set
    // down with it. This is the difference between one bad key and no logins.
    respondWith({ keys: [{ kid: 'bad', kty: 'RSA', n: 'not-base64url!!', e: 'AQAB' }, jwkFor('good')] });
    const service = new AppleJwksService(logger as never);

    await expect(service.resolveKey('good')).resolves.not.toBeNull();
  });

  it('ignores a non-RSA key', async () => {
    respondWith({ keys: [{ kid: 'ec', kty: 'EC', n: 'x', e: 'y' }, jwkFor('good')] });
    const service = new AppleJwksService(logger as never);

    await expect(service.resolveKey('ec')).resolves.toBeNull();
    await expect(service.resolveKey('good')).resolves.not.toBeNull();
  });

  it('ignores a key that declares an algorithm other than RS256', async () => {
    respondWith({ keys: [{ ...jwkFor('hs'), alg: 'HS256' }, jwkFor('good')] });
    const service = new AppleJwksService(logger as never);

    // Apple's tokens are RS256. A published entry claiming otherwise is either a mistake or
    // an attempt to get us to verify an HMAC against a public key, so it is not attempted.
    await expect(service.resolveKey('hs')).resolves.toBeNull();
    await expect(service.resolveKey('good')).resolves.not.toBeNull();
  });

  it('throws on a response with no keys array rather than trusting the shape', async () => {
    respondWith({ notKeys: [] });
    const service = new AppleJwksService(logger as never);

    await expect(service.resolveKey('apple-key-1')).rejects.toThrow(/did not contain a keys array/);
  });

  it('throws on a non-object body', async () => {
    respondWith('not json at all');
    const service = new AppleJwksService(logger as never);

    await expect(service.resolveKey('apple-key-1')).rejects.toThrow(/did not contain a keys array/);
  });

  it('throws on a non-ok response, naming the status', async () => {
    respondWith({}, false, 503);
    const service = new AppleJwksService(logger as never);

    await expect(service.resolveKey('apple-key-1')).rejects.toThrow(/failed with status 503/);
  });

  it('does not cache a failure, so the next login retries', async () => {
    // ONE mock, changing its answer between calls, so the call count is cumulative.
    // `respondWith` re-stubs the global, which would reset the count and make the assertion
    // vacuous.
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 500, json: async (): Promise<unknown> => ({}) })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async (): Promise<unknown> => ({ keys: [jwkFor('apple-key-1')] }),
      });
    vi.stubGlobal('fetch', fetchMock);

    const service = new AppleJwksService(logger as never);
    await expect(service.resolveKey('apple-key-1')).rejects.toThrow(/failed with status 500/);

    // A transient 500 from Apple must not be remembered as "there are no keys" for six hours,
    // or every login fails until the TTL expires or the process restarts.
    await expect(service.resolveKey('apple-key-1')).resolves.not.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
