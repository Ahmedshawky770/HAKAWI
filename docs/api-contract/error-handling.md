# Error Handling & Error Codes
## Hakawi - Error Response Standards

Status markers: ✅ implemented · ⚠️ partial · ⛔ not implemented.

The single implementation is **`backend/src/common/filters/all-exceptions.filter.ts`**, registered
globally in `backend/src/main.ts:83-84`. There is one `@Catch()` filter and it handles everything.

---

## Error Response Format

All errors follow this standard format, produced by `AllExceptionsFilter.catch()`
(`backend/src/common/filters/all-exceptions.filter.ts:44-51`):

```json
{
  "error": "Unauthorized",
  "message": "Invalid refresh token",
  "details": [],
  "statusCode": 401,
  "timestamp": "2026-09-19T10:00:00.000Z",
  "path": "/api/v1/auth/refresh",
  "correlationId": "abc123xyz"
}
```

### Fields

| Field | Type | Description | Source |
|-------|------|-------------|--------|
| `error` | string | Machine-readable error code | `exceptionResponse.error`, else the literal `INTERNAL_ERROR` |
| `message` | string | Human-readable error message | `exceptionResponse.message`, else `'Internal server error'` |
| `details` | array | Field-level errors; **always `[]` today** | `exceptionResponse.details` |
| `statusCode` | number | HTTP status code | `exception.getStatus()` |
| `timestamp` | string | ISO 8601 timestamp | `new Date().toISOString()` |
| `path` | string | Request path | `request.url` |
| `correlationId` | string \| undefined | Inbound `x-correlation-id` header | `request.headers['x-correlation-id']` |

### ⛔ The `error` field does not carry the documented codes

The filter defaults `errorCode` to `'INTERNAL_ERROR'` and only replaces it from
`exceptionResponse.error`. **No exception anywhere in `backend/src` sets that field** — a grep for
`error: '[A-Z_]+'` returns zero hits outside the filter itself.

The practical result: `error` carries **Nest's default reason phrase** (`"Bad Request"`,
`"Unauthorized"`, `"Forbidden"`, `"Not Found"`, `"Internal Server Error"`), not a stable
application-level code. Two hand-written exceptions pass a structured body
(`backend/src/common/guards/restriction.guard.ts:24` is one), but they do not set `error` either.

**Consequence for clients:** do not branch on `error`. Branch on `statusCode` and treat `message` as
human-facing prose. Migrating to real codes means either custom exception classes (⛔ none exist)
or a code registry mapped from the exception class — both are open work.

---

## Error Codes — ⛔ NOT IMPLEMENTED

The 14 machine-readable codes this document previously mandated **do not exist in the codebase**.
They are listed below as a **retained requirement**, not a description of the API.

### 4xx Client Errors — ⛔ all unimplemented

| Required Code | HTTP Status | Description | Status |
|---|---|---|---|
| `VALIDATION_ERROR` | 400 | Invalid input data | ⛔ The `ValidationPipe` returns Nest's `{ statusCode, message: string[], error: 'Bad Request' }`; `message` is an **array**, not a string, and `details` is never populated |
| `UNAUTHORIZED` | 401 | Authentication required | ⛔ emitted as `"Unauthorized"` |
| `FORBIDDEN` | 403 | Insufficient permissions | ⛔ emitted as `"Forbidden"` |
| `NOT_FOUND` | 404 | Resource doesn't exist | ⛔ emitted as `"Not Found"` |
| `CONFLICT` | 409 | Resource already exists | ⛔ no `ConflictException` is thrown anywhere; uniqueness violations surface as a 500 from the database driver |
| `RATE_LIMIT_EXCEEDED` | 429 | Rate limit exceeded | ⛔ **Bypasses the filter entirely.** The throttler guard writes its own 429 body; it does not go through `AllExceptionsFilter` |
| `INVALID_CREDENTIALS` | 401 | Wrong email/password | ⛔ login throws a bare `UnauthorizedException('Invalid credentials')` |
| `TOKEN_EXPIRED` | 401 | Token has expired | ⚠️ the **status** is right (401) but the **code** does not exist. `JwtAuthGuard` catches the library's `TokenExpiredError` and rethrows `UnauthorizedException('Invalid or expired token')` (`backend/src/common/guards/jwt-auth.guard.ts:35-42`), so an expired and a malformed token are indistinguishable |
| `SESSION_REVOKED` | 401 | Session was revoked | ⚠️ the *message* `"Refresh token has been revoked"` is real; there is no code |
| `MFA_REQUIRED` | 403 | MFA code needed | ⛔ there is no MFA |

### 5xx Server Errors — ⛔ all unimplemented as codes

