import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { S3Client } from '@aws-sdk/client-s3';

import type { CircuitBreakerService } from '../../common/resilience/circuit-breaker.service.ts';
import { WinstonLoggerService } from '../../common/services/winston-logger.service.ts';
import { ValkeyService } from '../../common/services/valkey.service.ts';

import { UploadService } from './upload.service.ts';
import { createS3Client } from './upload.module.ts';

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn((client: unknown) =>
    client === undefined
      ? Promise.reject(new TypeError('getSignedUrl received undefined'))
      : Promise.resolve('https://signed-url.test'),
  ),
}));

/**
 * These tests previously passed `undefined` as the S3 client, which is exactly the condition that
 * broke presigning in production: the service held no client at all and `getSignedUrl` was reached
 * with `undefined`. The mock above now rejects on `undefined`, so a regression to the old shape
 * fails here instead of in a bucket.
 */
describe('UploadService', () => {
  let uploadService: UploadService;
  let mockCircuitBreaker: Partial<CircuitBreakerService>;

  beforeEach(() => {
    process.env.STORAGE_PROVIDER = 's3';
    process.env.STORAGE_BUCKET = 'test-bucket';
    process.env.STORAGE_REGION = 'us-east-1';
    process.env.STORAGE_ACCESS_KEY = 'test-key';
    process.env.STORAGE_SECRET_KEY = 'test-secret';
    process.env.STORAGE_CDN_URL = 'https://cdn.test';

    mockCircuitBreaker = {
      execute: vi.fn().mockImplementation((_name: string, fn: () => Promise<unknown>) => fn()),
    };

    uploadService = new UploadService(
      null as unknown as WinstonLoggerService,
      null as unknown as ValkeyService,
      mockCircuitBreaker as CircuitBreakerService,
      { send: vi.fn() } as unknown as S3Client,
    );
  });

  describe('generatePresignedUrl', () => {
    it('should return a presigned upload URL', async () => {
      const result = await uploadService.generatePresignedUrl('test.png', 'image/png');
      expect(result.url).toBe('https://signed-url.test');
      expect(result.filename).toBeDefined();
      expect(result.mimetype).toBe('image/png');
    });

    it('should sign against the configured bucket and the supplied content type', async () => {
      const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');
      await uploadService.generatePresignedUrl('test.png', 'image/png');

      const call = vi.mocked(getSignedUrl).mock.calls[0] as unknown as [
        unknown,
        { input: Record<string, unknown> },
        unknown,
      ];
      expect(call[1].input.Bucket).toBe('test-bucket');
      expect(call[1].input.ContentType).toBe('image/png');
    });

    it('should reject a content type that is not allow-listed', async () => {
      await expect(uploadService.generatePresignedUrl('evil.exe', 'application/x-msdownload')).rejects.toThrow(
        'File type application/x-msdownload is not allowed',
      );
    });
  });

  describe('createS3Client', () => {
    const originalRegion = process.env.STORAGE_REGION;
    const originalAccessKey = process.env.STORAGE_ACCESS_KEY;
    const originalSecretKey = process.env.STORAGE_SECRET_KEY;

    afterEach(() => {
      process.env.STORAGE_REGION = originalRegion;
      process.env.STORAGE_ACCESS_KEY = originalAccessKey;
      process.env.STORAGE_SECRET_KEY = originalSecretKey;
    });

    it('should build a client from the ambient chain when no static keys are configured', async () => {
      delete process.env.STORAGE_ACCESS_KEY;
      delete process.env.STORAGE_SECRET_KEY;
      process.env.STORAGE_REGION = 'eu-west-1';

      const client = createS3Client();

      expect(client).toBeInstanceOf(S3Client);
      await expect(client.config.region()).resolves.toBe('eu-west-1');
    });

    it('should use static credentials when both keys are present', async () => {
      process.env.STORAGE_ACCESS_KEY = 'AKIA_TEST';
      process.env.STORAGE_SECRET_KEY = 'secret-test';

      const client = createS3Client();

      await expect(client.config.credentials()).resolves.toMatchObject({
        accessKeyId: 'AKIA_TEST',
        secretAccessKey: 'secret-test',
      });
    });

    it('should fall back to the default region when none is configured', async () => {
      delete process.env.STORAGE_REGION;

      await expect(createS3Client().config.region()).resolves.toBe('us-east-1');
    });
  });
});
