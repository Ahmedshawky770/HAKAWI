import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import type { Event } from '@sentry/nestjs';

import {
  captureSentryException,
  initSentry,
  readSentryDsn,
  resolveSentryEnvironment,
  resolveTracesSampleRate,
  scrubSentryEvent,
  scrubUrl,
  SENTRY_REDACTED,
} from './sentry.config.ts';
import type { SentryLogSink } from './sentry.config.ts';

/**
 * The SDK module is mocked so no network call is attempted and so the options handed to
 * `Sentry.init` can be inspected. The mocks are typed: an untyped `vi.fn()` makes every
 * read off `mock.calls` an `any`, which is exactly the hole the specs below guard.
 */
interface SentryMock {
  init: Mock<(options: Record<string, unknown>) => void>;
  captureException: Mock<(exception: unknown, context?: unknown) => void>;
}

const sentry = vi.hoisted(() => ({
  init: vi.fn<(options: Record<string, unknown>) => void>(),
  captureException: vi.fn<(exception: unknown, context?: unknown) => void>(),
})) as SentryMock;

vi.mock('@sentry/nestjs', () => sentry);

interface RecordingSentryLogger {
  readonly sink: SentryLogSink;
  readonly info: Mock<(message: string, context?: string) => void>;
}

function sentryLogger(): RecordingSentryLogger {
  const info = vi.fn<(message: string, context?: string) => void>();
  return { sink: { info }, info };
}

/**
 * The options the module handed to `Sentry.init` on the most recent call. Narrowed to a
 * record once here, rather than asserted through `expect.anything()` at each call site,
 * so "the option is absent" is a real check rather than a shape the matcher accepts.
 */
function initOptionsOf(mock: SentryMock): Record<string, unknown> {
  const options: unknown = mock.init.mock.calls[0]?.[0];
  return typeof options === 'object' && options !== null ? (options as Record<string, unknown>) : {};
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('readSentryDsn', () => {
  it('returns null when the DSN is absent', () => {
    expect(readSentryDsn({})).toBeNull();
  });

  it('returns null when the DSN is only whitespace', () => {
    expect(readSentryDsn({ SENTRY_DSN: '   ' })).toBeNull();
  });

  it('returns the configured DSN', () => {
    expect(readSentryDsn({ SENTRY_DSN: 'https://key@sentry.example/1' })).toBe('https://key@sentry.example/1');
  });
});

describe('resolveSentryEnvironment', () => {
  it('prefers SENTRY_ENVIRONMENT', () => {
    expect(resolveSentryEnvironment({ SENTRY_ENVIRONMENT: 'staging', NODE_ENV: 'production' })).toBe('staging');
  });

  it('falls back to NODE_ENV', () => {
    expect(resolveSentryEnvironment({ NODE_ENV: 'production' })).toBe('production');
  });

  it('falls back to development when neither is set', () => {
    expect(resolveSentryEnvironment({})).toBe('development');
  });
});

describe('resolveTracesSampleRate', () => {
  it('uses the configured rate when it parses', () => {
    expect(resolveTracesSampleRate({ SENTRY_TRACES_SAMPLE_RATE: '0.25' })).toBe(0.25);
  });

  it('ignores an unparseable configured rate', () => {
    expect(resolveTracesSampleRate({ SENTRY_TRACES_SAMPLE_RATE: 'often', NODE_ENV: 'production' })).toBe(0.1);
  });

  it('samples everything outside production', () => {
    expect(resolveTracesSampleRate({ NODE_ENV: 'development' })).toBe(1);
  });

  it('samples a tenth in production', () => {
    expect(resolveTracesSampleRate({ NODE_ENV: 'production' })).toBe(0.1);
  });
});

describe('initSentry', () => {
  it('does nothing without a DSN', () => {
    expect(initSentry(sentryLogger().sink, {})).toBe(false);
    expect(sentry.init).not.toHaveBeenCalled();
  });

  it('initialises the SDK with the documented options', () => {
    expect(
      initSentry(sentryLogger().sink, { SENTRY_DSN: 'https://key@sentry.example/1', SENTRY_ENVIRONMENT: 'staging' }),
    ).toBe(true);
    expect(sentry.init).toHaveBeenCalledWith(
      expect.objectContaining({
        dsn: 'https://key@sentry.example/1',
        environment: 'staging',
        tracesSampleRate: 1,
      }),
    );
  });

  it('reports the release when one is provided', () => {
    initSentry(sentryLogger().sink, { SENTRY_DSN: 'https://key@sentry.example/1', GIT_COMMIT_SHA: 'abc123' });
    expect(sentry.init).toHaveBeenCalledWith(expect.objectContaining({ release: 'abc123' }));
  });

  it('omits the release when none is provided', () => {
    initSentry(sentryLogger().sink, { SENTRY_DSN: 'https://key@sentry.example/1' });
    const options = initOptionsOf(sentry);
    expect('release' in options).toBe(false);
  });

  it('logs that reporting is enabled', () => {
    const logger = sentryLogger();
    initSentry(logger.sink, { SENTRY_DSN: 'https://key@sentry.example/1', SENTRY_ENVIRONMENT: 'production' });
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('production'), 'Sentry');
  });
});

