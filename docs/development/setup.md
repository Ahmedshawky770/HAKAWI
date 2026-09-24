# Development Setup Guide
## Hakawi - Getting Started

---

## Prerequisites

### Required

- **Node.js** 20+ and **npm** 10+
- **Docker** and Docker Compose
- **Git**
- **PostgreSQL** 15+ (or use Docker Compose)
- **Valkey/Redis** (or use Docker Compose)

### Optional

- **VS Code** with recommended extensions:
  - ESLint
  - Prettier
  - Tailwind CSS IntelliSense
  - Postman/REST Client for API testing

---

## Project Structure

```
hakawi/
├── frontend/                 # Next.js 16 application
│   ├── src/
│   │   ├── app/             # App Router pages
│   │   ├── components/      # React components
│   │   ├── lib/            # Utilities, API clients
│   │   └── types/          # TypeScript types
│   ├── public/             # Static assets
│   ├── package.json
│   └── next.config.js
│
├── backend/                 # NestJS application
│   ├── src/
│   │   ├── modules/        # Feature modules
│   │   ├── common/         # Shared utilities
│   │   ├── config/         # Configuration
│   │   └── main.ts
│   ├── migrations/         # Database migrations
│   ├── seeds/              # Seed data
│   ├── package.json
│   └── nest-cli.json
│
├── docker compose.yml       # Local development services
└── package.json            # Root workspace config
```

---

## Quick Start

### 1. Clone Repository

```bash
git clone <repository-url> hakawi
cd hakawi
```

### 2. Install Dependencies

```bash
# Install root dependencies
npm install

# Install frontend dependencies
cd frontend && npm install && cd ..

# Install backend dependencies
cd backend && npm install && cd ..
```

### 3. Start Docker Services

```bash
docker compose up -d
```

This starts:
- PostgreSQL on port 5432
- Valkey on port 6379
- Adminer on port 8080 (optional)

### 4. Configure Environment Variables

```bash
# Backend
cp backend/.env.example backend/.env

# Frontend
cp frontend/.env.example frontend/.env.local
```

See [Environment Variables](#environment-variables) section for required variables.

### 5. Run Database Migrations

```bash
cd backend
npm run migration:run
npm run seed:dev
cd ..
```

### 6. Start Development Servers

```bash
# Terminal 1: Backend
cd backend
npm run start:dev

# Terminal 2: Frontend
cd frontend
npm run dev
```

### 7. Verify Setup

```bash
# Backend health check
curl http://localhost:3001/health

# Frontend
open http://localhost:3000
```

---

## Environment Variables

### Backend (`backend/.env`)

```env
# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=hakawi
DB_USER=postgres
DB_PASSWORD=postgres

# Valkey
VALKEY_HOST=localhost
VALKEY_PORT=6379
VALKEY_PASSWORD=

# JWT
JWT_SECRET=your-secret-key-here
JWT_EXPIRY=15m
REFRESH_TOKEN_SECRET=your-refresh-secret-here
REFRESH_TOKEN_EXPIRY=7d

# OAuth
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
APPLE_CLIENT_ID=your-apple-client-id
APPLE_CLIENT_SECRET=your-apple-client-secret
FACEBOOK_CLIENT_ID=your-facebook-client-id
FACEBOOK_CLIENT_SECRET=your-facebook-client-secret
GITHUB_CLIENT_ID=your-github-client-id
GITHUB_CLIENT_SECRET=your-github-client-secret
TIKTOK_CLIENT_ID=your-tiktok-client-id
TIKTOK_CLIENT_SECRET=your-tiktok-client-secret

# Paymob
PAYMOB_API_KEY=your-paymob-api-key
PAYMOB_MERCHANT_ID=your-merchant-id
PAYMOB_WEBHOOK_SECRET=your-webhook-secret
PAYMOB_BASE_URL=https://accept.paymob.com/api

# Email
EMAIL_PROVIDER=smtp
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your-email@gmail.com
EMAIL_PASSWORD=your-email-password
EMAIL_FROM=noreply@hakawi.com

# Storage
STORAGE_PROVIDER=s3
STORAGE_BUCKET=hakawi-media
STORAGE_REGION=us-east-1
STORAGE_ACCESS_KEY=your-access-key
STORAGE_SECRET_KEY=your-secret-key

# Sentry
SENTRY_DSN=your-sentry-dsn

# App
NODE_ENV=development
PORT=3001
CORS_ORIGIN=http://localhost:3000
```

### Frontend (`frontend/.env.local`)

```env
# API
NEXT_PUBLIC_API_URL=http://localhost:3001/api/v1

# Sanity (optional)
NEXT_PUBLIC_SANITY_PROJECT_ID=your-project-id
NEXT_PUBLIC_SANITY_DATASET=production

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_APP_ENV=development
```

---

## Common Commands

### Backend

```bash
cd backend

# Development
npm run start:dev          # Start dev server with hot reload
npm run start:debug        # Start with debugger on port 9229

# Database
npm run migration:run      # Run pending migrations
npm run migration:revert   # Revert last migration
npm run migration:generate # Generate new migration
npm run seed:dev           # Seed development data
npm run seed:test          # Seed test data

# Testing
npm run test               # Run unit tests
npm run test:e2e           # Run E2E tests
npm run test:cov           # Run tests with coverage

# Linting
npm run lint               # Run ESLint
npm run lint:fix           # Fix ESLint errors
npm run format             # Run Prettier
```

### Frontend

```bash
cd frontend

# Development
npm run dev                # Start dev server on port 3000
npm run build              # Build for production
npm run start              # Start production server
npm run lint               # Run ESLint
npm run lint:fix           # Fix ESLint errors
npm run format             # Run Prettier

# Testing
npm run test               # Run unit tests
npm run test:e2e           # Run Playwright E2E tests
```

---

## Docker Compose

```yaml
version: '3.8'

services:
  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: hakawi
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

  valkey:
    image: valkey/valkey:latest
    ports:
      - "6379:6379"
    volumes:
      - valkey_data:/data

  adminer:
    image: adminer:latest
    ports:
      - "8080:8080"
    environment:
      ADMINER_DEFAULT_SERVER: postgres

volumes:
  postgres_data:
  valkey_data:
```

---

## VS Code Setup

### Recommended Extensions

- ESLint
- Prettier
- Tailwind CSS IntelliSense
- Postman
- Docker
- PostgreSQL

### Workspace Settings (`.vscode/settings.json`)

```json
{
  "editor.formatOnSave": true,
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  },
  "typescript.tsdk": "node_modules/typescript/lib"
}
```

---

## Troubleshooting

### Port Already in Use

```bash
# Find process using port 3000
lsof -ti:3000 | xargs kill -9

# Find process using port 3001
lsof -ti:3001 | xargs kill -9

# Find process using port 5432
lsof -ti:5432 | xargs kill -9
```

### Database Connection Issues

```bash
# Check if PostgreSQL is running
docker compose ps

# Restart PostgreSQL
docker compose restart postgres

# View PostgreSQL logs
docker compose logs postgres
```

### Valkey Connection Issues

```bash
# Check if Valkey is running
docker compose ps valkey

# Connect to Valkey CLI
docker compose exec valkey redis-cli ping
```

---

## Next Steps

1. Read [Code Standards](./code-standards.md)
2. Review [Testing Strategy](../testing/testing-strategy.md)
3. Set up [Environment Variables](#environment-variables)
4. Start building!

---

*This guide helps new developers set up the Hakawi development environment.*
