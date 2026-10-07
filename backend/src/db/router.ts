import { drizzle, type NodePgDatabase, type NodePgTransaction } from 'drizzle-orm/node-postgres';
import { Pool, PoolConfig } from 'pg';
import * as schema from '../db/schema/index.ts';

/**
 * Database Router — Read/Write Splitting (Principle #9: Single Source of Truth)
 *
 * Uses a Proxy for transparent read/write splitting.
 * Routes:
 *   - select() → replica (round-robin, fallback to primary)
 *   - insert()/update()/delete() → primary
 *   - transaction() → primary
 *   - All other methods → primary
 */

type DrizzleDb = NodePgDatabase<typeof schema> & {
  $client: Pool;
};

type Transaction = NodePgTransaction<typeof schema>;

let primaryDb: DrizzleDb | null = null;
let primaryPool: Pool | null = null;
let replicaPools: Pool[] = [];
let replicaDbs: DrizzleDb[] = [];
let replicaIndex = 0;

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
  }
  return replicaDbs;
}

function getNextReplica(): DrizzleDb | null {
  const replicas = getReplicaDbs();
  if (replicas.length === 0) return null;
  const db = replicas[replicaIndex];
  replicaIndex = (replicaIndex + 1) % replicas.length;
  return db;
}

function isReadOperation(prop: string | symbol): boolean {
  return typeof prop === 'string' && prop === 'select';
}

function isWriteOperation(prop: string | symbol): boolean {
  return typeof prop === 'string' && (prop === 'insert' || prop === 'update' || prop === 'delete');
}

function isTransactionOperation(prop: string | symbol): boolean {
  return typeof prop === 'string' && prop === 'transaction';
}

/**
 * Database Router — routes reads to replicas, writes to primary.
 *
 * Uses a Proxy for transparent read/write splitting.
 * Routes:
 *   - select() → replica (round-robin, fallback to primary)
 *   - insert()/update()/delete() → primary
 *   - transaction() → primary
 *   - All other methods → primary
 */
export const db = new Proxy({} as DrizzleDb, {
  get(_target, prop) {
    const primary = getPrimaryDb();
    const replica = getNextReplica();

    // SELECT → replica (fallback to primary if no replicas)
    if (isReadOperation(prop)) {
      const target = replica ?? getPrimaryDb();
      const key = prop as string;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (...args: unknown[]) => (target as any)[key](...args);
    }

    // INSERT/UPDATE/DELETE → primary
    if (isWriteOperation(prop)) {
      const key = prop as string;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (...args: unknown[]) => (getPrimaryDb() as any)[key](...args);
    }

    // transaction() → primary (never route write transactions to replicas)
    if (isTransactionOperation(prop)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (callback: (tx: Transaction) => Promise<unknown>) => getPrimaryDb().transaction(callback as any);
    }

    // All other properties (schema, $client, etc.) → primary
    return (getPrimaryDb() as any)[prop];
  },
}) as DrizzleDb;

/**
 * Explicit primary access — for operations that MUST hit primary
 * (e.g., post-write read-your-writes, auth checks, financial queries)
 */
export const dbPrimary = new Proxy({} as DrizzleDb, {
  get(_target, prop) {
    const primary = getPrimaryDb();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (primary as any)[prop];
  },
}) as DrizzleDb;

/**
 * Explicit replica access — for read-heavy analytical queries
 * where stale data is acceptable.
 */
export const dbReplica = new Proxy({} as DrizzleDb, {
  get(_target, prop) {
    const replica = getNextReplica();
    if (replica) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (replica as any)[prop];
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (getPrimaryDb() as any)[prop];
  },
}) as DrizzleDb;

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
}

/**
 * Health check for all pools
 */
export async function checkDatabaseHealth(): Promise<{
  primary: boolean;
  replicas: boolean[];
}> {
  const primary = getPrimaryDb();
  const replicas = getReplicaDbs();

  const primaryHealthy = await primary.$client
    .query('SELECT 1')
    .then(() => true)
    .catch(() => false);

  const replicaHealthy = await Promise.all(
    replicas.map((r) =>
      r.$client
        .query('SELECT 1')
        .then(() => true)
        .catch(() => false)
    )
  );

  return { primary: primaryHealthy, replicas: replicaHealthy };
}