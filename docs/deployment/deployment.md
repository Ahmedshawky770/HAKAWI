# Deployment Guide
## Hakawi - Production Deployment

---

## Deployment Strategy

### Environments

| Environment | Purpose | URL |
|-------------|---------|-----|
| **Development** | Local development | http://localhost:3000 |
| **Staging** | Pre-production testing | https://staging.hakawi.com |
| **Production** | Live application | https://hakawi.com |

### Deployment Platforms

| Component | Platform | Reason |
|-----------|----------|--------|
| **Frontend** | Vercel | Optimized for Next.js, edge network, automatic deployments |
| **Backend** | Railway | Containerized NestJS, easy scaling, PostgreSQL managed |
| **Database** | Railway Managed PostgreSQL | Automated backups, high availability |
| **Cache** | Railway Managed Valkey | Redis-compatible, managed service |
| **Storage** | Cloudflare R2 | S3-compatible, no egress fees |
| **Monitoring** | Sentry | Error tracking and performance monitoring |

---

## Pre-Deployment Checklist

### Code Quality

- [ ] All tests pass (`npm test`)
- [ ] E2E tests pass (`npm run test:e2e`)
- [ ] Linting passes (`npm run lint`)
- [ ] TypeScript compilation passes (`npm run build`)
- [ ] No security vulnerabilities (`npm audit`)

### Database

- [ ] All migrations tested on staging
- [ ] Migration rollback tested
- [ ] Database backup completed
- [ ] Migration script reviewed

### Configuration

- [ ] Environment variables set in deployment platform
- [ ] Secrets rotated
- [ ] CORS origins configured
- [ ] SSL certificates valid

### Monitoring

- [ ] Sentry DSN configured
- [ ] Alerts configured
- [ ] Health check endpoints working
- [ ] Log aggregation working

---

## Frontend Deployment (Vercel)

### Setup

1. Connect GitHub repository to Vercel
2. Configure environment variables in Vercel dashboard
3. Deploy

### Environment Variables

```env
NEXT_PUBLIC_API_URL=https://api.hakawi.com/v1
NEXT_PUBLIC_SANITY_PROJECT_ID=your-project-id
NEXT_PUBLIC_SANITY_DATASET=production
NEXT_PUBLIC_APP_URL=https://hakawi.com
NEXT_PUBLIC_APP_ENV=production
NEXT_PUBLIC_SENTRY_DSN=your-sentry-dsn
```

### Build Settings

- **Build Command:** `npm run build`
- **Output Directory:** `.next`
- **Install Command:** `npm install`

### Automatic Deployments

- **Production:** Deploys on `main` branch push
- **Preview:** Deploys on PR creation
- **Rollback:** Available in Vercel dashboard

---

## Backend Deployment (Railway)

### Setup

1. Connect GitHub repository to Railway
2. Add PostgreSQL and Valkey plugins
3. Configure environment variables
4. Deploy

### Environment Variables

```env
NODE_ENV=production
PORT=3001
DB_HOST=${{Postgres.PGHOST}}
DB_PORT=${{Postgres.PGPORT}}
DB_NAME=${{Postgres.PGDATABASE}}
DB_USER=${{Postgres.PGUSER}}
DB_PASSWORD=${{Postgres.PGPASSWORD}}
VALKEY_HOST=${{Valkey.HOST}}
VALKEY_PORT=${{Valkey.PORT}}
VALKEY_PASSWORD=${{Valkey.PASSWORD}}
JWT_SECRET=your-jwt-secret
REFRESH_TOKEN_SECRET=your-refresh-secret
PAYMOB_API_KEY=your-paymob-api-key
PAYMOB_WEBHOOK_SECRET=your-webhook-secret
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=noreply@hakawi.com
EMAIL_PASSWORD=your-email-password
STORAGE_PROVIDER=r2
STORAGE_BUCKET=hakawi-media
STORAGE_ACCESS_KEY=your-access-key
STORAGE_SECRET_KEY=your-secret-key
SENTRY_DSN=your-sentry-dsn
CORS_ORIGIN=https://hakawi.com
```

### Build Settings

- **Build Command:** `npm run build`
- **Start Command:** `npm run start:prod`
- **Port:** `$PORT` (Railway provides this)

