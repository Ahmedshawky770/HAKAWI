import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest';
import { Logger } from '@nestjs/common';
import type { Pipeline } from 'ioredis';

import { VALKEY_TTL_MISSING, VALKEY_TTL_PERSISTENT, ValkeyService } from './valkey.service.ts';

type RedisOptions = { host: string; port: number; password: string | undefined };

type MockRedis = {
  options: RedisOptions;
  ping: Mock<() => Promise<string>>;
  get: Mock<(key: string) => Promise<string | null>>;
  set: Mock<(key: string, value: string) => Promise<string>>;
  setex: Mock<(key: string, seconds: number, value: string) => Promise<string>>;
  del: Mock<(key: string) => Promise<number>>;
  exists: Mock<(key: string) => Promise<number>>;
  incr: Mock<(key: string) => Promise<number>>;
  expire: Mock<(key: string, seconds: number) => Promise<number>>;
  ttl: Mock<(key: string) => Promise<number>>;
  eval: Mock<(script: string, keyCount: number, ...rest: string[]) => Promise<unknown>>;
  multi: Mock<() => Pipeline>;
  sadd: Mock<(key: string, member: string) => Promise<number>>;
  smembers: Mock<(key: string) => Promise<string[]>>;
  srem: Mock<(key: string, member: string) => Promise<number>>;
  scan: Mock<
    (cursor: string, match: string, pattern: string, count: string, size: string) => Promise<[string, string[]]>
  >;
  hset: Mock<(key: string, field: string, value: string) => Promise<number>>;
  hmset: Mock<(key: string, values: Record<string, string>) => Promise<string>>;
  quit: Mock<() => Promise<string>>;
};

const registry = vi.hoisted(() => ({
  created: [] as MockRedis[],
  failure: null as null | 'construct' | 'ping' | 'ping-string',
}));

vi.mock('ioredis', () => {
  class Redis {
    options: RedisOptions;
    ping: MockRedis['ping'];
    get: MockRedis['get'];
    set: MockRedis['set'];
    setex: MockRedis['setex'];
    del: MockRedis['del'];
    exists: MockRedis['exists'];
    incr: MockRedis['incr'];
    expire: MockRedis['expire'];
    ttl: MockRedis['ttl'];
    eval: MockRedis['eval'];
    multi: MockRedis['multi'];
    sadd: MockRedis['sadd'];
    smembers: MockRedis['smembers'];
    srem: MockRedis['srem'];
    scan: MockRedis['scan'];
    hset: MockRedis['hset'];
    hmset: MockRedis['hmset'];
    quit: MockRedis['quit'];

    constructor(options: RedisOptions) {
      if (registry.failure === 'construct') {
        throw new Error('connect ECONNREFUSED 127.0.0.1:6379');
      }

      this.options = options;
      this.ping = vi.fn(async () => {
        if (registry.failure === 'ping') {
          return Promise.reject(new Error('ping timeout'));
        }
        if (registry.failure === 'ping-string') {
          return Promise.reject('socket hang up');
        }
        return 'PONG';
      });
      this.get = vi.fn(async () => null);
      this.set = vi.fn(async () => 'OK');
      this.setex = vi.fn(async () => 'OK');
      this.del = vi.fn(async () => 1);
      this.exists = vi.fn(async () => 0);
      this.incr = vi.fn(async () => 1);
      this.expire = vi.fn(async () => 1);
      this.ttl = vi.fn(async () => 0);
      this.eval = vi.fn(async () => null);
      this.multi = vi.fn(() => ({ isPipeline: true, marker: 'pipeline' }) as unknown as Pipeline);
      this.sadd = vi.fn(async () => 1);
      this.smembers = vi.fn(async () => []);
      this.srem = vi.fn(async () => 1);
      this.scan = vi.fn(async () => ['0', []]);
      this.hset = vi.fn(async () => 1);
      this.hmset = vi.fn(async () => 'OK');
      this.quit = vi.fn(async () => 'OK');

      registry.created.push(this as unknown as MockRedis);
    }
  }

  return { Redis };
});

