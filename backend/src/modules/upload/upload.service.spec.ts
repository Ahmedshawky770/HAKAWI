import { describe, it, expect, beforeEach, vi } from 'vitest';

import { UploadService } from './upload.service.ts';
import type { UploadResponse } from '../dto/upload-response.dto.ts';
import type { CircuitBreakerService } from '../../common/resilience/circuit-breaker.service.js';

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn(() => Promise.resolve('https://signed-url.test')),
}));

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
      execute: vi.fn().mockImplementation((_name: string, fn: () => Promise<any>) => fn()),
    };

    uploadService = new UploadService(null, null, mockCircuitBreaker as CircuitBreakerService, undefined as any);
  });

  describe('generatePresignedUrl', () => {
    it('should return a presigned upload URL', async () => {
      const result = await uploadService.generatePresignedUrl('test.png', 'image/png');
      expect(result.url).toBe('https://signed-url.test');
      expect(result.filename).toBeDefined();
      expect(result.mimetype).toBe('image/png');
    });
  });
});
