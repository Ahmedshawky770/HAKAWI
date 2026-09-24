import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { FallbackService } from './fallback.service.js';
import type { ValkeyService } from '../../services/valkey.service.js';

type MockValkeyService = Partial<ValkeyService>;

describe('FallbackService', () => {
  let fallbackService: FallbackService;
  let valkeyService: MockValkeyService;

  beforeEach(() => {
    valkeyService = {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue(undefined),
    };

    fallbackService = new FallbackService(valkeyService as ValkeyService);
  });

  describe('executeWithFallback', () => {
    it('should return result when primary operation succeeds', async () => {
      const fn = vi.fn().mockResolvedValue('primary');
      const fallback = vi.fn().mockResolvedValue('fallback');

      const result = await fallbackService.executeWithFallback(fn, { strategy: fallback });

      expect(result).toBe('primary');
      expect(fallback).not.toHaveBeenCalled();
    });

    it('should execute fallback strategy when primary operation fails', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('failure'));
      const fallback = vi.fn().mockResolvedValue('fallback');

      const result = await fallbackService.executeWithFallback(fn, { strategy: fallback });

      expect(result).toBe('fallback');
      expect(fallback).toHaveBeenCalled();
    });

    it('should return cached value when available and primary fails', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('failure'));
      vi.mocked(valkeyService.get).mockResolvedValueOnce(JSON.stringify({ data: 'cached' }));

      const result = await fallbackService.executeWithFallback(fn, { strategy: () => 'default', context: null }, 'cache-key');

      expect(result).toEqual({ data: 'cached' });
    });

    it('should execute strategy when primary fails and no cache is available', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('failure'));
      const fallback = vi.fn().mockResolvedValue('default');

      const result = await fallbackService.executeWithFallback(fn, { strategy: fallback });

      expect(result).toBe('default');
    });
  });

  describe('returnDefault', () => {
    it('should return the default value', async () => {
      const result = await fallbackService.returnDefault('default-value');
      expect(result).toBe('default-value');
    });
  });

  describe('returnCached', () => {
    it('should return cached value from Valkey', async () => {
      vi.mocked(valkeyService.get).mockResolvedValueOnce(JSON.stringify({ cached: true }));

      const result = await fallbackService.returnCached<{ cached: boolean }>('cache-key');

      expect(result).toEqual({ cached: true });
    });

    it('should return null when cache is empty', async () => {
      vi.mocked(valkeyService.get).mockResolvedValueOnce(null);

      const result = await fallbackService.returnCached<{ cached: boolean }>('cache-key');

      expect(result).toBeNull();
    });
  });

  describe('returnNull', () => {
    it('should return null', async () => {
      const result = await fallbackService.returnNull<string>();
      expect(result).toBeNull();
    });
  });

  describe('throwCustomError', () => {
    it('should throw the provided error', async () => {
      const error = new Error('custom error');

      await expect(fallbackService.throwCustomError(error)).rejects.toThrow('custom error');
    });
  });
});
