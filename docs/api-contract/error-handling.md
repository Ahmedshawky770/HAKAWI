# Error Handling & Error Codes
## Hakawi - Error Response Standards

---

## Error Response Format

All errors follow this standard format:

```json
{
  "error": "ERROR_CODE",
  "message": "Human-readable error message",
  "details": [],
  "statusCode": 400,
  "timestamp": "2026-09-19T10:00:00Z",
  "path": "/api/v1/users",
  "correlationId": "abc123xyz"
}
```

### Fields

| Field | Type | Description |
|-------|------|-------------|
| `error` | string | Machine-readable error code |
| `message` | string | Human-readable error message |
| `details` | array | Optional field-level validation errors |
| `statusCode` | number | HTTP status code |
| `timestamp` | string | ISO 8601 timestamp |
| `path` | string | Request path |
| `correlationId` | string | Unique request ID for tracing |

---

## Error Codes

### 4xx Client Errors

| Code | HTTP Status | Description | When to Use |
|------|-------------|-------------|-------------|
| `VALIDATION_ERROR` | 400 | Invalid input data | Missing or invalid request fields |
| `UNAUTHORIZED` | 401 | Authentication required | Missing or invalid token |
| `FORBIDDEN` | 403 | Insufficient permissions | Valid auth but insufficient permissions |
| `NOT_FOUND` | 404 | Resource not found | Resource doesn't exist |
| `CONFLICT` | 409 | Resource already exists | Duplicate email, username, etc. |
| `RATE_LIMIT_EXCEEDED` | 429 | Too many requests | Rate limit exceeded |
| `INVALID_CREDENTIALS` | 401 | Wrong email/password | Login failure |
| `TOKEN_EXPIRED` | 401 | Token has expired | JWT expired |
| `SESSION_REVOKED` | 401 | Session was revoked | Refresh token revoked |
| `MFA_REQUIRED` | 403 | MFA code needed | MFA enrollment required |

### 5xx Server Errors

| Code | HTTP Status | Description | When to Use |
|------|-------------|-------------|-------------|
| `INTERNAL_ERROR` | 500 | Server error | Unexpected error |
| `DATABASE_ERROR` | 500 | Database operation failed | Query failure |
| `EXTERNAL_SERVICE_ERROR` | 502 | External service failed | Paymob, email service down |
| `SERVICE_UNAVAILABLE` | 503 | Service temporarily unavailable | Maintenance mode |

---

## Error Details

### Validation Error Details

```json
{
  "error": "VALIDATION_ERROR",
  "message": "Invalid input data",
  "details": [
    {
      "field": "email",
      "message": "Invalid email format",
      "value": "invalid-email"
    },
    {
      "field": "password",
      "message": "Password must be at least 8 characters",
      "value": "weak"
    }
  ],
  "statusCode": 400
}
```

### Conflict Error Details

```json
{
  "error": "CONFLICT",
  "message": "Email already exists",
  "details": [
    {
      "field": "email",
      "message": "Email is already registered",
      "value": "user@example.com"
    }
  ],
  "statusCode": 409
}
```

### Rate Limit Error Details

```json
{
  "error": "RATE_LIMIT_EXCEEDED",
  "message": "Too many login attempts. Please try again later.",
  "details": [
    {
      "field": "rateLimit",
      "message": "Max 10 requests per minute",
      "retryAfter": 60
    }
  ],
  "statusCode": 429,
  "retryAfter": 60
}
```

---

## Error Handling in NestJS

### Global Exception Filter

```typescript
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const request = ctx.getRequest();

    let status = 500;
    let error = 'INTERNAL_ERROR';
    let message = 'An unexpected error occurred';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const responseBody = exception.getResponse();

      if (typeof responseBody === 'object') {
        error = responseBody['error'] || error;
        message = responseBody['message'] || message;
      } else {
        message = responseBody as string;
      }
    }

    response.status(status).json({
      error,
      message,
      details: [],
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      correlationId: request.correlationId,
    });
  }
}
```

### Custom Exceptions

```typescript
export class ValidationException extends BadRequestException {
  constructor(details: ValidationError[]) {
    super({
      error: 'VALIDATION_ERROR',
      message: 'Invalid input data',
      details,
      statusCode: 400,
    });
  }
}

export class ConflictException extends BadRequestException {
  constructor(message: string) {
    super({
      error: 'CONFLICT',
      message,
      statusCode: 409,
    });
  }
}

export class RateLimitExceededException extends BadRequestException {
  constructor(retryAfter: number) {
    super({
      error: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests. Please try again later.',
      details: [{ field: 'rateLimit', message: `Retry after ${retryAfter}s`, retryAfter }],
      statusCode: 429,
      retryAfter,
    });
  }
}
```

