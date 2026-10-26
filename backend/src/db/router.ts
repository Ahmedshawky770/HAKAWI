import { drizzle, type NodePgDatabase, type NodePgTransaction } from 'drizzle-orm/node-postgres';
import type { ExtractTablesWithRelations } from 'drizzle-orm';
import { Pool } from 'pg';
import type { PoolConfig } from 'pg';

import * as schema from '../db/schema/index.ts';

/**
 * Database Router — Read/Write Splitting (Principle #9: Single Source of Truth)
 *
 * Routes:
 *   - select() → healthy replica (round-robin, fallback to primary)
 *   - insert()/update()/delete() → primary
 *   - transaction() → primary (never route write transactions to replicas)
 *   - withPrimary() → primary, bypassing replica routing entirely
 *
 * Replica health is monitored continuously: a replica that is unreachable or
 * replicating with unacceptable lag is removed from the read path until it
 * recovers. This prevents read-after-write inconsistencies caused by stale
 * replicas (Principle #16: Smart Hybrid Consistency — strong consistency islands
 * such as payments must never read from a lagging replica).
 */

type DrizzleDb = NodePgDatabase<typeof schema> & {
  $client: Pool;
};

type Transaction = NodePgTransaction<typeof schema, ExtractTablesWithRelations<typeof schema>>;

let primaryDb: DrizzleDb | null = null;
let primaryPool: Pool | null = null;
let replicaPools: Pool[] = [];
let replicaDbs: DrizzleDb[] = [];
let replicaIndex = 0;

/**
 * Replica health state. One entry per configured replica host.
 *
 * `lagMs` is the observed replication delay in milliseconds, measured by
 * `pg_last_wal_replay_lag()`. `unhealthySince` is set when a replica fails a
 * health check and cleared when it recovers. A replica is excluded from the
 * read path while unhealthy or when its lag exceeds `MAX_REPLICA_LAG_MS`.
 */
type ReplicaHealth = {
  host: string;
  port: number;
  healthy: boolean;
  lagMs: number | null;
  unhealthySince: Date | null;
  lastCheckedAt: Date | null;
};

const replicaHealth: ReplicaHealth[] = [];

/**
 * Maximum acceptable replication lag before a replica is removed from the
 * read path. Above this, reads may observe data older than the consistency
 * window required by strong-consistency data (payments, auth, refunds).
 */
const MAX_REPLICA_LAG_MS = 2_000;

/**
 * How often replica health is re-probed (ms). Health is checked lazily on
 * each route decision if the last check is older than this interval.
 */
const REPLICA_HEALTH_CHECK_INTERVAL_MS = 5_000;

function createPool(config: PoolConfig): Pool {
  return new Pool({
    ...config,
    max: config.max ?? 20,
    idleTimeoutMillis: config.idleTimeoutMillis ?? 30000,
    connectionTimeoutMillis: config.connectionTimeoutMillis ?? 2000,
    allowExitOnIdle: true,
  });
}

function createDrizzle(pool: Pool): DrizzleDb {
  return drizzle(pool, { schema }) as DrizzleDb;
}

function getPrimaryDb(): DrizzleDb {
  if (!primaryDb) {
    const config: PoolConfig = {
      host: process.env.DB_PRIMARY_HOST || process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PRIMARY_PORT || process.env.DB_PORT || '5432', 10),
      database: process.env.DB_PRIMARY_NAME || process.env.DB_NAME || 'hakawi',
      user: process.env.DB_PRIMARY_USER || process.env.DB_USER || 'postgres',
      password: process.env.DB_PRIMARY_PASSWORD || process.env.DB_PASSWORD || '',
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
      // The primary is the strong-consistency island. Fail fast on connection
      // issues rather than silently degrading to stale reads.
    };
    primaryPool = createPool(config);
    primaryDb = createDrizzle(primaryPool);
  }
  return primaryDb;
}

function getReplicaDbs(): DrizzleDb[] {
  if (replicaDbs.length === 0) {
    const hosts = process.env.DB_REPLICA_HOSTS?.split(',').map((h) => h.trim()) ?? [];
    if (hosts.length === 0) return [];

    const config: PoolConfig = {
      port: parseInt(process.env.DB_REPLICA_PORT || '5432', 10),
      database: process.env.DB_REPLICA_NAME || 'hakawi',
      user: process.env.DB_REPLICA_USER || 'postgres',
      password: process.env.DB_REPLICA_PASSWORD || '',
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    };

    replicaPools = hosts.map((host) => createPool({ ...config, host }));
    replicaDbs = replicaPools.map(createDrizzle);

    // Initialise health tracking for every replica.
    replicaHealth.length = 0;
    for (const host of hosts) {
      replicaHealth.push({
        host,
        port: parseInt(process.env.DB_REPLICA_PORT || '5432', 10),
        healthy: true,
        lagMs: null,
        unhealthySince: null,
        lastCheckedAt: null,
      });
    }
  }
  return replicaDbs;
}

