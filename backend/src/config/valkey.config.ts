import { registerAs } from '@nestjs/config';
import { z } from 'zod';

/**
 * The Valkey connection, resolved once for the whole application (Principle #9: one source of
 * truth for a value, not three readers that each default differently).
 *
 * `VALKEY_*` is the documented name and what `docker-compose.yml` and `.env.example` set.
 * `REDIS_*` is accepted as a fallback because Valkey is Redis-wire-compatible and an operator
 * migrating from a Redis deployment will already have those variables set.
 *
 * WHY THE FALLBACK MATTERS: `ValkeyService` and this config both honour `VALKEY_*` then
 * `REDIS_*`. The Socket.IO adapter previously read ONLY `REDIS_*`, so under Docker Compose —
 * which sets `VALKEY_HOST=valkey` and nothing else — the cache and the throttler connected to the
 * right place while the websocket adapter quietly fell back to `localhost:6379` unauthenticated.
 * On one instance that is invisible; on several it is silent loss of cross-instance fan-out.
 */
const envSchema = z.object({
  VALKEY_HOST: z.string().optional(),
  REDIS_HOST: z.string().optional(),
  VALKEY_PORT: z.coerce.number().optional(),
  REDIS_PORT: z.coerce.number().optional(),
  VALKEY_PASSWORD: z.string().optional(),
  REDIS_PASSWORD: z.string().optional(),
});

export interface ValkeyConnection {
  readonly host: string;
  readonly port: number;
  readonly password: string | undefined;
}

export function buildValkeyConnection(source: NodeJS.ProcessEnv = process.env): ValkeyConnection {
  const env = envSchema.parse(source);
  return {
    host: env.VALKEY_HOST || env.REDIS_HOST || 'localhost',
    port: env.VALKEY_PORT ?? env.REDIS_PORT ?? 6379,
    // An empty string is "no password", not "the password is empty" — ioredis sends AUTH for an
    // empty string and a server without requirepass rejects the connection.
    password: env.VALKEY_PASSWORD || env.REDIS_PASSWORD || undefined,
  };
}

export default registerAs('valkey', () => buildValkeyConnection());
