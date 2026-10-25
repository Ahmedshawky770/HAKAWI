# ADR-008: Enum Single Source of Truth with CI Validation

## Status
Accepted

## Context
PostgreSQL enum types (`migrations/0024_create_database_enums.sql`) were missing
application values that the code always used: `report_status` missing `escalated`,
`payment_status` missing `processing`, `rental_status` missing `returned` (incident
0034, migration 0034). The application vocabulary in `@hakawi/shared-types` and the
database enum types were not synchronized — each could drift independently, causing
`22P02 invalid_input_value_for_enum` runtime failures.

## Decision
1. `@hakawi/shared-types` is the Single Source of Truth for enum vocabulary
   (`PAYMENT_STATUSES`, `RENTAL_STATUSES`, `REPORT_STATUSES`, `ACCOUNT_TYPES`,
   `ADMIN_ROLES`, …). `REPORT_STATUSES` now includes `escalated`.
2. `backend/scripts/check-db-enums.ts` (CI gate `npm run db:check-enums`) compares
   every application-declared enum value against `pg_enum` in the database and fails
   CI on any mismatch.
3. The registry maps each shared-types array to its PostgreSQL enum type name and
   the table.columns it guards, so new enum columns are registered in one place.

## Consequences
- Enum drift between application and database is caught in CI, not production.
- Adding a new enum value requires updating both shared-types and the DB enum type
  via migration, reviewed together (Principle #6).
- No silent `22P02` failures from missing enum values.

## References
- Principle #9 SSOT — one authoritative source per piece of data.
- Principle #6 Minimize Migrations — migration 0034 added missing values additively.
- `packages/shared-types/src/moderation.ts`, `packages/shared-types/src/payment.ts`
- `backend/scripts/check-db-enums.ts`