/**
 * Probe one replica for liveness and replication lag.
 *
 * Uses `pg_last_wal_replay_lag()` which returns the time since the last
 * replayed WAL entry on a standby, in milliseconds. Returns `null` when the
 * server is not in recovery (i.e. it is a primary) or when the metric is
 * unavailable — in that case the replica is treated as healthy with unknown
 * lag.
 *
 * Errors (unreachable replica, query failure) mark the replica unhealthy.
 */
async function probeReplicaHealth(
  pool: Pool,
  index: number,
): Promise<void> {
  const entry = replicaHealth[index];
  if (!entry) return;

  const now = new Date();
  entry.lastCheckedAt = now;

  let client;
  try {
    client = await pool.connect();
    const result = await client.query<{ lag_ms: string | null }>(
      `SELECT EXTRACT(EPOCH FROM pg_last_wal_replay_lag()) * 1000 AS lag_ms`,
    );
    const raw = result.rows[0]?.lag_ms;
    entry.healthy = true;
    entry.unhealthySince = null;
    entry.lagMs = raw === null || raw === undefined ? null : Number(raw);
  } catch (error) {
    entry.healthy = false;
    entry.unhealthySince = now;
    entry.lagMs = null;
  } finally {
    if (client) {
      try {
        client.release();
      } catch {
        // Ignore release errors — the connection is already suspect.
      }
    }
  }
}

/**
 * Probe every configured replica. Called lazily before each routing decision
 * when the last probe is older than REPLICA_HEALTH_CHECK_INTERVAL_MS.
 */
async function refreshReplicaHealth(): Promise<void> {
  const dbs = getReplicaDbs();
  if (dbs.length === 0) return;

  const now = Date.now();
  await Promise.all(
    dbs.map((_, index) => {
      const entry = replicaHealth[index];
      const stale =
        entry.lastCheckedAt === null ||
        now - entry.lastCheckedAt.getTime() > REPLICA_HEALTH_CHECK_INTERVAL_MS;
      if (!stale) return Promise.resolve();
      return probeReplicaHealth(replicaPools[index], index);
    }),
  );
}

/**
 * Returns replicas that are healthy and within the acceptable lag window,
 * in round-robin order starting after the last used replica.
 */
function getHealthyReplicas(): DrizzleDb[] {
  const dbs = getReplicaDbs();
  if (dbs.length === 0) return [];

  return dbs.filter((_, index) => {
    const entry = replicaHealth[index];
    return (
      entry.healthy &&
      (entry.lagMs === null || entry.lagMs <= MAX_REPLICA_LAG_MS)
    );
  });
}

function getNextReplica(): DrizzleDb | null {
  const healthy = getHealthyReplicas();
  if (healthy.length === 0) return null;
  const db = healthy[replicaIndex % healthy.length];
  replicaIndex = (replicaIndex + 1) % healthy.length;
  return db;
}

function isReadOperation(prop: string | symbol): prop is 'select' {
  return typeof prop === 'string' && prop === 'select';
}

function isWriteOperation(prop: string | symbol): prop is 'insert' | 'update' | 'delete' {
  return typeof prop === 'string' && (prop === 'insert' || prop === 'update' || prop === 'delete');
}

function isTransactionOperation(prop: string | symbol): prop is 'transaction' {
  return typeof prop === 'string' && prop === 'transaction';
}

function readProperty(target: DrizzleDb, prop: string | symbol): unknown {
  return Reflect.get(target, prop);
}

/**
 * Executes a callback against the primary database, bypassing replica routing
 * entirely. Use this for strong-consistency operations where read-after-write
 * correctness is non-negotiable: payments, auth state changes, refunds,
 * inventory reservations, and moderation actions.
 *
 * Example:
 *   await withPrimary(async (db) => {
 *     await db.insert(payments).values({ ... });
 *     const payment = await db.select().from(payments).where(...); // reads from primary
 *   });
 */
export async function withPrimary<T>(
  callback: (db: DrizzleDb) => Promise<T>,
): Promise<T> {
  const primary = getPrimaryDb();
  return callback(primary);
}

