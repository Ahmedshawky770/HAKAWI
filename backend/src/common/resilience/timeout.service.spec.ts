import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TimeoutService } from './timeout.service.js';

describe('TimeoutService', () => {
  let timeoutService: TimeoutService;

  beforeEach(() => {
    timeoutService = new TimeoutService();
  });

  describe('execute', () => {
    it('should return result before timeout', async () => {
      const fn = vi.fn().mockResolvedValue('success');

      const result = await timeoutService.execute('test', fn);

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should throw error when operation exceeds timeout', async () => {
      const fn = vi.fn().mockImplementation(() => new Promise((resolve) => setTimeout(() => resolve('late'), 100)));
      timeoutService['configs'].set('test-slow', { timeoutMs: 50 });

      await expect(timeoutService.execute('test-slow', fn)).rejects.toThrow('timed out');
    });
  });

  describe('executeWithTimeout', () => {
    it('should use custom timeout when provided', async () => {
      const fn = vi.fn().mockImplementation(() => new Promise((resolve) => setTimeout(() => resolve('success'), 10)));

      const result = await timeoutService.executeWithTimeout('custom', fn, 100);

      expect(result).toBe('success');
    });

    it('should throw when custom timeout is exceeded', async () => {
      const fn = vi.fn().mockImplementation(() => new Promise((resolve) => setTimeout(() => resolve('late'), 100)));

      await expect(timeoutService.executeWithTimeout('custom-timeout', fn, 50)).rejects.toThrow('timed out');
    });
  });
});