| Required Code | HTTP Status | Description | Status |
|---|---|---|---|
| `INTERNAL_ERROR` | 500 | Server error | ✅ **the only real code** — the filter's own default (`backend/src/common/filters/all-exceptions.filter.ts:20`) |
| `DATABASE_ERROR` | 500 | Database operation failed | ⛔ a `pg` error is an `Error`, so it is logged and Sentry-captured, then returned as `INTERNAL_ERROR` |
| `EXTERNAL_SERVICE_ERROR` | 502 | External service failed | ⛔ the Paymob client throws `ServiceUnavailableException` (503), not 502 |
| `SERVICE_UNAVAILABLE` | 503 | Service temporarily unavailable | ⚠️ a 503 **status** is real (Paymob failure path); the **code** is `"Service Unavailable"` |

### ⚠️ Two real behaviours that the code table does not describe

1. **Expired and malformed tokens are indistinguishable.** `JwtAuthGuard` wraps verification in a
   bare `catch` and rethrows `UnauthorizedException('Invalid or expired token')`
   (`backend/src/common/guards/jwt-auth.guard.ts:35-42`). A client cannot tell "refresh me" from
   "log in again", which is exactly the distinction `TOKEN_EXPIRED` existed to make.
2. **Unhandled errors leak their message.** For a plain `Error`, the filter sets
   `message = exception.message` (`:37`) and returns it to the client. A raw database constraint
   message or an internal path can therefore reach the browser. It *is* logged to winston and
   forwarded to Sentry, so it is diagnosable — but it is not redacted.

---

## Error Details — ⛔ `details` is always empty

`details` is read from `exceptionResponse.details` (`:29`). **Nothing in the codebase populates
that field**, so it is always `[]`. The field is in the contract and reserved for a custom
exception layer that has not been written.

### Validation errors — ⚠️ shape mismatch

The `ValidationPipe` is configured with `whitelist: true`, `forbidNonWhitelisted: true` and
`transform: true` (`backend/src/main.ts:101-110`). On failure Nest returns:

```json
{
  "statusCode": 400,
  "message": ["email must be an email", "password must be longer than or equal to 8 characters"],
  "error": "Bad Request"
}
```

which the filter reshapes to:

```json
{
  "error": "Bad Request",
  "message": ["email must be an email", "password must be longer than or equal to 8 characters"],
  "details": [],
  "statusCode": 400,
  "timestamp": "…",
  "path": "/api/v1/auth/register",
  "correlationId": "…"
}
```

⚠️ **`message` is an array here but a string everywhere else.** The declared contract types it as
`string`. A client doing `error.message` gets an array.

The documented `details: [{ field, message, value }]` structure is **not** produced.

### Rate limit errors — ⚠️ different body entirely

The throttler guard writes its own response and does not pass through `AllExceptionsFilter`. Its
`Retry-After` header is real; the `{ error: "RATE_LIMIT_EXCEEDED" }` body is not.

### Conflict errors — ⛔

No `ConflictException` exists, so the documented `{ error: "CONFLICT", … }` body is never produced.

---

## Error Handling in NestJS

### Global Exception Filter — ✅ real

The real filter, abbreviated; see `backend/src/common/filters/all-exceptions.filter.ts`:

```typescript
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const request = host.switchToHttp().getRequest<Request>();
    const response = host.switchToHttp().getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let errorCode = 'INTERNAL_ERROR';
    let details: unknown[] = [];

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === 'string') {
        message = body;
      } else if (typeof body === 'object' && body !== null) {
        message = (body as { message?: string }).message || message;
        errorCode = (body as { error?: string }).error || errorCode;
        details = (body as { details?: unknown[] }).details || [];
      }
    } else if (exception instanceof Error) {
      message = exception.message;                      // ⚠️ leaks internals
      this.winstonLogger.error(`Unhandled exception: ${message}`, exception.stack, 'AllExceptionsFilter');
      captureSentryException(exception, { method: request.method, url: request.url });
    }

    response.status(status).json({
      error: errorCode,
      message,
      details,
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      correlationId: request.headers['x-correlation-id'] || undefined,
    });
  }
}
```

Unrecognised exceptions fall through to `500 / INTERNAL_ERROR`, are logged to winston at `error`
level, and are forwarded to Sentry.

### Custom Exceptions — ⛔ NONE EXIST

The three classes this document previously specified — `ValidationException`, `ConflictException`,
`RateLimitExceededException` — **do not exist in this repository.** `find backend/src -name
'*.exception.ts'` returns nothing, and there is no `common/exceptions/` directory. The whole
`backend/src/common/` tree contains exactly one filter and no exception classes.

**Retained requirement.** The intended shape:

