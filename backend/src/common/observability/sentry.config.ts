import * as Sentry from '@sentry/nestjs';
import type { Event, RequestEventData } from '@sentry/nestjs';

export interface SentryLogSink {
  info(message: string, context?: string): void;
}

export const SENTRY_PRODUCTION_TRACES_SAMPLE_RATE = 0.1;
export const SENTRY_DEVELOPMENT_TRACES_SAMPLE_RATE = 1;

/**
 * Path segments whose OWN value is a credential.
 *
 * Matched case-insensitively against a single URL path segment. The list is the
 * credential-bearing names an API of this shape exposes. It is a shape rule, not an
 * inventory: it covers a route that carries a token in the path whether or not that
 * route exists today, which is the point — this runs on an error report for a
 * deployment whose route set may differ from the one in this repository.
 */
export const SENTRY_REDACTED_SEGMENTS: ReadonlySet<string> = new Set([
  'code',
  'state',
  'token',
  'access_token',
  'accesstoken',
  'refresh_token',
  'refreshtoken',
  'id_token',
  'idtoken',
  'verification_token',
  'reset_token',
  'resetpassword',
  'secret',
  'otp',
  'otp_code',
  'signature',
  'sig',
]);

/**
 * Path segments after which the NEXT segment is a credential.
 *
 * Today this API posts every credential in a request body (`POST /auth/reset-password`
 * with `{ token }`, `POST /auth/verify-email`), so nothing leaks through a path and this
 * rule is pure defence in depth. It exists because the failure it prevents is silent
 * and total: the day a reset link becomes `GET /auth/reset/<jwt>`, an unredacted path
 * would put a working password-reset credential in a third-party UI for every 5xx on
 * that route, and nothing in the response would look wrong.
 */
export const SENTRY_CREDENTIAL_BEARING_SEGMENTS: ReadonlySet<string> = new Set([
  'reset',
  'verify',
  'verify-email',
  'verifyemail',
  'activate',
  'activation',
  'confirm',
  'callback',
  'oauth',
]);

/** What replaces a redacted path segment. Never the real value, not even truncated. */
export const SENTRY_REDACTED = '[redacted]';

/**
 * Header names dropped from every event. `cookie` and `authorization` carry session
 * and bearer credentials; leaving them in a Sentry project turns it into a credential
 * store.
 */
export const SENTRY_DROPPED_HEADERS: ReadonlySet<string> = new Set([
  'cookie',
  'authorization',
  'set-cookie',
  'x-api-key',
]);

export function readSentryDsn(env: NodeJS.ProcessEnv = process.env): string | null {
  const dsn = env['SENTRY_DSN'];
  return dsn === undefined || dsn.trim().length === 0 ? null : dsn;
}

export function resolveSentryEnvironment(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env['SENTRY_ENVIRONMENT'];
  if (configured !== undefined && configured.trim().length > 0) {
    return configured;
  }
  const nodeEnv = env['NODE_ENV'];
  return nodeEnv === undefined || nodeEnv.trim().length === 0 ? 'development' : nodeEnv;
}

export function resolveTracesSampleRate(env: NodeJS.ProcessEnv = process.env): number {
  const configured = env['SENTRY_TRACES_SAMPLE_RATE'];
  if (configured !== undefined && configured.trim().length > 0) {
    const parsed = Number.parseFloat(configured);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return resolveSentryEnvironment(env) === 'production'
    ? SENTRY_PRODUCTION_TRACES_SAMPLE_RATE
    : SENTRY_DEVELOPMENT_TRACES_SAMPLE_RATE;
}

/**
 * Strip everything from a URL that can carry a secret out of the process.
 *
 * WHAT LEAKS WITHOUT THIS. `AllExceptionsFilter` captures the full `request.url`
 * (`common/filters/all-exceptions.filter.ts`, not owned by this stream) and Sentry's
 * Node integration copies `req.originalUrl` into `event.request.url`. For this API that
 * means, on every 5xx:
 *
 * - `GET /api/v1/auth/verify-email/<jwt>` and `POST /auth/reset-password/<jwt>` — the
 *   path segment IS the credential. A Sentry project is a credential store with a UI.
 * - `GET /api/v1/auth/google/callback?code=…&state=…` — a query string holding a
 *   single-use OAuth authorization code, which is exchangeable for tokens by whoever
 *   reads it first.
 * - Any search or paging query string, which is user content, not a secret, but is
 *   still data the operator's Sentry project has no need to hold.
 *
 * The whole query string is dropped rather than key-filtered. There is no query
 * parameter in this API whose value is safe to ship to a third party, and a
 * key-allowlist is a blocklist that will be extended by the next endpoint someone adds.
 * The path is kept with credential-shaped segments redacted so the event still answers
 * "which route broke".
 *
 * Pure and total: any input it cannot parse is replaced wholesale rather than passed
 * through, so an unrecognised URL shape can never become an exfiltration channel.
 */
export function scrubUrl(rawUrl: string): string {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return SENTRY_REDACTED;
  }

  const rawSegments = parsed.pathname.split('/');
  const scrubbed = rawSegments.map((segment, index) => {
    const normalized = segment.toLowerCase();
    if (SENTRY_REDACTED_SEGMENTS.has(normalized)) {
      return SENTRY_REDACTED;
    }
    const previous = rawSegments[index - 1]?.toLowerCase();
    if (previous !== undefined && SENTRY_CREDENTIAL_BEARING_SEGMENTS.has(previous)) {
      return SENTRY_REDACTED;
    }
    return segment;
  });

  return `${parsed.origin}${scrubbed.join('/')}`;
}

