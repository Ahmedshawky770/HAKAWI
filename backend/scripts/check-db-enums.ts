import { dbPrimary } from '../src/db/router.ts';

/**
 * `check-db-enums` — CI gate that verifies every PostgreSQL enum type declared
 * in `migrations/0024_create_database_enums.sql` (and kept in sync by later
 * migrations such as `0034_restore_missing_enum_values.sql`) contains exactly
 * the values declared in `@hakawi/shared-types`.
 *
 * Principle #9 (Single Source of Truth): the application's enum vocabulary in
 * `packages/shared-types/src/*.ts` is the authoritative source. The database
 * enum types must be a superset of it — any application value missing from the
 * DB enum causes `22P02 invalid_input_value_for_enum` at runtime (the
 * `incident 0034` class of outage: `report_status` missing `escalated`,
 * `payment_status` missing `processing`, `rental_status` missing `returned`).
 *
 * Usage:
 *   tsx scripts/check-db-enums.ts
 *
 * Exits 0 when every application-declared enum value exists in the matching
 * DB enum type. Exits 1 with a detailed diff otherwise.
 */

import { sql } from 'drizzle-orm';

import {
  ACCOUNT_TYPES,
  ADMIN_ROLES,
  PAYMENT_STATUSES,
  RENTAL_STATUSES,
  REPORT_STATUSES,
  isAccountType,
  isAdminRole,
  isPaymentStatus,
  isRentalStatus,
  isReportStatus,
} from '@hakawi/shared-types';

// Mapping: shared-types enum array → (PostgreSQL enum type name, columns it guards).
// This is the SSOT declaration: if a new enum column is added, register it here
// alongside its shared-types array and its validation guard.
const ENUM_REGISTRY: Array<{
  /** Human-readable name of the enum. */
  readonly label: string;
  /** PostgreSQL enum type name as created by the migration. */
  readonly pgType: string;
  /** Application-declared allowed values (the source of truth). */
  readonly appValues: readonly string[];
  /** Runtime guard for the array (used for typing). */
  readonly guard: (value: string) => boolean;
  /** Table.column pairs this enum guards, for the error message. */
  readonly guards: readonly string[];
}> = [
  {
    label: 'account_type',
    pgType: 'account_type',
    appValues: ACCOUNT_TYPES,
    guard: isAccountType,
    guards: ['users.account_type'],
  },
  {
    label: 'admin_role',
    pgType: 'admin_role',
    appValues: ADMIN_ROLES,
    guard: isAdminRole,
    guards: ['users.admin_role'],
  },
  {
    label: 'payment_status',
    pgType: 'payment_status',
    appValues: PAYMENT_STATUSES,
    guard: isPaymentStatus,
    guards: [
      'payments.status',
      'refunds.status',
      'payment_transactions.status',
    ],
  },
  {
    label: 'rental_status',
    pgType: 'rental_status',
    appValues: RENTAL_STATUSES,
    guard: isRentalStatus,
    guards: ['rentals.status'],
  },
  {
    label: 'report_status',
    pgType: 'report_status',
    appValues: REPORT_STATUSES,
    guard: isReportStatus,
    guards: ['reports.status'],
  },
];

/**
 * Queries PostgreSQL for the labelled values of one enum type.
 */
async function enumValuesInDb(pgType: string): Promise<string[]> {
  const rows = await dbPrimary.$client.query<{ enumlabel: string }>(
    sql`SELECT enumlabel FROM pg_enum
        WHERE enumtypid = ${pgType}::regtype
        ORDER BY enumsortorder`,
  );
  return rows.map((row) => row.enumlabel);
}

async function main(): Promise<number> {
  let failures = 0;

  for (const entry of ENUM_REGISTRY) {
    let dbValues: string[];
    try {
      dbValues = await enumValuesInDb(entry.pgType);
    } catch (error) {
      console.error(
        `✗ ${entry.label}: could not read enum type "${entry.pgType}" from the database — ` +
          `has migration 0024 been applied? (${(error as Error).message})`,
      );
      failures += 1;
      continue;
    }

    const dbSet = new Set(dbValues);
    const appSet = new Set(entry.appValues);

    const missingFromDb = entry.appValues.filter((v) => !dbSet.has(v));
    const extraInDb = dbValues.filter((v) => !appSet.has(v));

    if (missingFromDb.length > 0 || extraInDb.length > 0) {
      failures += 1;
      console.error(`✗ ${entry.label} (pg type "${entry.pgType}") — MISMATCH`);
      console.error(`  Guards: ${entry.guards.join(', ')}`);
      if (missingFromDb.length > 0) {
        console.error(
          `  MISSING from DB enum (application uses these but the DB rejects them):`,
        );
        for (const v of missingFromDb) {
          console.error(`    - ${v}`);
        }
        console.error(
          `  → Add the missing value to the DB enum type (see migrations/0034_restore_missing_enum_values.sql).`,
        );
      }
      if (extraInDb.length > 0) {
        console.error(
          `  EXTRA in DB enum (not declared in shared-types — dead vocabulary):`,
        );
        for (const v of extraInDb) {
          console.error(`    - ${v}`);
        }
        console.error(
          `  → Remove the extra value, or add it to shared-types and its validation guard.`,
        );
      }
    } else {
      console.log(
        `✓ ${entry.label} (pg type "${entry.pgType}") — ${dbValues.length} value(s) in sync: ${dbValues.join(', ')}`,
      );
    }
  }

  if (failures > 0) {
    console.error(`\n${failures} enum type(s) out of sync with shared-types.`);
    console.error(
      'This is a Principle #9 (SSOT) violation: the application enum vocabulary and the ' +
        'database enum type must agree. Fix the mismatch before deploying.',
    );
    return 1;
  }

  console.log(`\nAll ${ENUM_REGISTRY.length} enum type(s) in sync with shared-types.`);
  return 0;
}

main().then((code) => process.exit(code));
