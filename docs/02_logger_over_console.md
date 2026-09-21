# Principle #2: Logger Over `console`

**Statement:**
I never use `console.log` in production code. Every log entry goes through a structured Logger with proper log levels, timestamps, correlation IDs, and contextual metadata. Debugging a production issue without structured logging is like searching for a needle in a haystack — in the dark. Logs are not noise; they are the system's voice.

**Rationale:**
- `console.log` lacks structure and context
- No log levels (debug, info, warn, error)
- No correlation IDs for tracing requests
- No structured data for analysis

**Enforcement:**
- ESLint rule: `no-console` (error)
- Winston/Pino logger with structured output
- Correlation IDs injected via middleware
- Log levels: debug, info, warn, error

**Example:**
```typescript
// ❌ BAD
console.log('User created', user);

// ✅ GOOD
logger.info('User created', { userId: user.id, email: user.email, correlationId });
```