describe('captureSentryException', () => {
  it('captures when a DSN is configured', () => {
    const error = new Error('boom');
    expect(
      captureSentryException(error, { method: 'GET', url: '/x' }, { SENTRY_DSN: 'https://key@sentry.example/1' }),
    ).toBe(true);
    expect(sentry.captureException).toHaveBeenCalledWith(error, { extra: { method: 'GET', url: '/x' } });
  });

  it('is a no-op without a DSN', () => {
    expect(captureSentryException(new Error('boom'), {}, {})).toBe(false);
    expect(sentry.captureException).not.toHaveBeenCalled();
  });
});

describe('scrubUrl', () => {
  it('drops the query string entirely', () => {
    // A single-use OAuth authorization code is exchangeable for tokens by whoever reads
    // it first, so no query parameter in this API is safe to ship to a third party.
    expect(scrubUrl('http://localhost:3001/api/v1/auth/google/callback?code=abc123&state=xyz')).toBe(
      'http://localhost:3001/api/v1/auth/google/callback',
    );
  });

  it('redacts a password reset token carried as a path segment', () => {
    expect(scrubUrl('http://localhost:3001/api/v1/auth/reset/eyJhbGciOi.super-secret.jwt')).toBe(
      `http://localhost:3001/api/v1/auth/reset/${SENTRY_REDACTED}`,
    );
  });

  it('redacts an email verification token carried as a path segment', () => {
    expect(scrubUrl('https://api.hakawi.test/api/v1/auth/verify-email/tok_123')).toBe(
      `https://api.hakawi.test/api/v1/auth/verify-email/${SENTRY_REDACTED}`,
    );
  });

  it.each(['code', 'state', 'token', 'access_token', 'refresh_token', 'otp', 'secret'])(
    'redacts a %s segment case-insensitively',
    (segment) => {
      expect(scrubUrl(`https://api.hakawi.test/x/${segment.toUpperCase()}/value`)).toBe(
        `https://api.hakawi.test/x/${SENTRY_REDACTED}/value`,
      );
    },
  );

  it('keeps the path so the event still answers which route broke', () => {
    expect(scrubUrl('http://localhost:3001/api/v1/stories/9f1c?page=2&limit=20')).toBe(
      'http://localhost:3001/api/v1/stories/9f1c',
    );
  });

  it('leaves an ordinary path untouched', () => {
    expect(scrubUrl('http://localhost:3001/api/v1/search?q=love')).toBe('http://localhost:3001/api/v1/search');
  });

  it('replaces an unparseable URL wholesale rather than passing it through', () => {
    expect(scrubUrl('/api/v1/auth/google/callback?code=abc')).toBe(SENTRY_REDACTED);
    expect(scrubUrl('not a url at all')).toBe(SENTRY_REDACTED);
  });

  it('never leaves a query string in the output, for any input', () => {
    for (const url of ['http://h/x?token=1', 'https://h/api/v1/auth/verify/tok?email=a@b.c', '/relative?code=1']) {
      expect(scrubUrl(url)).not.toContain('?');
    }
  });
});

