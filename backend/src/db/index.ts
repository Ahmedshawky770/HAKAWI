/**
 * Database module entry point (Single Source of Truth).
 *
 * WHY THIS RE-EXPORTS FROM ROUTER INSTEAD OF CREATING A POOL.
 * The original implementation in this file created its own `Pool` and `drizzle` instance,
 * while `db/router.ts` implemented read/write splitting with primary and replica pools.
 * Having two separate pool factories meant:
 * - Two connection pools to the same database (wasted connections)
 * - The "default" `db` imported via `db/index.ts` did NOT use read/write splitting
 * - The router existed but was not wired to the rest of the codebase
 *
 * This file now re-exports the routed database from `./router.ts`, so every import of
 * `db` from this module uses the single router (select → replicas with fallback, writes →
 * primary). That is Principle #9 (Single Source of Truth): one place decides routing.
 *
 * Exports:
 * - `db` — routed database (read/write splitting). Default for most application code.
 * - `dbPrimary` — explicit primary access (read-your-writes, auth, financial)
 * - `dbReplica` — explicit replica access (read-heavy, stale-acceptable)
 * - `checkDatabaseHealth` — health probe for primary and replicas
 * - `closeDatabase` — graceful shutdown of all pools
 */
export {
  db,
  dbPrimary,
  dbReplica,
  checkDatabaseHealth,
  closeDatabase,
} from './router.ts';

export { db as default } from './router.ts';