```typescript
export class ValidationException extends BadRequestException {
  constructor(details: ValidationError[]) {
    super({ error: 'VALIDATION_ERROR', message: 'Invalid input data', details, statusCode: 400 });
  }
}
```

### ⛔ Zod schemas silently skipped by the global `ValidationPipe`

A bug class that shaped the real error contract: several files under `dto/` were **Zod schemas, not
classes**. `tsc` emits `Object` as the `design:paramtypes` metatype for a type alias, so the global
`ValidationPipe` found no class to validate and **skipped it silently** — the endpoint accepted
completely unvalidated input. Confirmed in `moderation/dto/report.dto.ts`,
`moderation/dto/admin-dashboard.dto.ts`, `moderation/dto/moderation-action.dto.ts` and
`search/types.ts` (where `SearchFilters` was a bare type alias, so `GET /search` echoed `page` and
`limit` back as raw strings).

**Fixed, by two different routes:**

- **search** — replaced the type alias with a real `SearchFiltersDto` **class** using
  `class-validator` (`backend/src/modules/search/dto/search.dto.ts`), so the global pipe validates it
  again. Pinned by `search.dto.spec.ts`, which calls `validate()` directly.
- **upload** — `upload/dto/upload-response.dto.ts` is now a real decorated class, and
  `GenerateUploadUrlDto` is a class the controller binds.
- **moderation** — the Zod schemas were kept (they are richer than decorators can express) and are
  now **parsed explicitly at the service boundary** with
  `parseOrThrow(schema, value)` (`backend/src/modules/shared/validation/zod-validation.util.ts:24`).
  It calls `safeParse` and rethrows as a `BadRequestException` with a formatted issue list, so a
  Zod failure is a 400 with a useful message instead of a silent pass-through.

⚠️ The lesson is not recorded in code. A schema that is not a class is invisible to the pipe, and
nothing will warn you.

---

## Error Handling in Frontend — ✅ real

`frontend/src/lib/api.ts` parses every response with a Zod schema from
`frontend/src/lib/schemas.ts` (~50 exported schemas), so a malformed server payload is rejected at
the boundary rather than rendered. There are **no blind `as` casts** in `api.ts`.

`readErrorMessage` handles both shapes the server produces: a `string` message and a `string[]`
message (the `ValidationPipe` array), so a field-validation failure is no longer flattened to
"An error occurred".

`components/ui/ErrorMessage.tsx` renders the error. It is one of five hand-written components in
`frontend/src/components/ui/` (`Button`, `Card`, `ErrorMessage`, `Input`, `Loading`); Shadcn and
Radix are **not** installed.

The `useApi()` hook shown in the previous version of this document **does not exist** in the
frontend; there is no such hook.

---

## Correlation IDs — ✅ real, with a gap

- **Generated:** `generateCorrelationId()` in `backend/src/common/waf/headers.ts:28` — a
  base36 timestamp + 8 random characters, **not** a UUIDv4.
- **Accepted from the client:** `resolveCorrelationId()` honours an inbound `X-Correlation-Id`
  header when it matches `^[A-Za-z0-9_-]{1,128}$`.
- **Echoed on the error body:** `AllExceptionsFilter` copies `x-correlation-id` into
  `correlationId`.
- **Echoed on WAF responses:** `X-Request-Id`.

⚠️ `correlationId` is `undefined` for any request that does not send the header, and
`JSON.stringify` **drops** the key. The declared contract types it as a required `string`; it is
optional in practice.

---

## Retry Strategy

### ResilientHttpClient — ✅ real

The hand-written `processWithRetry` snippet this document previously showed **does not exist**. The
real implementation is `backend/src/common/resilience/resilient-http.client.ts`, wired with the
`CircuitBreakerService`, `RetryService`, `TimeoutService` and `FallbackService` from
`backend/src/common/resilience/`. It is what `PaymobClient` calls.

Retry and circuit-breaker defaults are environment-tunable:

| Variable | Default |
|---|---|
| `RETRY_MAX_RETRIES` | 3 |
| `RETRY_INITIAL_DELAY_MS` | 1000 |
| `RETRY_MAX_DELAY_MS` | 10000 |
| `RETRY_BACKOFF_MULTIPLIER` | 2 |
| `RETRY_JITTER_MS` | 500 |
| `CIRCUIT_BREAKER_FAILURE_THRESHOLD` | 5 |
| `CIRCUIT_BREAKER_RECOVERY_TIMEOUT_MS` | 30000 |
| `CIRCUIT_BREAKER_SUCCESS_THRESHOLD` | 3 |
| `CIRCUIT_BREAKER_MONITORING_PERIOD_MS` | 60000 |
| `DEFAULT_OPERATION_TIMEOUT_MS` | — |

