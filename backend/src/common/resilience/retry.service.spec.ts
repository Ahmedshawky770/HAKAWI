import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RetryService } from './retry.service.js';

describe('RetryService', () => {
  let retryService: RetryService;

  beforeEach(() => {
    retryService = new RetryService();
    retryService['configs'].set('test', {
      maxRetries: 3,
      initialDelayMs: 10,
      maxDelayMs: 100,
      backoffMultiplier: 2,
      jitterMs: 0,
    });
    retryService['configs'].set('test-retry', {
      maxRetries: 2,
      initialDelayMs: 10,
      maxDelayMs: 100,
      backoffMultiplier: 2,
      jitterMs: 0,
    });
    retryService['configs'].set('test-predicate', {
      maxRetries: 3,
      initialDelayMs: 10,
      maxDelayMs: 100,
      backoffMultiplier: 2,
      jitterMs: 0,
    });
    retryService['configs'].set('custom', {
      maxRetries: 1,
      initialDelayMs: 10,
      maxDelayMs: 100,
      backoffMultiplier: 2,
      jitterMs: 0,
    });
    retryService['configs'].set('test-fail', {
      maxRetries: 3,
      initialDelayMs: 10,
      maxDelayMs: 100,
      backoffMultiplier: 2,
      jitterMs: 0,
    });
  });

  describe('execute', () => {
    it('should return result on first successful attempt', async () => {
      const fn = vi.fn().mockResolvedValue('success');

      const result = await retryService.execute('test', fn);

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should retry on failure and eventually succeed', async () => {
      const fn = vi.fn()
        .mockRejectedValueOnce(new Error('fail'))
        .mockRejectedValueOnce(new Error('fail'))
        .mockResolvedValue('success');

      const result = await retryService.execute('test-retry', fn);

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('should throw error after max retries', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('persistent failure'));

      await expect(retryService.execute('test-fail', fn)).rejects.toThrow('persistent failure');
      expect(fn).toHaveBeenCalledTimes(4);
    });

    it('should respect shouldRetry predicate', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('not retryable'));
      const shouldRetry = vi.fn().mockReturnValue(false);

      await expect(retryService.execute('test-predicate', fn, shouldRetry)).rejects.toThrow('not retryable');
      expect(fn).toHaveBeenCalledTimes(1);
      expect(shouldRetry).toHaveBeenCalled();
    });
  });

  describe('executeWithBackoff', () => {
    it('should use custom config when provided', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('fail'));
      const shouldRetry = vi.fn().mockReturnValue(false);

      await expect(retryService.executeWithBackoff('custom', fn, {
        maxRetries: 1,
        initialDelayMs: 10,
        maxDelayMs: 100,
        backoffMultiplier: 2,
        jitterMs: 0,
      }, shouldRetry)).rejects.toThrow('fail');

      expect(fn).toHaveBeenCalledTimes(2);
    });
  });
});
