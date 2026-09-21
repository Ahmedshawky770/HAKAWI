# Environment Variables & Configuration
## Hakawi - Configuration Management

---

## Environment Files

### Backend

```
backend/
├── .env.example          # Template for all environments
├── .env.development      # Development overrides
├── .env.staging          # Staging overrides
├── .env.production       # Production overrides (never commit)
└── .env.test             # Test environment
```

### Frontend

```
frontend/
├── .env.example          # Template for all environments
├── .env.local            # Local overrides (never commit)
├── .env.development      # Development
├── .env.staging          # Staging
└── .env.production       # Production
```

---

## Backend Environment Variables

### Database

```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=hakawi
DB_USER=postgres
DB_PASSWORD=postgres
DB_SSL=false
DB_POOL_MIN=2
DB_POOL_MAX=10
DB_POOL_IDLE_TIMEOUT=30000
```

### Valkey

```env
VALKEY_HOST=localhost
VALKEY_PORT=6379
VALKEY_PASSWORD=
VALKEY_DB=0
VALKEY_TTL_SESSION=604800      # 7 days in seconds
VALKEY_TTL_RATE_LIMIT=60       # 60 seconds
VALKEY_TTL_WAF=3600            # 1 hour in seconds
```

### JWT

```env
JWT_SECRET=your-secret-key-here-min-32-chars
JWT_EXPIRY=15m
REFRESH_TOKEN_SECRET=your-refresh-secret-here-min-32-chars
REFRESH_TOKEN_EXPIRY=7d
```

### OAuth Providers

```env
# Google
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret

# Apple
APPLE_CLIENT_ID=your-apple-client-id
APPLE_CLIENT_SECRET=your-apple-client-secret
APPLE_TEAM_ID=your-apple-team-id
APPLE_KEY_ID=your-apple-key-id
APPLE_PRIVATE_KEY=your-apple-private-key

# Facebook
FACEBOOK_CLIENT_ID=your-facebook-client-id
FACEBOOK_CLIENT_SECRET=your-facebook-client-secret

# GitHub
GITHUB_CLIENT_ID=your-github-client-id
GITHUB_CLIENT_SECRET=your-github-client-secret

# TikTok
TIKTOK_CLIENT_ID=your-tiktok-client-id
TIKTOK_CLIENT_SECRET=your-tiktok-client-secret
```

### Payments (Paymob)

```env
PAYMOB_API_KEY=your-paymob-api-key
PAYMOB_MERCHANT_ID=your-merchant-id
PAYMOB_WEBHOOK_SECRET=your-webhook-secret
PAYMOB_BASE_URL=https://accept.paymob.com/api
PAYMOB_INTEGRATION_ID=your-integration-id
```

### Email

```env
EMAIL_PROVIDER=smtp                    # smtp | sendgrid
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your-email@gmail.com
EMAIL_PASSWORD=your-email-password
EMAIL_FROM=noreply@hakawi.com
EMAIL_REPLY_TO=support@hakawi.com
```

### Storage

```env
STORAGE_PROVIDER=s3                    # s3 | r2
STORAGE_BUCKET=hakawi-media
STORAGE_REGION=us-east-1
STORAGE_ACCESS_KEY=your-access-key
STORAGE_SECRET_KEY=your-secret-key
STORAGE_ENDPOINT=                      # Optional: for R2 or custom S3
```

### Sentry

```env
SENTRY_DSN=your-sentry-dsn
SENTRY_ENVIRONMENT=development         # development | staging | production
SENTRY_TRACES_SAMPLE_RATE=0.1          # 10% in production, 1.0 in dev
```

### Application

```env
NODE_ENV=development                   # development | staging | production
PORT=3001
CORS_ORIGIN=http://localhost:3000
API_PREFIX=/api/v1
```

### WAF

```env
WAF_ENABLED=true
WAF_LOG_VIOLATIONS=true
WAF_BLOCK_ON_VIOLATION=true
WAF_RATE_LIMIT_ENABLED=true
WAF_RATE_LIMIT_REQUESTS=100
WAF_RATE_LIMIT_WINDOW=60
WAF_ADMIN_EMAIL=admin@hakawi.com
WAF_STRICT_REFERRER=false
WAF_FINGERPRINT_PROTECTION=false
WAF_BLOCKED_COUNTRIES=US,CN,RU
WAF_ALLOWED_METHODS=GET,POST,PUT,PATCH,DELETE,OPTIONS,HEAD
WAF_MAX_REQUEST_SIZE=10485760          # 10MB
```