### Retryable / non-retryable
The client retries on transport failures and 5xx / 429 from the upstream. A 4xx from Paymob is
surfaced immediately. The Paymob path additionally caches its auth token in Valkey (3000s,
clamped below Paymob's 3600s token lifetime) and fails cleanly — **503, with the local payment row
marked `failed`** — rather than fabricating a checkout URL.

---

## Alerting — ⛔ NOT IMPLEMENTED

- ⛔ 5xx-rate alerting: no metrics pipeline, no alert rules
- ⛔ 4xx-rate alerting: same
- ⛔ Payment-error alerting: same
- ⛔ `this.metrics.increment(...)` — **there is no `this.metrics` in the codebase**

### What is observable
- ✅ Sentry receives every unhandled (non-`HttpException`) error, with `{ method, url }` context
- ✅ Winston logs every response as `${method} ${url} - ${status} - ${message}`
- ✅ `GET /api/v1/metrics/cache` exposes cache hits/misses/hit rate
- ⛔ There is no error-rate metric endpoint

---

## Best Practices

1. **Never expose internal errors to users** — ⚠️ *partially followed*: the filter returns
   `exception.message` for plain `Error`s, so internals can leak. Logged and Sentry-captured, but
   not redacted.
2. **Always include correlationId** — ⚠️ only when the client sends the header
3. **Use specific error codes** — ⛔ not implemented
4. **Log all errors** — ✅ every response is logged; unhandled errors go to winston + Sentry
5. **Fail closed** — ✅ in the guards; ⚠️ the throttler storage fails *open* by design
6. **Retry with backoff** — ✅ in `ResilientHttpClient`
7. **Don't retry on client errors** — ✅ upstream 4xx is surfaced immediately

---

## Changelog — reconciliation (2026-09-30)

| Previous claim | Reality | Evidence |
|---|---|---|
| 14 machine-readable error codes | ⛔ **Zero exist.** The `error` field carries Nest's reason phrase; only `INTERNAL_ERROR` is a literal | `backend/src/common/filters/all-exceptions.filter.ts:20`; zero `error: '[A-Z_]+'` hits in `backend/src` |
| 3 custom exception classes | ⛔ **None exist.** No `*.exception.ts`, no `common/exceptions/` | `find backend/src -name '*.exception.ts'` → empty |
| `details: [{ field, message, value }]` | ⛔ `details` is **always `[]`** — nothing populates `exceptionResponse.details` | `backend/src/common/filters/all-exceptions.filter.ts:29` |
| Global filter named `GlobalExceptionFilter` | Named `AllExceptionsFilter` | `backend/src/common/filters/all-exceptions.filter.ts:8` |
| `CorrelationIdMiddleware` with `uuidv4()` | ⛔ No such middleware. IDs come from `generateCorrelationId()` in the WAF headers module; not a UUIDv4 | `backend/src/common/waf/headers.ts:28` |
| `correlationId` required | ⚠️ Optional; omitted from the JSON when the client sends no header | `backend/src/common/filters/all-exceptions.filter.ts:50` |
| `this.metrics.increment(...)` | ⛔ No metrics object exists in the codebase | — |
| `processWithRetry` hand-written snippet | ✅ Replaced by `ResilientHttpClient` + the resilience module | `backend/src/common/resilience/` |
| `useApi()` frontend hook | ⛔ Does not exist | `frontend/src/lib/api.ts` |
| `TOKEN_EXPIRED` → 401 | ⚠️ Status is 401 but the code does not exist; expired and malformed tokens both yield `"Invalid or expired token"` | `backend/src/common/guards/jwt-auth.guard.ts:35-42` |
| `CONFLICT` → 409 | ⛔ No `ConflictException`; uniqueness violations surface as 500 | — |
| `RATE_LIMIT_EXCEEDED` body | ⚠️ The throttler guard bypasses the filter; only the `Retry-After` header is real | `backend/src/common/throttler/` |
| — | **New:** Zod "DTOs" were silently skipped by the global `ValidationPipe`. Fixed by converting `search/types.ts` and `upload/dto/upload-response.dto.ts` into real decorated classes, and by service-boundary `parseOrThrow()` in moderation | `backend/src/modules/search/dto/search.dto.ts`, `backend/src/modules/shared/validation/zod-validation.util.ts:24` |
| — | **New:** `message` is `string[]` for `ValidationPipe` failures and `string` everywhere else — a real client-facing inconsistency | `backend/src/common/filters/all-exceptions.filter.ts:27` |
| "Supertest for integration tests" | ⛔ The suite uses **Vitest** (`vitest.config.e2e.ts`); Supertest is only a type dependency | `backend/package.json` |

---

*This document defines the error handling standards for Hakawi.*