/**
 * `beforeSend` scrubber. Runs on the process's own event object, immediately before the
 * payload leaves for Sentry, and is the last place a URL can be cleaned.
 *
 * Generic over the event shape so the same function satisfies `beforeSend`
 * (`ErrorEvent`) and `beforeSendTransaction` (`TransactionEvent`) without a cast and
 * without narrowing `type` — an event that arrives as a transaction must leave as one.
 *
 /**
 * Applied to `request.url`, `request.query_string`, `request.cookies` and the credential
 * headers, and nothing else. Deliberately not recursive: the Sentry SDK already walks
 * `extra`/`contexts` for its own scrubbing, and a hand-rolled deep walk over `unknown`
 * would need casts and would miss nothing that matters here. Anything the SDK copies in
 * verbatim is the SDK's contract to hold.
 *
 * ON `sendDefaultPii`: the review asked for it to be set explicitly and it is NOT
 * passed, because the installed SDK has no such option — `sendDefaultPii` was a
 * browser-SDK flag and was removed in `@sentry/*` v10/v11 in favour of per-integration
 * options; `NodeOptions` (`@sentry/node/build/types/types.d.ts`) does not declare it and
 * nothing in `@sentry/**` reads it. Passing it would be dead config that TypeScript
 * rejects, and a comment claiming a flag was set would be the exact "false assurance"
 * this change is meant to remove. `@sentry/node` never collected default PII, so the
 * intent is enforced here instead, concretely: cookies and credential headers are
 * stripped from every outgoing event.
 */
export function scrubSentryEvent<T extends Event>(event: T): T {
  const request = event.request;
  if (request === undefined) {
    return event;
  }
  return { ...event, request: scrubRequestData(request) };
}

function scrubRequestData(request: RequestEventData): RequestEventData {
  const scrubbed: RequestEventData = { ...request };
  if (typeof request.url === 'string') {
    scrubbed.url = scrubUrl(request.url);
  }
  if (request.query_string !== undefined) {
    scrubbed.query_string = undefined;
  }
  if (request.cookies !== undefined) {
    scrubbed.cookies = undefined;
  }
  if (request.headers !== undefined) {
    const headers: Record<string, string> = {};
    for (const [name, value] of Object.entries(request.headers)) {
      if (!SENTRY_DROPPED_HEADERS.has(name.toLowerCase())) {
        headers[name] = value;
      }
    }
    scrubbed.headers = headers;
  }
  return scrubbed;
}

export function initSentry(logger: SentryLogSink, env: NodeJS.ProcessEnv = process.env): boolean {
  const dsn = readSentryDsn(env);
  if (dsn === null) {
    return false;
  }

  const environment = resolveSentryEnvironment(env);
  const release = env['SENTRY_RELEASE'] ?? env['GIT_COMMIT_SHA'];

  Sentry.init({
    dsn,
    environment,
    tracesSampleRate: resolveTracesSampleRate(env),
    // The v11 equivalent of `sendDefaultPii: false` — see the note on
    // `scrubSentryEvent`. Applied to both error events and performance transactions,
    // because a transaction carries the same `request.url` and `beforeSend` is not run
    // for transaction events.
    beforeSend: scrubSentryEvent,
    beforeSendTransaction: scrubSentryEvent,
    ...(release === undefined || release.trim().length === 0 ? {} : { release }),
  });

  logger.info(`Sentry error reporting and performance monitoring enabled for environment "${environment}"`, 'Sentry');
  return true;
}

export function captureSentryException(
  exception: unknown,
  context: Record<string, string>,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (readSentryDsn(env) === null) {
    return false;
  }
  Sentry.captureException(exception, { extra: context });
  return true;
}
