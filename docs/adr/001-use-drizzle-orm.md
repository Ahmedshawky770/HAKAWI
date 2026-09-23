# ADR-001: Use Drizzle ORM for Database Access

## Status
Accepted

## Context
We needed a database ORM for the Hakawi platform that supports:
- TypeScript with full type safety
- PostgreSQL as the primary database
- Migration management
- Schema definition in code

## Decision
We chose **Drizzle ORM** over other options (Prisma, TypeORM, Sequelize) because:
- It provides full type safety with TypeScript
- It has a lightweight footprint (~7kB)
- It supports SQL-like queries with type safety
- It has built-in migration generation
- It works well with PostgreSQL-specific features

## Consequences
- All database schemas are defined in TypeScript files under `src/db/schema/`
- Migrations are generated using `drizzle-kit generate:pg`
- Team must learn Drizzle's query API
- Less ecosystem support compared to Prisma
