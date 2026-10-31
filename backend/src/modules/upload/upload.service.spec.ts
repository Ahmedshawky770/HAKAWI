import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { S3Client } from '@aws-sdk/client-s3';

import type { CircuitBreakerService } from '../../common/resilience/circuit-breaker.service.ts';
import { WinstonLoggerService } from '../../common/services/winston-logger.service.ts';
import { ValkeyService } from '../../common/services/valkey.service.ts';

import { db } from '../../db/index.ts';
import { UploadService } from './upload.service.ts';
import { createS3Client } from './upload.module.ts';

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn((client: unknown) =>
    client === undefined
      ? Promise.reject(new TypeError('getSignedUrl received undefined'))
      : Promise.resolve('https://signed-url.test'),
  ),
}));

vi.mock('../../db/index.ts', () => ({
  db: {
    insert: vi.fn(),
    select: vi.fn(),
    delete: vi.fn(),
  },
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
  let mockS3Client: { send: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    process.env.STORAGE_PROVIDER = 's3';
    process.env.STORAGE_BUCKET = 'test-bucket';
    process.env.STORAGE_REGION = 'us-east-1';
    process.env.STORAGE_ACCESS_KEY = 'test-key';
    process.env.STORAGE_SECRET_KEY = 'test-secret';
    process.env.STORAGE_CDN_URL = 'https://cdn.test';
    delete process.env.MAX_FILE_SIZE;

    mockCircuitBreaker = {
      execute: vi.fn().mockImplementation((_name: string, fn: () => Promise<unknown>) => fn()),
    };

    mockS3Client = { send: vi.fn() };

    uploadService = new UploadService(
      null as unknown as WinstonLoggerService,
      null as unknown as ValkeyService,
      mockCircuitBreaker as CircuitBreakerService,
      mockS3Client as unknown as S3Client,
    );

    vi.mocked(db.insert).mockReset();
    vi.mocked(db.select).mockReset();
    vi.mocked(db.delete).mockReset();
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
    const originalAwsRegion = process.env.AWS_REGION;
    const originalAccessKey = process.env.STORAGE_ACCESS_KEY;
    const originalSecretKey = process.env.STORAGE_SECRET_KEY;

    afterEach(() => {
      process.env.STORAGE_REGION = originalRegion;
      process.env.AWS_REGION = originalAwsRegion;
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
      delete process.env.AWS_REGION;

      await expect(createS3Client().config.region()).resolves.toBe('us-east-1');
    });
  });

  describe('confirmUpload', () => {
    const insertRow = (overrides: Record<string, unknown> = {}) => ({
      id: 'upload-1',
      filename: 'images/test.png',
      originalName: 'test.png',
      mimetype: 'image/png',
      size: 1234,
      url: 'https://cdn.test/images/test.png',
      cdnUrl: 'https://cdn.test/images/test.png',
      uploadedById: 'user-1',
      storyId: undefined,
      ...overrides,
    });

    const setupInsert = (row: Record<string, unknown>) => {
      const returning = vi.fn().mockResolvedValue([row]);
      const values = vi.fn().mockReturnValue({ returning });
      vi.mocked(db.insert).mockReturnValue({ values } as unknown as ReturnType<typeof db.insert>);
      return { values, returning };
    };

    it('records the upload when the object exists in storage', async () => {
      mockS3Client.send.mockResolvedValue({ ContentLength: 1234, ContentType: 'image/png' });
      const row = insertRow();
      setupInsert(row);

      const result = await uploadService.confirmUpload('images/test.png', 'test.png', 'image/png', 1234, 'user-1');

      expect(result).toEqual(row);
      expect(mockS3Client.send).toHaveBeenCalled();
      expect(db.insert).toHaveBeenCalled();
    });

    it('uses the size reported by storage, not the client claim', async () => {
      mockS3Client.send.mockResolvedValue({ ContentLength: 9999, ContentType: 'image/png' });
      const row = insertRow({ size: 9999 });
      const { values } = setupInsert(row);

      await uploadService.confirmUpload('images/test.png', 'test.png', 'image/png', 1, 'user-1');

      const inserted = (values.mock.calls[0] as [Record<string, unknown>])[0];
      expect(inserted.size).toBe(9999);
    });

    it('rejects when the stored content type differs from the declared mimetype', async () => {
      mockS3Client.send.mockResolvedValue({ ContentLength: 1234, ContentType: 'application/pdf' });

      await expect(
        uploadService.confirmUpload('images/test.png', 'test.png', 'image/png', 1234, 'user-1'),
      ).rejects.toThrow('Uploaded content type does not match');
    });

    it('rejects when the stored object exceeds the size limit', async () => {
      process.env.MAX_FILE_SIZE = '100';
      const svc = new UploadService(
        null as unknown as WinstonLoggerService,
        null as unknown as ValkeyService,
        mockCircuitBreaker as CircuitBreakerService,
        mockS3Client as unknown as S3Client,
      );
      mockS3Client.send.mockResolvedValue({ ContentLength: 200, ContentType: 'image/png' });

      await expect(
        svc.confirmUpload('images/test.png', 'test.png', 'image/png', 50, 'user-1'),
      ).rejects.toThrow('File size exceeds maximum');
    });

    it('rejects when the object is missing from storage', async () => {
      mockS3Client.send.mockRejectedValue(new Error('NoSuchKey'));

      await expect(
        uploadService.confirmUpload('images/test.png', 'test.png', 'image/png', 1234, 'user-1'),
      ).rejects.toThrow('Upload not found in storage');
    });

    it('rejects a disallowed mimetype before touching storage', async () => {
      await expect(
        uploadService.confirmUpload('images/test.png', 'test.png', 'application/x-msdownload', 1234, 'user-1'),
      ).rejects.toThrow('File type application/x-msdownload is not allowed');
      expect(mockS3Client.send).not.toHaveBeenCalled();
    });

    it('rejects an oversized client claim before touching storage', async () => {
      process.env.MAX_FILE_SIZE = '100';
      const svc = new UploadService(
        null as unknown as WinstonLoggerService,
        null as unknown as ValkeyService,
        mockCircuitBreaker as CircuitBreakerService,
        mockS3Client as unknown as S3Client,
      );

      await expect(
        svc.confirmUpload('images/test.png', 'test.png', 'image/png', 200, 'user-1'),
      ).rejects.toThrow('File size exceeds maximum');
      expect(mockS3Client.send).not.toHaveBeenCalled();
    });

    it('rejects a filename with traversal segments', async () => {
      await expect(
        uploadService.confirmUpload('../etc/passwd', 'x', 'image/png', 1, 'user-1'),
      ).rejects.toThrow('Filename contains unsupported characters');
    });

    it('enforces ownership through Valkey when configured', async () => {
      const valkey = {
        get: vi.fn().mockResolvedValue('other-user'),
        set: vi.fn(),
        del: vi.fn(),
      };
      const svc = new UploadService(
        null as unknown as WinstonLoggerService,
        valkey as unknown as ValkeyService,
        mockCircuitBreaker as CircuitBreakerService,
        mockS3Client as unknown as S3Client,
      );
      mockS3Client.send.mockResolvedValue({ ContentLength: 1, ContentType: 'image/png' });

      await expect(
        svc.confirmUpload('images/test.png', 'test.png', 'image/png', 1, 'user-1'),
      ).rejects.toThrow('Upload does not belong to this account');
    });

    it('rejects when no pending Valkey entry exists', async () => {
      const valkey = {
        get: vi.fn().mockResolvedValue(null),
        set: vi.fn(),
        del: vi.fn(),
      };
      const svc = new UploadService(
        null as unknown as WinstonLoggerService,
        valkey as unknown as ValkeyService,
        mockCircuitBreaker as CircuitBreakerService,
        mockS3Client as unknown as S3Client,
      );
      mockS3Client.send.mockResolvedValue({ ContentLength: 1, ContentType: 'image/png' });

      await expect(
        svc.confirmUpload('images/test.png', 'test.png', 'image/png', 1, 'user-1'),
      ).rejects.toThrow('Upload was not presigned or has expired');
    });

    it('fails closed when Valkey read throws', async () => {
      const valkey = {
        get: vi.fn().mockRejectedValue(new Error('connection lost')),
        set: vi.fn(),
        del: vi.fn(),
      };
      const svc = new UploadService(
        null as unknown as WinstonLoggerService,
        valkey as unknown as ValkeyService,
        mockCircuitBreaker as CircuitBreakerService,
        mockS3Client as unknown as S3Client,
      );
      mockS3Client.send.mockResolvedValue({ ContentLength: 1, ContentType: 'image/png' });

      await expect(
        svc.confirmUpload('images/test.png', 'test.png', 'image/png', 1, 'user-1'),
      ).rejects.toThrow('Unable to verify upload ownership');
    });

    it('consumes the pending entry on success', async () => {
      const valkey = {
        get: vi.fn().mockResolvedValue('user-1'),
        set: vi.fn(),
        del: vi.fn().mockResolvedValue(undefined),
      };
      const svc = new UploadService(
        null as unknown as WinstonLoggerService,
        valkey as unknown as ValkeyService,
        mockCircuitBreaker as CircuitBreakerService,
        mockS3Client as unknown as S3Client,
      );
      mockS3Client.send.mockResolvedValue({ ContentLength: 5, ContentType: 'image/png' });
      setupInsert(insertRow());

      await svc.confirmUpload('images/test.png', 'test.png', 'image/png', 5, 'user-1');

      expect(valkey.del).toHaveBeenCalledWith('upload:pending:images/test.png');
    });
  });

  describe('getFile', () => {
    const setupSelect = (row: Record<string, unknown> | null) => {
      const limit = vi.fn().mockResolvedValue(row ? [row] : []);
      const where = vi.fn().mockReturnValue({ limit });
      const from = vi.fn().mockReturnValue({ where });
      vi.mocked(db.select).mockReturnValue({ from } as unknown as ReturnType<typeof db.select>);
      return { from, where, limit };
    };

    it('streams the object when its row exists', async () => {
      setupSelect({ filename: 'images/test.png', mimetype: 'image/png' });
      mockS3Client.send.mockResolvedValue({
        Body: { pipe: vi.fn() },
        ContentType: 'image/png',
        ContentLength: 42,
      });

      const result = await uploadService.getFile('images/test.png');

      expect(result.contentType).toBe('image/png');
      expect(result.contentLength).toBe(42);
      expect(mockS3Client.send).toHaveBeenCalled();
    });

    it('throws when no upload row exists', async () => {
      setupSelect(null);

      await expect(uploadService.getFile('images/test.png')).rejects.toThrow('File not found');
      expect(mockS3Client.send).not.toHaveBeenCalled();
    });

    it('rejects traversal attempts', async () => {
      await expect(uploadService.getFile('../etc/passwd')).rejects.toThrow('Filename contains unsupported characters');
    });
  });

  describe('deleteFile', () => {
    it('passes through for the owner', async () => {
      const where = vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([{ uploadedById: 'user-1' }]) });
      const from = vi.fn().mockReturnValue({ where });
      vi.mocked(db.select).mockReturnValue({ from } as unknown as ReturnType<typeof db.select>);
      mockS3Client.send.mockResolvedValue({});
      const delWhere = vi.fn().mockResolvedValue(undefined);
      vi.mocked(db.delete).mockReturnValue({ where: delWhere } as unknown as ReturnType<typeof db.delete>);

      await uploadService.deleteFile('images/test.png', 'user-1', false);

      expect(mockS3Client.send).toHaveBeenCalled();
      expect(db.delete).toHaveBeenCalled();
    });
  });
});

