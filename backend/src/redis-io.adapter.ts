import { ModuleRef } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { Redis } from 'ioredis';
import type { ServerOptions } from 'socket.io';

/**
 * Socket.IO's Redis adapter, so a message published on one instance reaches clients connected to
 * the others.
 *
 * WHY IT READS THE SHARED CONFIG: this used to read `process.env.REDIS_HOST` and friends
 * directly, with no `VALKEY_*` fallback, while `docker-compose.yml` and `.env.example` set only
 * `VALKEY_*`. Under Compose the cache and the rate limiter therefore connected to the Valkey
 * service while this adapter fell through to `localhost:6379` — invisible on a single instance,
 * and silent loss of cross-instance event fan-out on more than one. The connection now comes from
 * `valkey.config`, which is the same source `ValkeyService` resolves (Principle #9), so the two
 * cannot disagree about where Valkey is or whether it needs a password.
 */
export class RedisIoAdapter extends IoAdapter {
  private readonly adapter: ReturnType<typeof createAdapter>;

  constructor(
    private readonly moduleRef: ModuleRef,
    configService: ConfigService,
  ) {
    super(moduleRef);

    const host = configService.get<string>('valkey.host', 'localhost');
    const port = configService.get<number>('valkey.port', 6379);
    const password = configService.get<string>('valkey.password');

    const pubClient = new Redis({ host, port, password });
    const subClient = pubClient.duplicate();
    this.adapter = createAdapter(pubClient, subClient);
  }

  createIOServer(port: number, options?: ServerOptions | undefined): ReturnType<IoAdapter['createIOServer']> {
    const server = super.createIOServer(port, options);
    server.adapter(this.adapter);
    return server;
  }
}
