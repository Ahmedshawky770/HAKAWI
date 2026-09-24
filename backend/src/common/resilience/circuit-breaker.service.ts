import { Injectable, Inject, Logger } from '@nestjs/common';

import { ValkeyService } from '../services/valkey.service.js';

export enum CircuitBreakerState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}

export interface CircuitBreakerConfig {
  name: string;
  failureThreshold: number;
  recoveryTimeoutMs: number;
  successThreshold: number;
  monitoringPeriodMs: number;
}

export interface CircuitBreakerStats {
  state: CircuitBreakerState;
  failures: number;
  successes: number;
  lastFailureTime: number | null;
  lastSuccessTime: number | null;
  totalCalls: number;
  totalFailures: number;
  totalSuccesses: number;
  rejectedCalls: number;
}

const DEFAULT_CIRCUIT_BREAKER_CONFIG: Omit<CircuitBreakerConfig, 'name'> = {
  failureThreshold: parseInt(process.env.CIRCUIT_BREAKER_FAILURE_THRESHOLD || '5', 10),
  recoveryTimeoutMs: parseInt(process.env.CIRCUIT_BREAKER_RECOVERY_TIMEOUT_MS || '30000', 10),
  successThreshold: parseInt(process.env.CIRCUIT_BREAKER_SUCCESS_THRESHOLD || '3', 10),
  monitoringPeriodMs: parseInt(process.env.CIRCUIT_BREAKER_MONITORING_PERIOD_MS || '60000', 10),
};

@Injectable()
export class CircuitBreakerService {
  private readonly logger = new Logger(CircuitBreakerService.name);
  private readonly configs = new Map<string, CircuitBreakerConfig>();
  private readonly states = new Map<string, { state: CircuitBreakerState; failures: number; successes: number; lastFailureTime: number | null; lastSuccessTime: number | null; totalCalls: number; totalFailures: number; totalSuccesses: number; rejectedCalls: number }>();

  constructor(@Inject(ValkeyService) private readonly valkeyService: ValkeyService) {}

  private getConfig(name: string): CircuitBreakerConfig {
    if (!this.configs.has(name)) {
      this.configs.set(name, { name, ...DEFAULT_CIRCUIT_BREAKER_CONFIG });
    }
    return this.configs.get(name)!;
  }

  private getStateKey(name: string): string {
    return `circuit-breaker:${name}:state`;
  }

  private async loadState(name: string): Promise<{ state: CircuitBreakerState; failures: number; successes: number; lastFailureTime: number | null; lastSuccessTime: number | null; totalCalls: number; totalFailures: number; totalSuccesses: number; rejectedCalls: number }> {
    const key = this.getStateKey(name);
    const cached = await this.valkeyService.get(key);
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        this.states.set(name, parsed);
        return parsed;
      } catch {
        // fall through
      }
    }

    const initialState = {
      state: CircuitBreakerState.CLOSED,
      failures: 0,
      successes: 0,
      lastFailureTime: null,
      lastSuccessTime: null,
      totalCalls: 0,
      totalFailures: 0,
      totalSuccesses: 0,
      rejectedCalls: 0,
    };

    this.states.set(name, initialState);
    await this.valkeyService.set(key, JSON.stringify(initialState), this.getConfig(name).monitoringPeriodMs / 1000);
    return initialState;
  }

  private async persistState(name: string, state: { state: CircuitBreakerState; failures: number; successes: number; lastFailureTime: number | null; lastSuccessTime: number | null; totalCalls: number; totalFailures: number; totalSuccesses: number; rejectedCalls: number }): Promise<void> {
    const key = this.getStateKey(name);
    const config = this.getConfig(name);
    await this.valkeyService.set(key, JSON.stringify(state), config.monitoringPeriodMs / 1000);
  }

  private async transitionTo(name: string, newState: CircuitBreakerState): Promise<void> {
    const current = this.states.get(name) ?? await this.loadState(name);
    current.state = newState;
    this.states.set(name, current);
    await this.persistState(name, current);
    this.logger.warn(`Circuit breaker ${name} transitioned to ${newState}`, CircuitBreakerService.name);
  }

  async getState(name: string): Promise<CircuitBreakerState> {
    const state = this.states.get(name) ?? await this.loadState(name);
    return state.state;
  }

  async getStats(name: string): Promise<CircuitBreakerStats> {
    const state = this.states.get(name) ?? await this.loadState(name);
    return { ...state };
  }

  async reset(name: string): Promise<void> {
    const initialState = {
      state: CircuitBreakerState.CLOSED,
      failures: 0,
      successes: 0,
      lastFailureTime: null,
      lastSuccessTime: null,
      totalCalls: 0,
      totalFailures: 0,
      totalSuccesses: 0,
      rejectedCalls: 0,
    };
    this.states.set(name, initialState);
    await this.persistState(name, initialState);
    this.logger.log(`Circuit breaker ${name} reset`, CircuitBreakerService.name);
  }

  async execute<T>(name: string, fn: () => Promise<T>, fallback?: () => Promise<T>): Promise<T> {
    const config = this.getConfig(name);
    const state = this.states.get(name) ?? await this.loadState(name);

    if (state.state === CircuitBreakerState.OPEN) {
      const now = Date.now();
      if (state.lastFailureTime && now - state.lastFailureTime >= config.recoveryTimeoutMs) {
        state.state = CircuitBreakerState.HALF_OPEN;
        state.failures = 0;
        state.successes = 0;
        await this.transitionTo(name, CircuitBreakerState.HALF_OPEN);
      } else {
        state.rejectedCalls += 1;
        await this.persistState(name, state);
        this.logger.warn(`Circuit breaker ${name} rejected call in OPEN state`, CircuitBreakerService.name);
        if (fallback) {
          return fallback();
        }
        throw new Error(`Circuit breaker ${name} is OPEN`);
      }
    }

    state.totalCalls += 1;
    try {
      const result = await fn();
      state.totalSuccesses += 1;
      state.lastSuccessTime = Date.now();

      if (state.state === CircuitBreakerState.HALF_OPEN) {
        state.successes += 1;
        if (state.successes >= config.successThreshold) {
          state.state = CircuitBreakerState.CLOSED;
          state.failures = 0;
          state.successes = 0;
          await this.transitionTo(name, CircuitBreakerState.CLOSED);
        }
      } else {
        state.failures = 0;
      }

      await this.persistState(name, state);
      return result;
    } catch (error) {
      state.totalFailures += 1;
      state.lastFailureTime = Date.now();

      if (state.state === CircuitBreakerState.HALF_OPEN) {
        state.failures = 0;
        state.successes = 0;
        await this.transitionTo(name, CircuitBreakerState.OPEN);
      } else if (state.state === CircuitBreakerState.CLOSED) {
        state.failures += 1;
        if (state.failures >= config.failureThreshold) {
          await this.transitionTo(name, CircuitBreakerState.OPEN);
        }
      }

      await this.persistState(name, state);
      if (fallback) {
        return fallback();
      }
      throw error;
    }
  }
}