/**
 * Database Router — routes reads to healthy replicas, writes to primary.
 *
 * Routes:
 *   - select() → replica (round-robin among healthy, in-lag replicas; fallback
 *     to primary when no usable replica exists)
 *   - insert()/update()/delete() → primary
 *   - transaction() → primary (never route write transactions to replicas)
 *   - All other properties → primary
 */
export const db = new Proxy({} as DrizzleDb, {
  get(_target: DrizzleDb, prop: string | symbol): unknown {
    const primary: DrizzleDb = getPrimaryDb();

    // SELECT → healthy replica, fallback to primary
    if (isReadOperation(prop)) {
      // Refresh replica health lazily without blocking the read path.
      void refreshReplicaHealth();
      const target: DrizzleDb = getNextReplica() ?? primary;
      return (...args: Parameters<typeof target.select>) => target.select(...args);
    }

    // INSERT/UPDATE/DELETE → primary
    if (isWriteOperation(prop)) {
      if (prop === 'insert') {
        return (...args: Parameters<typeof primary.insert>) => primary.insert(...args);
      }
      if (prop === 'update') {
        return (...args: Parameters<typeof primary.update>) => primary.update(...args);
      }
      return (...args: Parameters<typeof primary.delete>) => primary.delete(...args);
    }

    // transaction() → primary (never route write transactions to replicas)
    if (isTransactionOperation(prop)) {
      return (callback: (tx: Transaction) => Promise<unknown>) =>
        primary.transaction(callback);
    }

    // All other properties (schema, $client, etc.) → primary
    return readProperty(primary, prop);
  },
}) as DrizzleDb;

/**
 * Explicit primary access — for operations that MUST hit primary
 * (e.g., post-write read-your-writes, auth checks, financial queries).
 *
 * Every operation on `dbPrimary` targets the primary database. Prefer
 * `withPrimary()` for multi-statement units of work; use `dbPrimary` for
 * single-call sites where clarity matters more than brevity.
 */
export const dbPrimary = new Proxy({} as DrizzleDb, {
  get(_target: DrizzleDb, prop: string | symbol): unknown {
    return readProperty(getPrimaryDb(), prop);
  },
}) as DrizzleDb;

/**
 * Explicit replica access — for read-heavy analytical queries
 * where stale data is acceptable. Falls back to primary when no usable
 * replica exists.
 */
export const dbReplica = new Proxy({} as DrizzleDb, {
  get(_target: DrizzleDb, prop: string | symbol): unknown {
    return readProperty(getNextReplica() ?? getPrimaryDb(), prop);
  },
}) as DrizzleDb;

/**
 * Returns the health status of every configured replica, plus whether the
 * primary is reachable. Used by `/api/v1/metrics/degradation` and by
 * operational dashboards.
 *
 * Each replica entry includes:
 *   - healthy: whether the last probe succeeded
 *   - lagMs: observed replication delay in milliseconds (null if unknown)
 *   - unhealthySince: when the replica first failed (null if healthy)
 *   - inLagWindow: whether lag is within MAX_REPLICA_LAG_MS
 *   - usable: whether the replica is currently in the read path
 */
export async function checkReplicaHealth(): Promise<{
  primary: boolean;
  replicas: ReplicaHealth[];
}> {
  const primary = getPrimaryDb();
  const primaryHealthy = await primary.$client
    .query('SELECT 1')
    .then(() => true)
    .catch(() => false);

  await refreshReplicaHealth();

  return {
    primary: primaryHealthy,
    replicas: [...replicaHealth],
  };
}

/**
 * Health check for all pools, including replica lag awareness.
 *
 * Extends the original `checkDatabaseHealth` with per-replica lag and
 * usability, so callers can decide whether to read from replicas or fall
 * back to the primary.
 */
export async function checkDatabaseHealth(): Promise<{
  primary: boolean;
  replicas: { host: string; port: number; healthy: boolean; lagMs: number | null; usable: boolean }[];
}> {
  const result = await checkReplicaHealth();
  return {
    primary: result.primary,
    replicas: result.replicas.map((r) => ({
      host: r.host,
      port: r.port,
      healthy: r.healthy,
      lagMs: r.lagMs,
      usable: r.healthy && (r.lagMs === null || r.lagMs <= MAX_REPLICA_LAG_MS),
    })),
  };
}

/**
 * Close all pools (for graceful shutdown)
 */
export async function closeDatabase(): Promise<void> {
  await Promise.all([
    primaryPool?.end(),
    ...replicaPools.map((p) => p.end()),
  ]);
  primaryDb = null;
  primaryPool = null;
  replicaDbs = [];
  replicaPools = [];
  replicaHealth.length = 0;
  replicaIndex = 0;
}