---

## Error Handling in Frontend

### Error Display Component

```tsx
interface ApiError {
  error: string;
  message: string;
  details?: Array<{ field: string; message: string }>;
  statusCode: number;
}

export function ErrorMessage({ error }: { error: ApiError }) {
  if (error.details && error.details.length > 0) {
    return (
      <div className="bg-red-900/20 border border-red-500 rounded-lg p-4">
        <h3 className="text-red-400 font-semibold mb-2">{error.message}</h3>
        <ul className="list-disc list-inside text-sm text-red-300">
          {error.details.map((detail, index) => (
            <li key={index}>{detail.message}</li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className="bg-red-900/20 border border-red-500 rounded-lg p-4">
      <p className="text-red-400">{error.message}</p>
    </div>
  );
}
```

### Error Handling Hook

```typescript
export function useApi() {
  const [error, setError] = useState<ApiError | null>(null);

  const handleError = (error: unknown) => {
    if (error instanceof Error) {
      try {
        const apiError = JSON.parse(error.message);
        setError(apiError);
      } catch {
        setError({
          error: 'INTERNAL_ERROR',
          message: error.message || 'An unexpected error occurred',
          statusCode: 500,
        });
      }
    }
  };

  return { error, handleError, clearError: () => setError(null) };
}
```

---

## Correlation IDs

### Generation

```typescript
import { v4 as uuidv4 } from 'uuid';

// Middleware
@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const correlationId = req.headers['x-correlation-id'] || uuidv4();
    req.correlationId = correlationId;
    res.setHeader('x-correlation-id', correlationId);
    next();
  }
}
```

### Usage in Logs

```typescript
this.logger.error('Payment failed', {
  paymentId,
  userId,
  correlationId: req.correlationId,
});
```

---

## Retry Strategy

### Automatic Retries

```typescript
async function processWithRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  delayMs = 1000
): Promise<T> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      await sleep(delayMs * Math.pow(2, i));
    }
  }
  throw new Error('Max retries exceeded');
}
```

### Retryable Errors

- `EXTERNAL_SERVICE_ERROR` (502)
- `SERVICE_UNAVAILABLE` (503)
- Network timeouts

### Non-Retryable Errors

- `VALIDATION_ERROR` (400)
- `UNAUTHORIZED` ( 401)
- `FORBIDDEN` (403)
- `NOT_FOUND` (404)
- `CONFLICT` (409)

---

## Alerting

### Error Rate Alerts

- **5xx rate > 1%** — alert immediately
- **4xx rate > 5%** — warn
- **Payment errors > 2%** — alert immediately

### Monitoring

```typescript
// Track error rates
this.metrics.increment('errors.total', { code: error.code, statusCode });
this.metrics.histogram('errors.duration', responseTime);
```

---

## Best Practices

1. **Never expose internal errors to users** — log them, show generic message
2. **Always include correlationId** — for tracing
3. **Use specific error codes** — not generic "Error occurred"
4. **Log all errors** — with context, user ID, correlation ID
5. **Fail closed** — deny access on error, don't grant
6. **Retry with backoff** — for transient failures
7. **Don't retry on client errors** — 4xx errors are not retryable

---

## Error Code Reference

### Complete List

| Code | HTTP Status | Retryable | Description |
|------|-------------|-----------|-------------|
| `VALIDATION_ERROR` | 400 | No | Invalid input data |
| `UNAUTHORIZED` | 401 | No | Authentication required |
| `FORBIDDEN` | 403 | No | Insufficient permissions |
| `NOT_FOUND` | 404 | No | Resource not found |
| `CONFLICT` | 409 | No | Resource already exists |
| `RATE_LIMIT_EXCEEDED` | 429 | Yes | Too many requests |
| `INVALID_CREDENTIALS` | 401 | No | Wrong email/password |
| `TOKEN_EXPIRED` | 401 | Yes | Token has expired |
| `SESSION_REVOKED` | 401 | No | Session was revoked |
| `MFA_REQUIRED` | 403 | No | MFA code needed |
| `INTERNAL_ERROR` | 500 | No | Server error |
| `DATABASE_ERROR` | 500 | No | Database operation failed |
| `EXTERNAL_SERVICE_ERROR` | 502 | Yes | External service failed |
| `SERVICE_UNAVAILABLE` | 503 | Yes | Service temporarily unavailable |

---

*This document defines the error handling standards for Hakawi.*