const ENV_KEYS = [
  'VALKEY_HOST',
  'VALKEY_PORT',
  'VALKEY_PASSWORD',
  'REDIS_HOST',
  'REDIS_PORT',
  'REDIS_PASSWORD',
  'NODE_ENV',
] as const;

describe('ValkeyService', () => {
  let service: ValkeyService;
  let savedEnv: Record<string, string | undefined>;
  let logSpy: Mock;
  let errorSpy: Mock;

  beforeEach(() => {
    savedEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
    for (const key of ENV_KEYS) {
      delete process.env[key];
    }
    process.env.NODE_ENV = 'test';
    registry.created.length = 0;
    registry.failure = null;
    logSpy = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    errorSpy = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    service = new ValkeyService();
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      const value = savedEnv[key];
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
    vi.restoreAllMocks();
  });

  function connected(): MockRedis {
    return (
      registry.created[0] ??
      (() => {
        throw new Error('no Redis client was constructed');
      })()
    );
  }

  describe('onModuleInit', () => {
    it('should connect and probe the server with PING', async () => {
      await service.onModuleInit();

      expect(registry.created).toHaveLength(1);
      expect(connected().ping).toHaveBeenCalledTimes(1);
      expect(logSpy).toHaveBeenCalledWith('Valkey connected');
    });

    it('should default to localhost:6379 with no password when nothing is configured', async () => {
      await service.onModuleInit();

      expect(connected().options).toEqual({ host: 'localhost', port: 6379, password: undefined });
    });

    it('should prefer VALKEY_* over REDIS_* when both are set', async () => {
      process.env.VALKEY_HOST = 'valkey-primary';
      process.env.VALKEY_PORT = '6380';
      process.env.VALKEY_PASSWORD = 'valkey-secret';
      process.env.REDIS_HOST = 'redis-legacy';
      process.env.REDIS_PORT = '6399';
      process.env.REDIS_PASSWORD = 'redis-secret';

      await service.onModuleInit();

      expect(connected().options).toEqual({ host: 'valkey-primary', port: 6380, password: 'valkey-secret' });
    });

    it('should fall back to REDIS_* when VALKEY_* is absent', async () => {
      process.env.REDIS_HOST = 'redis-legacy';
      process.env.REDIS_PORT = '6399';
      process.env.REDIS_PASSWORD = 'redis-secret';

      await service.onModuleInit();

      expect(connected().options).toEqual({ host: 'redis-legacy', port: 6399, password: 'redis-secret' });
    });

    it('should not pass a password through when none is configured', async () => {
      process.env.VALKEY_HOST = 'valkey-primary';

      await service.onModuleInit();

      expect(connected().options.password).toBeUndefined();
    });

    it('should swallow a connection failure in the test environment and stay usable', async () => {
      registry.failure = 'ping';
      process.env.NODE_ENV = 'test';

      await expect(service.onModuleInit()).resolves.toBeUndefined();

      expect(errorSpy).toHaveBeenCalledWith('Failed to connect to Valkey', expect.stringContaining('ping timeout'));
      await expect(service.get('any')).resolves.toBeNull();
    });

    it('should swallow a constructor failure in the test environment', async () => {
      registry.failure = 'construct';
      process.env.NODE_ENV = 'test';

      await expect(service.onModuleInit()).resolves.toBeUndefined();
      expect(errorSpy).toHaveBeenCalledWith('Failed to connect to Valkey', expect.stringContaining('ECONNREFUSED'));
    });

    it('should rethrow a connection failure outside the test environment', async () => {
      registry.failure = 'ping';
      process.env.NODE_ENV = 'production';

      await expect(service.onModuleInit()).rejects.toThrow('ping timeout');
    });

    it('should rethrow a constructor failure outside the test environment', async () => {
      registry.failure = 'construct';
      process.env.NODE_ENV = 'development';

      await expect(service.onModuleInit()).rejects.toThrow('ECONNREFUSED');
    });

    it('should stringify a non-Error rejection before logging it', async () => {
      registry.failure = 'ping-string';
      process.env.NODE_ENV = 'test';

      await expect(service.onModuleInit()).resolves.toBeUndefined();

      expect(errorSpy).toHaveBeenCalledWith('Failed to connect to Valkey', 'socket hang up');
    });

    it('should log the stack of an Error rejection', async () => {
      registry.failure = 'ping';
      process.env.NODE_ENV = 'test';

      await service.onModuleInit();

      expect(errorSpy).toHaveBeenCalledWith(
        'Failed to connect to Valkey',
        expect.stringContaining('Error: ping timeout'),
      );
    });
  });

  describe('onModuleDestroy', () => {
    it('should quit a live client', async () => {
      await service.onModuleInit();

      await service.onModuleDestroy();

      expect(connected().quit).toHaveBeenCalledTimes(1);
      expect(logSpy).toHaveBeenCalledWith('Valkey disconnected');
    });

    it('should do nothing when there is no client', async () => {
      await expect(service.onModuleDestroy()).resolves.toBeUndefined();

      expect(registry.created).toHaveLength(0);
    });
  });

  describe('connected command forwarding', () => {
    beforeEach(async () => {
      await service.onModuleInit();
    });

    it('should read a string value', async () => {
      connected().get.mockResolvedValue('session-payload');

      await expect(service.get('session:abc')).resolves.toBe('session-payload');
      expect(connected().get).toHaveBeenCalledWith('session:abc');
    });

    it('should return null for a missing key', async () => {
      connected().get.mockResolvedValue(null);

      await expect(service.get('session:missing')).resolves.toBeNull();
    });

    it('should use SETEX when a TTL is supplied so the key cannot outlive it', async () => {
      await service.set('session:abc', 'payload', 900);

      expect(connected().setex).toHaveBeenCalledWith('session:abc', 900, 'payload');
      expect(connected().set).not.toHaveBeenCalled();
    });

    it('should use plain SET when no TTL is supplied', async () => {
      await service.set('blocklist:1.2.3.4', 'banned');

      expect(connected().set).toHaveBeenCalledWith('blocklist:1.2.3.4', 'banned');
      expect(connected().setex).not.toHaveBeenCalled();
    });

    it('should treat a zero TTL as no TTL and use plain SET', async () => {
      await service.set('key', 'value', 0);

      expect(connected().set).toHaveBeenCalledWith('key', 'value');
      expect(connected().setex).not.toHaveBeenCalled();
    });

    it('should delete a key', async () => {
      await service.del('session:abc');

      expect(connected().del).toHaveBeenCalledWith('session:abc');
    });

    it('should translate EXISTS 1 into true', async () => {
      connected().exists.mockResolvedValue(1);

      await expect(service.exists('session:abc')).resolves.toBe(true);
    });

    it.each([0, 2])('should translate EXISTS %i into false', async (reply) => {
      connected().exists.mockResolvedValue(reply);

      await expect(service.exists('session:abc')).resolves.toBe(false);
    });

    it('should increment a counter and return the new value', async () => {
      connected().incr.mockResolvedValue(7);

      await expect(service.incr('ratelimit:1.2.3.4')).resolves.toBe(7);
      expect(connected().incr).toHaveBeenCalledWith('ratelimit:1.2.3.4');
    });

    it('should set an expiry on an existing key', async () => {
      await service.expire('ratelimit:1.2.3.4', 60);

      expect(connected().expire).toHaveBeenCalledWith('ratelimit:1.2.3.4', 60);
    });

    it('should read the remaining TTL of a key in seconds', async () => {
      connected().ttl.mockResolvedValue(42);

      await expect(service.ttl('throttle:hits:auth:ip:1.2.3.4')).resolves.toBe(42);
      expect(connected().ttl).toHaveBeenCalledWith('throttle:hits:auth:ip:1.2.3.4');
    });

    it('should surface the sentinel replies for a missing key and a key without a TTL', async () => {
      connected().ttl.mockResolvedValueOnce(VALKEY_TTL_MISSING).mockResolvedValueOnce(VALKEY_TTL_PERSISTENT);

      await expect(service.ttl('gone')).resolves.toBe(-2);
      await expect(service.ttl('persistent')).resolves.toBe(-1);
    });

    it('should run a Lua script with the key count ioredis expects', async () => {
      connected().eval.mockResolvedValue(3);

      await expect(service.eval('return redis.call("incr", KEYS[1])', ['counter:1'])).resolves.toBe(3);
      expect(connected().eval).toHaveBeenCalledWith('return redis.call("incr", KEYS[1])', 1, 'counter:1');
    });

    it('should append the arguments after the keys when evaluating a script', async () => {
      await service.eval('return ARGV[1]', ['counter:1', 'counter:2'], ['60', '5']);

      expect(connected().eval).toHaveBeenCalledWith('return ARGV[1]', 2, 'counter:1', 'counter:2', '60', '5');
    });

    it('should return the pipeline a transaction starts on', async () => {
      const pipeline = await service.multi();

      expect(connected().multi).toHaveBeenCalledTimes(1);
      expect(pipeline).toEqual({ isPipeline: true, marker: 'pipeline' });
    });

    it('should refuse a transaction that did not start a pipeline', async () => {
      connected().multi.mockReturnValueOnce('OK' as unknown as Pipeline);

      await expect(service.multi()).rejects.toThrow('Valkey multi() did not return a pipeline');
    });

    it('should answer PING from a live client', async () => {
      await expect(service.ping()).resolves.toBe('PONG');
    });

    it('should add a member to a set and return the cardinality', async () => {
      connected().sadd.mockResolvedValue(2);

      await expect(service.sadd('waf:blocked', '10.0.0.1')).resolves.toBe(2);
      expect(connected().sadd).toHaveBeenCalledWith('waf:blocked', '10.0.0.1');
    });

    it('should list set members', async () => {
      connected().smembers.mockResolvedValue(['10.0.0.1', '10.0.0.2']);

      await expect(service.smembers('waf:blocked')).resolves.toEqual(['10.0.0.1', '10.0.0.2']);
      expect(connected().smembers).toHaveBeenCalledWith('waf:blocked');
    });

    it('should remove a member from a set and return the cardinality', async () => {
      connected().srem.mockResolvedValue(1);

      await expect(service.srem('waf:blocked', '10.0.0.1')).resolves.toBe(1);
      expect(connected().srem).toHaveBeenCalledWith('waf:blocked', '10.0.0.1');
    });

    it('should write a single hash field', async () => {
      await service.hSet('oauth:state:abc', 'redirectTo', '/dashboard');

      expect(connected().hset).toHaveBeenCalledWith('oauth:state:abc', 'redirectTo', '/dashboard');
    });

    it('should write several hash fields at once', async () => {
      const values = { scope: 'read write', state: 'xyz', nonce: 'n-1' };

      await service.hSetMultiple('oauth:state:abc', values);

      expect(connected().hmset).toHaveBeenCalledWith('oauth:state:abc', values);
    });

    it('should scan every page of a multi-page cursor walk', async () => {
      connected()
        .scan.mockResolvedValueOnce(['128', ['session:1', 'session:2']])
        .mockResolvedValueOnce(['512', ['session:3']])
        .mockResolvedValueOnce(['0', ['session:4', 'session:5']]);

      await expect(service.keys('session:*')).resolves.toEqual([
        'session:1',
        'session:2',
        'session:3',
        'session:4',
        'session:5',
      ]);
    });

    it('should follow the cursor returned by each page', async () => {
      connected()
        .scan.mockResolvedValueOnce(['17', ['a']])
        .mockResolvedValueOnce(['0', ['b']]);

      await service.keys('session:*');

      expect(connected().scan).toHaveBeenCalledTimes(2);
      expect(connected().scan).toHaveBeenNthCalledWith(1, '0', 'MATCH', 'session:*', 'COUNT', '100');
      expect(connected().scan).toHaveBeenNthCalledWith(2, '17', 'MATCH', 'session:*', 'COUNT', '100');
    });

    it('should stop after a single page when the cursor comes back as 0', async () => {
      connected().scan.mockResolvedValue(['0', ['only']]);

      await expect(service.keys('session:*')).resolves.toEqual(['only']);
      expect(connected().scan).toHaveBeenCalledTimes(1);
    });

    it('should return an empty list when the keyspace has no match', async () => {
      connected().scan.mockResolvedValue(['0', []]);

      await expect(service.keys('nothing:*')).resolves.toEqual([]);
    });
  });

  describe('fail-open when the client is null', () => {
    beforeEach(() => {
      registry.failure = 'construct';
    });

    it('should never construct a client', async () => {
      await service.onModuleInit();

      expect(registry.created).toHaveLength(0);
    });

    it('should return null from get instead of throwing', async () => {
      await service.onModuleInit();

      await expect(service.get('session:abc')).resolves.toBeNull();
    });

    it('should make set a silent no-op', async () => {
      await service.onModuleInit();

      await expect(service.set('session:abc', 'payload', 900)).resolves.toBeUndefined();
      await expect(service.set('session:abc', 'payload')).resolves.toBeUndefined();
    });

    it('should make del and expire silent no-ops', async () => {
      await service.onModuleInit();

      await expect(service.del('session:abc')).resolves.toBeUndefined();
      await expect(service.expire('session:abc', 60)).resolves.toBeUndefined();
    });

    it('should report exists as false', async () => {
      await service.onModuleInit();

      await expect(service.exists('session:abc')).resolves.toBe(false);
    });

    it('should report incr as zero', async () => {
      await service.onModuleInit();

      await expect(service.incr('ratelimit:1.2.3.4')).resolves.toBe(0);
    });

    it('should report ttl as the missing-key sentinel', async () => {
      await service.onModuleInit();

      await expect(service.ttl('throttle:hits:auth:ip:1.2.3.4')).resolves.toBe(VALKEY_TTL_MISSING);
    });

    it('should report eval as null so callers can fail open', async () => {
      await service.onModuleInit();

      await expect(service.eval('return 1', ['counter:1'])).resolves.toBeNull();
    });

    it('should throw from multi because there is no pipeline to hand back', async () => {
      await service.onModuleInit();

      await expect(service.multi()).rejects.toThrow('Valkey client not initialized');
    });

    it('should throw from ping so callers can detect the outage', async () => {
      await service.onModuleInit();

      await expect(service.ping()).rejects.toThrow('Valkey client not initialized');
    });

    it('should report set operations as empty', async () => {
      await service.onModuleInit();

      await expect(service.sadd('waf:blocked', '10.0.0.1')).resolves.toBe(0);
      await expect(service.smembers('waf:blocked')).resolves.toEqual([]);
      await expect(service.srem('waf:blocked', '10.0.0.1')).resolves.toBe(0);
    });

    it('should report keys as an empty list', async () => {
      await service.onModuleInit();

      await expect(service.keys('session:*')).resolves.toEqual([]);
    });

    it('should make hash writes silent no-ops', async () => {
      await service.onModuleInit();

      await expect(service.hSet('oauth:state:abc', 'k', 'v')).resolves.toBeUndefined();
      await expect(service.hSetMultiple('oauth:state:abc', { k: 'v' })).resolves.toBeUndefined();
    });
  });
});