### Cache

```env
CACHE_ENABLED=true
CACHE_TTL_DEFAULT=3600                 # 1 hour
CACHE_TTL_USER=1800                    # 30 minutes
CACHE_TTL_STORY=3600                   # 1 hour
CACHE_TTL_NOTIFICATION=300             # 5 minutes
```

---

## Frontend Environment Variables

### API

```env
NEXT_PUBLIC_API_URL=http://localhost:3001/api/v1
```

### Sanity (Optional)

```env
NEXT_PUBLIC_SANITY_PROJECT_ID=your-project-id
NEXT_PUBLIC_SANITY_DATASET=production
NEXT_PUBLIC_SANITY_API_VERSION=2024-01-01
```

### App

```env
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_APP_ENV=development        # development | staging | production
NEXT_PUBLIC_APP_NAME=Hakawi
NEXT_PUBLIC_APP_VERSION=1.0.0
```

### Analytics (Optional)

```env
NEXT_PUBLIC_ANALYTICS_ID=your-analytics-id
NEXT_PUBLIC_SENTRY_DSN=your-sentry-dsn
```

---

## Configuration Management

### NestJS Config

```typescript
// backend/src/config/configuration.ts
export default () => ({
  database: {
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT, 10),
    name: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
  },
  valkey: {
    host: process.env.VALKEY_HOST,
    port: parseInt(process.env.VALKEY_PORT, 10),
    password: process.env.VALKEY_PASSWORD,
  },
  jwt: {
    secret: process.env.JWT_SECRET,
    expiry: process.env.JWT_EXPIRY,
  },
});
```

### Next.js Config

```typescript
// frontend/next.config.js
module.exports = {
  env: {
    API_URL: process.env.NEXT_PUBLIC_API_URL,
    SANITY_PROJECT_ID: process.env.NEXT_PUBLIC_SANITY_PROJECT_ID,
  },
};
```

---

## Environment Validation

### Backend

Use `zod` to validate environment variables:

```typescript
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'staging', 'production']),
  PORT: z.coerce.number().default(3001),
  DB_HOST: z.string(),
  DB_PORT: z.coerce.number().default(5432),
  DB_NAME: z.string(),
  DB_USER: z.string(),
  DB_PASSWORD: z.string(),
  JWT_SECRET: z.string().min(32),
  REFRESH_TOKEN_SECRET: z.string().min(32),
});

export const env = envSchema.parse(process.env);
```

### Frontend

```typescript
const envSchema = z.object({
  NEXT_PUBLIC_API_URL: z.string().url(),
  NEXT_PUBLIC_APP_URL: z.string().url(),
  NEXT_PUBLIC_APP_ENV: z.enum(['development', 'staging', 'production']),
});

export const env = envSchema.parse({
  NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  NEXT_PUBLIC_APP_ENV: process.env.NEXT_PUBLIC_APP_ENV,
});
```

---

## Secret Management

### Development

- Use `.env` files (never commit)
- Use `.gitignore` to exclude `.env*` files

### Production

- Use environment variables in deployment platform
- Use secret management service (AWS Secrets Manager, HashiCorp Vault)
- Never commit secrets to git

### Rotation

- Rotate secrets regularly (every 90 days)
- Use different secrets for each environment
- Store secrets in password manager

---

## Configuration Checklist

### Backend

- [ ] Database credentials configured
- [ ] Valkey configured
- [ ] JWT secrets set (min 32 chars)
- [ ] OAuth providers configured
- [ ] Paymob credentials configured
- [ ] Email service configured
- [ ] Storage configured
- [ ] Sentry DSN configured
- [ ] CORS origins set
- [ ] WAF rules configured

### Frontend

- [ ] API URL configured
- [ ] Sanity configured (if used)
- [ ] Analytics configured (if used)
- [ ] App URL configured

---

## Environment-Specific Configuration

### Development

- Debug mode enabled
- Detailed error messages
- Hot reload enabled
- Test data seeded

### Staging

- Production-like configuration
- Test data only
- Sentry enabled
- WAF enabled

### Production

- Optimized for performance
- No debug mode
- Minimal logging (errors only)
- All security features enabled

---

*This document defines the environment configuration for Hakawi.*
