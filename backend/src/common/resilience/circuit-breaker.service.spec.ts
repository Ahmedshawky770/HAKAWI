import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CircuitBreakerService, CircuitBreakerState } from './circuit-breaker.service.js';
import type { ValkeyService } from '../../services/valkey.service.js';

type MockValkeyService = Partial<ValkeyService>;

describe('CircuitBreakerService', () => {
  let circuitBreaker: CircuitBreakerService;
  let valkeyService: MockValkeyService;

  beforeEach(() => {
    valkeyService = {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue(undefined),
      del: vi.fn().mockResolvedValue(undefined),
      exists: vi.fn().mockResolvedValue(false),
    };

    circuitBreaker = new CircuitBreakerService(valkeyService as ValkeyService);
    (circuitBreaker as any).logger.info = vi.fn();
    (circuitBreaker as any).logger.warn = vi.fn();
    (circuitBreaker as any).logger.error = vi.fn();
  });

  describe('execute', () => {
    it('should execute function successfully when circuit is CLOSED', async () => {
      const fn = vi.fn().mockResolvedValue('success');

      const result = await circuitBreaker.execute('test-success', fn);

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should transition to OPEN after failure threshold is reached', async () => {
      const failingFn = vi.fn().mockRejectedValue(new Error('failure'));

      for (let i = 0; i < 5; i++) {
        await expect(circuitBreaker.execute('test-open-5', failingFn)).rejects.toThrow('failure');
      }

      const state = await circuitBreaker.getState('test-open-5');
      expect(state).toBe(CircuitBreakerState.OPEN);
    });

    it('should reject calls when circuit is OPEN', async () => {
      const failingFn = vi.fn().mockRejectedValue(new Error('failure'));

      for (let i = 0; i < 5; i++) {
        await expect(circuitBreaker.execute('test-reject-5', failingFn)).rejects.toThrow('failure');
      }

      const fallbackFn = vi.fn().mockResolvedValue('fallback');
      await expect(circuitBreaker.execute('test-reject-5', failingFn, fallbackFn)).resolves.toBe('fallback');
      expect(fallbackFn).toHaveBeenCalledTimes(1);
    });

    it('should transition to HALF_OPEN after recovery timeout', async () => {
      const failingFn = vi.fn().mockRejectedValue(new Error('failure'));

      for (let i = 0; i < 5; i++) {
        await expect(circuitBreaker.execute('test-recovery-half', failingFn)).rejects.toThrow('failure');
      }

      const stateBefore = await circuitBreaker.getState('test-recovery-half');
      expect(stateBefore).toBe(CircuitBreakerState.OPEN);

      (circuitBreaker as any).states.delete('test-recovery-half');
      const mockState = {
        state: CircuitBreakerState.OPEN,
        failures: 5,
        successes: 0,
        lastFailureTime: Date.now() - 31000,
        lastSuccessTime: null,
        totalCalls: 5,
        totalFailures: 5,
        totalSuccesses: 0,
        rejectedCalls: 0,
      };
      vi.mocked(valkeyService.get).mockResolvedValueOnce(JSON.stringify(mockState));

      const successFn = vi.fn().mockResolvedValue('recovered');
      await circuitBreaker.execute('test-recovery-half', successFn);

      const stateAfter = await circuitBreaker.getState('test-recovery-half');
      expect(stateAfter).toBe(CircuitBreakerState.HALF_OPEN);
    });

    it('should return fallback value when function throws and circuit is OPEN', async () => {
      const failingFn = vi.fn().mockRejectedValue(new Error('failure'));
      const fallbackFn = vi.fn().mockResolvedValue('fallback-value');

      for (let i = 0; i < 5; i++) {
        await expect(circuitBreaker.execute('test-fallback-5', failingFn)).rejects.toThrow('failure');
      }

      const result = await circuitBreaker.execute('test-fallback-5', failingFn, fallbackFn);
      expect(result).toBe('fallback-value');
    });
  });

  describe('getState', () => {
    it('should return CLOSED as initial state', async () => {
      const state = await circuitBreaker.getState('new-breaker');
      expect(state).toBe(CircuitBreakerState.CLOSED);
    });
  });

  describe('getStats', () => {
    it('should return stats for a circuit breaker', async () => {
      const fn = vi.fn().mockResolvedValue('success');
      await circuitBreaker.execute('stats-breaker', fn);

      const stats = await circuitBreaker.getStats('stats-breaker');

      expect(stats.totalCalls).toBe(1);
      expect(stats.totalSuccesses).toBe(1);
      expect(stats.state).toBe(CircuitBreakerState.CLOSED);
    });
  });

  describe('reset', () => {
    it('should reset circuit breaker to CLOSED state', async () => {
      const failingFn = vi.fn().mockRejectedValue(new Error('failure'));

      for (let i = 0; i < 5; i++) {
        await expect(circuitBreaker.execute('test-reset-5', failingFn)).rejects.toThrow('failure');
      }

      await circuitBreaker.reset('test-reset-5');
      const state = await circuitBreaker.getState('test-reset-5');
      expect(state).toBe(CircuitBreakerState.CLOSED);
    });
  });
});