### Scaling

- **Start:** 1 instance
- **Scale:** Add instances based on traffic
- **Auto-scaling:** Configure based on CPU/memory

---

## Database Migrations

### Pre-Migration

```bash
# 1. Backup database
pg_dump -h localhost -U postgres hakawi > backup.sql

# 2. Test migration on staging
npm run migration:run

# 3. Verify data integrity
npm run db:verify
```

### Migration Deployment

```bash
# 1. Deploy code first (backward compatible)
git push origin main

# 2. Run migration
npm run migration:run

# 3. Verify application
curl https://api.hakawi.com/health
```

### Rollback

```bash
# 1. Revert migration
npm run migration:revert

# 2. Deploy previous code
git revert HEAD
git push origin main

# 3. Verify application
curl https://api.hakawi.com/health
```

---

## Health Checks

### Backend Health Endpoint

```typescript
@Get('health')
async healthCheck() {
  return {
    status: 'ok',
    timestamp: new Date().toISOString(),
    services: {
      database: await this.checkDatabase(),
      valkey: await this.checkValkey(),
      sanity: await this.checkSanity(),
    },
  };
}
```

### Health Check Response

```json
{
  "status": "ok",
  "timestamp": "2026-09-19T10:00:00Z",
  "services": {
    "database": "ok",
    "valkey": "ok",
    "sanity": "ok"
  }
}
```

---

## Monitoring

### Sentry Configuration

```typescript
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,
});
```

### Alerts

- **Error rate > 1%** — Alert immediately
- **Response time > 2s** — Alert
- **Database connection pool exhausted** — Alert
- **Disk space > 80%** — Alert

### Dashboards

- Error rate over time
- Response time percentiles (p50, p95, p99)
- Database query performance
- Cache hit rate
- Payment success rate

---

## SSL/TLS

### Frontend (Vercel)

- Automatically provisioned by Vercel
- Force HTTPS redirects

### Backend (Railway)

- Automatically provisioned by Railway
- Force HTTPS redirects in NestJS:

```typescript
app.enable('trust proxy');
app.use((req, res, next) => {
  if (req.headers['x-forwarded-proto'] !== 'https') {
    return res.redirect(`https://${req.hostname}${req.url}`);
  }
  next();
});
```

---

## CI/CD Pipeline

### GitHub Actions

```yaml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: 20
      - run: npm install
      - run: npm run lint
      - run: npm run test:cov

  deploy-backend:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: railway-app/action@v1
        with:
          railway-token: ${{ secrets.RAILWAY_TOKEN }}
          service: hakawi-backend

  deploy-frontend:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: amondnet/vercel-action@v20
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
          vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID }}
```

---

## Rollback Strategy

### Frontend (Vercel)

- Go to Vercel dashboard
- Click "Deployments"
- Click "..." on previous deployment
- Click "Promote to Production"

### Backend (Railway)

- Go to Railway dashboard
- Click "Deployments"
- Click "Redeploy" on previous deployment
- Or use Railway CLI: `railway rollback`

### Database

- Never rollback migrations in production
- Instead, create new migration to fix issue
- If critical, restore from backup

---

## Performance Optimization

### Frontend

- Enable CDN caching (Vercel Edge Network)
- Optimize images (Next.js Image component)
- Code splitting (dynamic imports)
- Minify assets (automatic in production)

### Backend

- Enable compression (gzip/brotli)
- Database query optimization (indexes)
- Connection pooling
- Cache frequently accessed data

---

## Security

### HTTPS

- Force HTTPS everywhere
- HSTS headers
- TLS 1.3 only

### Headers

```typescript
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
  },
}));
```

### Secrets

- Never log secrets
- Rotate secrets regularly
- Use different secrets per environment

---

## Maintenance

### Regular Tasks

- **Weekly:** Review error logs in Sentry
- **Monthly:** Update dependencies
- **Quarterly:** Security audit
- **Bi-annually:** Disaster recovery drill

### Updates

```bash
# Update dependencies
npm audit fix
npm update

# Test updates
npm test
npm run test:e2e

# Deploy
git push origin main
```

---

*This document defines the deployment process for Hakawi.*
