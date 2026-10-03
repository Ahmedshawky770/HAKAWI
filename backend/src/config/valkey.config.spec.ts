import { describe, it, expect } from 'vitest';

import { buildValkeyConnection } from './valkey.config.ts';

describe('buildValkeyConnection', () => {
  it('resolves the VALKEY_* names that docker-compose and .env.example actually set', () => {
    // The regression this guards: the Socket.IO adapter read only REDIS_*, so a Compose
    // deployment pointed the websocket fan-out at localhost:6379 while the cache connected to the
    // Valkey service. Invisible on one instance, silent fan-out loss on several.
    expect(buildValkeyConnection({ VALKEY_HOST: 'valkey', VALKEY_PORT: '6379', VALKEY_PASSWORD: 's3cret' })).toEqual({
      host: 'valkey',
      port: 6379,
      password: 's3cret',
    });
  });

  it('falls back to the REDIS_* names for an operator migrating from Redis', () => {
    expect(buildValkeyConnection({ REDIS_HOST: 'redis', REDIS_PORT: '6380', REDIS_PASSWORD: 'pw' })).toEqual({
      host: 'redis',
      port: 6380,
      password: 'pw',
    });
  });

  it('prefers VALKEY_* when both are present', () => {
    const resolved = buildValkeyConnection({
      VALKEY_HOST: 'valkey',
      VALKEY_PORT: '6379',
      REDIS_HOST: 'redis',
      REDIS_PORT: '6380',
    });

    expect(resolved.host).toBe('valkey');
    expect(resolved.port).toBe(6379);
  });

  it('treats an empty password as "no password" rather than sending an empty AUTH', () => {
    // docker-compose passes VALKEY_PASSWORD as an empty string when none is set. ioredis issues
    // AUTH for an empty string, and a server without requireauth rejects the connection.
    expect(buildValkeyConnection({ VALKEY_PASSWORD: '' }).password).toBeUndefined();
  });

  it('defaults to localhost:6379 with no password when nothing is configured', () => {
    expect(buildValkeyConnection({})).toEqual({ host: 'localhost', port: 6379, password: undefined });
  });
});
