import { registerAs } from '@nestjs/config';
import { z } from 'zod';

const envSchema = z.object({
  // Primary (writes) - required
  DB_PRIMARY_HOST: z.string().default('localhost'),
  DB_PRIMARY_PORT: z.coerce.number().default(5432),
  DB_PRIMARY_NAME: z.string().default('hakawi'),
  DB_PRIMARY_USER: z.string().default('postgres'),
  DB_PRIMARY_PASSWORD: z.string().default('postgres'),

  // Replicas (reads) - optional, comma-separated hosts
  DB_REPLICA_HOSTS: z.string().optional(),
  DB_REPLICA_PORT: z.coerce.number().default(5432),
  DB_REPLICA_NAME: z.string().default('hakawi'),
  DB_REPLICA_USER: z.string().default('postgres'),
  DB_REPLICA_PASSWORD: z.string().default('postgres'),

  // PgBouncer endpoints (used by application router)
  PGBOUNCER_PRIMARY_HOST: z.string().optional(),
  PGBOUNCER_PRIMARY_PORT: z.coerce.number().default(6432),
  PGBOUNCER_REPLICA_HOST: z.string().optional(),
  PGBOUNCER_REPLICA_PORT: z.coerce.number().default(6432),

  // Legacy compatibility (used by migration runner)
  DB_HOST: z.string().default('localhost'),
  DB_PORT: z.coerce.number().default(5432),
  DB_NAME: z.string().default('hakawi'),
  DB_USER: z.string().default('postgres'),
  DB_PASSWORD: z.string().default('postgres'),
});

export type DatabaseConfig = z.infer<typeof envSchema>;

export default registerAs('database', () => {
  const env = envSchema.parse(process.env);

  const replicaHosts = env.DB_REPLICA_HOSTS
    ? env.DB_REPLICA_HOSTS.split(',').map((h) => h.trim())
    : [];

  return {
    // Primary (writes)
    primary: {
      host: env.DB_PRIMARY_HOST,
      port: env.DB_PRIMARY_PORT,
      database: env.DB_PRIMARY_NAME,
      user: env.DB_PRIMARY_USER,
      password: env.DB_PRIMARY_PASSWORD,
    },

    // Replicas (reads) - array of hosts
    replicas: replicaHosts.length > 0
      ? replicaHosts.map((host) => ({
          host,
          port: env.DB_REPLICA_PORT,
          database: env.DB_REPLICA_NAME,
          user: env.DB_REPLICA_USER,
          password: env.DB_REPLICA_PASSWORD,
        }))
      : [],

    // PgBouncer endpoints (for application router)
    pgbouncer: {
      primary: env.PGBOUNCER_PRIMARY_HOST
        ? {
            host: env.PGBOUNCER_PRIMARY_HOST,
            port: env.PGBOUNCER_PRIMARY_PORT,
          }
        : null,
      replica: env.PGBOUNCER_REPLICA_HOST
        ? {
            host: env.PGBOUNCER_REPLICA_HOST,
            port: env.PGBOUNCER_REPLICA_PORT,
          }
        : null,
    },

    // Legacy compatibility (migration runner)
    legacy: {
      host: env.DB_HOST,
      port: env.DB_PORT,
      database: env.DB_NAME,
      user: env.DB_USER,
      password: env.DB_PASSWORD,
    },

    // Helper: are replicas configured?
    hasReplicas: replicaHosts.length > 0,
  };
});

export const databaseConfig = envSchema;
