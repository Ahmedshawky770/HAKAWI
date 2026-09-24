import { Injectable, Logger } from '@nestjs/common';

export interface TimeoutConfig {
  timeoutMs: number;
}

const DEFAULT_TIMEOUT_MS = parseInt(process.env.DEFAULT_OPERATION_TIMEOUT_MS || '5000', 10);

@Injectable()
export class TimeoutService {
  private readonly logger = new Logger(TimeoutService.name);
  private readonly configs = new Map<string, TimeoutConfig>();

  private getConfig(name: string): TimeoutConfig {
    if (!this.configs.has(name)) {
      this.configs.set(name, { timeoutMs: DEFAULT_TIMEOUT_MS });
    }
    return this.configs.get(name)!;
  }

  private withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Operation timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      promise
        .then((value) => {
          clearTimeout(timer);
          resolve(value);
        })
        .catch((error) => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }

  async execute<T>(name: string, fn: () => Promise<T>): Promise<T> {
    const config = this.getConfig(name);
    try {
      return await this.withTimeout(fn(), config.timeoutMs);
    } catch (error) {
      this.logger.error(`Timeout ${name} exceeded ${config.timeoutMs}ms`, String(error), TimeoutService.name);
      throw error;
    }
  }

  async executeWithTimeout<T>(name: string, fn: () => Promise<T>, timeoutMs: number): Promise<T> {
    this.configs.set(name, { timeoutMs });
    try {
      return await this.withTimeout(fn(), timeoutMs);
    } catch (error) {
      this.logger.error(`Timeout ${name} exceeded ${timeoutMs}ms`, String(error), TimeoutService.name);
      throw error;
    }
  }
}