describe('scrubSentryEvent', () => {
  it('scrubs the request URL and clears the query string field', () => {
    const event: Event = {
      request: {
        url: 'http://localhost:3001/api/v1/auth/reset/secret-token?next=/home',
        method: 'POST',
        query_string: 'next=/home',
      },
    };

    const scrubbed = scrubSentryEvent(event);

    expect(scrubbed.request?.url).toBe(`http://localhost:3001/api/v1/auth/reset/${SENTRY_REDACTED}`);
    expect(scrubbed.request?.query_string).toBeUndefined();
    expect(scrubbed.request?.method).toBe('POST');
  });

  it('strips cookies, which are session credentials', () => {
    const scrubbed = scrubSentryEvent({
      request: { url: 'http://h/x', cookies: { access_token: 'secret' } },
    });

    expect(scrubbed.request?.cookies).toBeUndefined();
  });

  it.each(['cookie', 'Cookie', 'authorization', 'Authorization', 'x-api-key'])('drops the %s header', (name) => {
    const scrubbed = scrubSentryEvent({
      request: { url: 'http://h/x', headers: { [name]: 'Bearer secret', accept: 'application/json' } },
    });

    expect(Object.keys(scrubbed.request?.headers ?? {})).toEqual(['accept']);
  });

  it('preserves every other field of the event', () => {
    const event: Event = {
      event_id: 'abc',
      level: 'error',
      tags: { component: 'CacheInterceptor' },
      extra: { note: 'kept' },
      request: { url: 'http://h/api/v1/stories?page=1' },
    };

    const scrubbed = scrubSentryEvent(event);

    expect(scrubbed.event_id).toBe('abc');
    expect(scrubbed.level).toBe('error');
    expect(scrubbed.tags).toEqual({ component: 'CacheInterceptor' });
    expect(scrubbed.extra).toEqual({ note: 'kept' });
  });

  it('does not mutate the event it was given', () => {
    const event: Event = { request: { url: 'http://h/api/v1/auth/reset/secret' } };

    scrubSentryEvent(event);

    expect(event.request?.url).toBe('http://h/api/v1/auth/reset/secret');
  });

  it('is a no-op for an event with no request at all', () => {
    const event: Event = { event_id: 'abc' };

    expect(scrubSentryEvent(event)).toEqual(event);
  });

  it('keeps a transaction event typed as a transaction', () => {
    const scrubbed = scrubSentryEvent({ type: 'transaction', request: { url: 'http://h/x?token=1' } });

    expect(scrubbed.type).toBe('transaction');
    expect(scrubbed.request?.url).toBe('http://h/x');
  });
});

describe('Sentry init scrubbing is wired, not merely available', () => {
  interface InitOptions {
    beforeSend?: (event: Event) => Event;
    beforeSendTransaction?: (event: Event) => Event;
  }

  function initOptions(env: NodeJS.ProcessEnv): InitOptions {
    initSentry(sentryLogger().sink, env);
    return initOptionsOf(sentry) as InitOptions;
  }

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('installs a beforeSend scrubber', () => {
    expect(initOptions({ SENTRY_DSN: 'https://key@sentry.example/1' }).beforeSend).toBe(scrubSentryEvent);
  });

  it('installs a beforeSendTransaction scrubber, because transactions carry the same URL', () => {
    expect(initOptions({ SENTRY_DSN: 'https://key@sentry.example/1' }).beforeSendTransaction).toBe(scrubSentryEvent);
  });

  it('scrubs an OAuth callback URL on the way out', () => {
    const scrub = initOptions({ SENTRY_DSN: 'https://key@sentry.example/1' }).beforeSend;
    if (scrub === undefined) {
      throw new Error('beforeSend must be installed');
    }

    const scrubbed = scrub({
      request: { url: 'http://localhost:3001/api/v1/auth/google/callback?code=leaked&state=leaked' },
    });

    expect(scrubbed.request?.url).toBe('http://localhost:3001/api/v1/auth/google/callback');
  });

  it('does not pass sendDefaultPii, an option this SDK version does not have', () => {
    // Verified: `sendDefaultPii` was a browser-SDK flag removed in @sentry/* v10/v11;
    // `NodeOptions` does not declare it and nothing in @sentry/** reads it. Passing it
    // would be dead config, and a comment claiming it was set would be the very false
    // assurance this change removes. The intent is enforced by the scrubbers above.
    initSentry(sentryLogger().sink, { SENTRY_DSN: 'https://key@sentry.example/1' });

    expect(Object.keys(initOptionsOf(sentry))).not.toContain('sendDefaultPii');
  });
});
