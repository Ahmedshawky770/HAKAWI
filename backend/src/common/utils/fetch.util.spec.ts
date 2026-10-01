import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { z, type ZodType } from 'zod';

import * as fetchUtil from './fetch.util.ts';
import {
  DEFAULT_FETCH_TIMEOUT_MS,
  FetchParseError,
  FetchResponseError,
  FetchTimeoutError,
  FetchValidationError,
  fetchJson,
  isRetryableFetchError,
} from './fetch.util.ts';

type Equals<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Assert<T extends true> = T;
type FetchJsonFirstParameterIsUrl = Assert<Equals<Parameters<typeof fetchJson>[0], string>>;
type FetchJsonSchemaIsRequired = Assert<Equals<Parameters<typeof fetchJson>['length'], 2 | 3>>;

const UserSchema = z.object({ id: z.string(), name: z.string() });

function jsonResponse(body: string, init: { status?: number; statusText?: string } = {}): Response {
  return {
    ok: (init.status ?? 200) >= 200 && (init.status ?? 200) < 300,
    status: init.status ?? 200,
    statusText: init.statusText ?? 'OK',
    text: async () => body,
    json: async () => JSON.parse(body) as unknown,
  } as unknown as Response;
}

describe('fetchJson', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('success', () => {
    it('returns the parsed and validated payload', async () => {
      const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(JSON.stringify({ id: '1', name: 'Zayd' })));

      await expect(fetchJson('https://api.test/users/1', UserSchema, { fetchImpl })).resolves.toEqual({
        id: '1',
        name: 'Zayd',
      });
    });

    it('passes method, headers and body through to fetch', async () => {
      const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(JSON.stringify({ id: '1', name: 'Zayd' })));

      await fetchJson('https://api.test/users', UserSchema, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{"name":"Zayd"}',
        fetchImpl,
      });

      expect(fetchImpl).toHaveBeenCalledTimes(1);
      const call = fetchImpl.mock.calls[0] as [string, { method: string; body: string }];
      expect(call[0]).toBe('https://api.test/users');
      expect(call[1].method).toBe('POST');
      expect(call[1].body).toBe('{"name":"Zayd"}');
    });

    it('strips unknown keys through the Zod schema', async () => {
      const fetchImpl = vi
        .fn()
        .mockResolvedValue(jsonResponse(JSON.stringify({ id: '1', name: 'Zayd', secret: 'leak' })));

      const result = await fetchJson('https://api.test/users/1', UserSchema, { fetchImpl });

      expect(result).toEqual({ id: '1', name: 'Zayd' });
    });

    it('defaults to a GET request with the shared default timeout', async () => {
      const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(JSON.stringify({ id: '1', name: 'Zayd' })));

      await fetchJson('https://api.test/users/1', UserSchema, { fetchImpl });

      const call = fetchImpl.mock.calls[0] as [string, { method: string }];
      expect(call[1].method).toBe('GET');
      expect(DEFAULT_FETCH_TIMEOUT_MS).toBe(5000);
    });

    it('propagates the schema transformation', async () => {
      const NumericSchema = z.object({ count: z.coerce.number() });
      const fetchImpl = vi.fn().mockResolvedValue(jsonResponse('{"count":"7"}'));

      await expect(fetchJson('https://api.test/count', NumericSchema, { fetchImpl })).resolves.toEqual({ count: 7 });
    });
  });

  describe('non-2xx responses', () => {
    it('throws FetchResponseError with the status and a body preview', async () => {
      const fetchImpl = vi
        .fn()
        .mockResolvedValue(jsonResponse('{"error":"nope"}', { status: 404, statusText: 'Not Found' }));

      const error = await fetchJson('https://api.test/users/1', UserSchema, { fetchImpl }).catch(
        (caught: unknown) => caught,
      );

      expect(error).toBeInstanceOf(FetchResponseError);
      expect((error as FetchResponseError).status).toBe(404);
      expect((error as FetchResponseError).bodyPreview).toBe('{"error":"nope"}');
      expect((error as FetchResponseError).retryable).toBe(false);
    });

    it('marks 5xx as retryable', async () => {
      const fetchImpl = vi.fn().mockResolvedValue(jsonResponse('boom', { status: 503 }));

      const error = await fetchJson('https://api.test/x', UserSchema, { fetchImpl }).catch((caught: unknown) => caught);

      expect((error as FetchResponseError).retryable).toBe(true);
    });

    it.each([408, 425, 429, 500, 502, 503, 504])('marks HTTP %i as retryable', async (status) => {
      const fetchImpl = vi.fn().mockResolvedValue(jsonResponse('', { status }));

      const error = await fetchJson('https://api.test/x', UserSchema, { fetchImpl }).catch((caught: unknown) => caught);

      expect((error as FetchResponseError).retryable).toBe(true);
    });

    it('truncates a very large error body', async () => {
      const fetchImpl = vi.fn().mockResolvedValue(jsonResponse('x'.repeat(5000), { status: 500 }));

      const error = await fetchJson('https://api.test/x', UserSchema, { fetchImpl }).catch((caught: unknown) => caught);

      expect((error as FetchResponseError).bodyPreview).toHaveLength(512);
    });

    it('uses the operation name in the error message', async () => {
      const fetchImpl = vi.fn().mockResolvedValue(jsonResponse('', { status: 500 }));

      const error = await fetchJson('https://api.test/x', UserSchema, {
        fetchImpl,
        operation: 'paymob-charge',
      }).catch((caught: unknown) => caught);

      expect((error as Error).message).toContain('paymob-charge');
    });
  });

  describe('malformed bodies', () => {
    it('throws FetchParseError for invalid JSON', async () => {
      const fetchImpl = vi.fn().mockResolvedValue(jsonResponse('<html>oops</html>'));

      const error = await fetchJson('https://api.test/x', UserSchema, { fetchImpl }).catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(FetchParseError);
      expect((error as FetchParseError).retryable).toBe(true);
    });

    it('throws FetchValidationError when the payload does not match the schema', async () => {
      const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(JSON.stringify({ id: 1, name: 'Zayd' })));

      const error = await fetchJson('https://api.test/x', UserSchema, { fetchImpl }).catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(FetchValidationError);
      expect((error as FetchValidationError).retryable).toBe(false);
      expect((error as FetchValidationError).issues[0]).toContain('id');
    });

    it('throws FetchValidationError for an empty body', async () => {
      const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(''));

      const error = await fetchJson('https://api.test/x', UserSchema, { fetchImpl }).catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(FetchValidationError);
    });

    it('requires a schema', async () => {
      const checks: FetchJsonSchemaIsRequired = true;
      const fetchImpl = vi.fn();

      expect(checks).toBe(true);
      expect(fetchImpl).not.toHaveBeenCalled();
    });
  });

  describe('timeouts', () => {
    it('aborts the request and throws FetchTimeoutError', async () => {
      const fetchImpl = vi.fn().mockImplementation(
        (_url: string, init: { signal: AbortSignal }) =>
          new Promise((_resolve, reject) => {
            init.signal.addEventListener('abort', () => {
              reject(new DOMException('The operation was aborted.', 'AbortError'));
            });
          }),
      );

      const error = await fetchJson('https://api.test/slow', UserSchema, {
        fetchImpl,
        timeoutMs: 20,
        operation: 'sanity-query',
      }).catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(FetchTimeoutError);
      expect((error as FetchTimeoutError).timeoutMs).toBe(20);
      expect((error as FetchTimeoutError).retryable).toBe(true);
    });

    it('aborts when the caller supplies an already aborted signal', async () => {
      const controller = new AbortController();
      controller.abort();
      const fetchImpl = vi.fn().mockImplementation(
        (_url: string, init: { signal: AbortSignal }) =>
          new Promise((_resolve, reject) => {
            init.signal.addEventListener('abort', () => {
              reject(new DOMException('The operation was aborted.', 'AbortError'));
            });
          }),
      );

      await expect(
        fetchJson('https://api.test/slow', UserSchema, { fetchImpl, signal: controller.signal, timeoutMs: 5000 }),
      ).rejects.toBeInstanceOf(FetchTimeoutError);
    });

    it('rethrows a non-abort network error untouched', async () => {
      const fetchImpl = vi.fn().mockRejectedValue(new TypeError('network down'));

      await expect(fetchJson('https://api.test/x', UserSchema, { fetchImpl })).rejects.toBeInstanceOf(TypeError);
    });
  });

  describe('runtime guard', () => {
    it('fails loudly when no fetch implementation exists', async () => {
      vi.stubGlobal('fetch', undefined);

      await expect(fetchJson('https://api.test/x', UserSchema)).rejects.toThrow('No fetch implementation');
    });
  });

  describe('deprecated single argument form', () => {
    it('no longer exports the unvalidated call counter or the unvalidated parser', () => {
      const exports: Record<string, unknown> = { ...fetchUtil };

      expect(Object.keys(exports)).not.toContain('legacyUnvalidatedCallCount');
      expect(Object.keys(exports)).not.toContain('parseUnvalidated');
    });

    it('only ever accepts a URL and a required schema with an optional options bag', () => {
      const checks: [FetchJsonFirstParameterIsUrl, FetchJsonSchemaIsRequired] = [true, true];

      expect(checks).toEqual([true, true]);
    });

    it('validates a caller-supplied schema against the URL call it replaces', async () => {
      const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(JSON.stringify({ id: '1', name: 'Keeper' })));

      await expect(fetchJson('https://api.test/x', UserSchema, { fetchImpl })).resolves.toEqual({
        id: '1',
        name: 'Keeper',
      });
    });

    it('surfaces an unvalidated payload as a schema failure instead of trusting it', async () => {
      const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(JSON.stringify({ id: 1, extra: true })));

      const error = await fetchJson('https://api.test/x', UserSchema, { fetchImpl }).catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(FetchValidationError);
    });

    it('still surfaces HTTP failures', async () => {
      const fetchImpl = vi.fn().mockResolvedValue(jsonResponse('nope', { status: 500 }));

      await expect(fetchJson('https://api.test/x', UserSchema, { fetchImpl })).rejects.toBeInstanceOf(
        FetchResponseError,
      );
    });

    it('accepts a schema-typed ZodType and nothing else in the schema slot', () => {
      const schema: ZodType<{ id: string; name: string }> = UserSchema;

      expect(schema.parse({ id: '1', name: 'Keeper' })).toEqual({ id: '1', name: 'Keeper' });
    });
  });
});

describe('isRetryableFetchError', () => {
  it.each([
    [new FetchResponseError('op', 500, 'Server Error', ''), true],
    [new FetchResponseError('op', 404, 'Not Found', ''), false],
    [new FetchTimeoutError('op', 10), true],
    [new FetchParseError('op', 'bad'), true],
  ])('classifies %s as retryable=%s', (error, expected) => {
    expect(isRetryableFetchError(error)).toBe(expected);
  });

  it('classifies an unrelated error as not retryable', () => {
    expect(isRetryableFetchError(new Error('unknown'))).toBe(false);
    expect(isRetryableFetchError('string')).toBe(false);
    expect(isRetryableFetchError(null)).toBe(false);
  });
});
