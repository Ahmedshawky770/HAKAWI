import { Injectable, Logger } from '@nestjs/common';

export interface RetryConfig {
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  jitterMs: number;
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: parseInt(process.env.RETRY_MAX_RETRIES || '3', 10),
  initialDelayMs: parseInt(process.env.RETRY_INITIAL_DELAY_MS || '1000', 10),
  maxDelayMs: parseInt(process.env.RETRY_MAX_DELAY_MS || '10000', 10),
  backoffMultiplier: parseFloat(process.env.RETRY_BACKOFF_MULTIPLIER || '2'),
  jitterMs: parseInt(process.env.RETRY_JITTER_MS || '500', 10),
};

@Injectable()
export class RetryService {
  private readonly logger = new Logger(RetryService.name);
  private readonly configs = new Map<string, RetryConfig>();

  private getConfig(name: string): RetryConfig {
    if (!this.configs.has(name)) {
      this.configs.set(name, { ...DEFAULT_RETRY_CONFIG });
    }
    return this.configs.get(name)!;
  }

  private calculateDelay(attempt: number, config: RetryConfig): number {
    const exponentialDelay = config.initialDelayMs * Math.pow(config.backoffMultiplier, attempt);
    const cappedDelay = Math.min(exponentialDelay, config.maxDelayMs);
    const jitter = Math.random() * config.jitterMs;
    return Math.floor(cappedDelay + jitter);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async execute<T>(name: string, fn: () => Promise<T>, shouldRetry?: (error: unknown, attempt: number) => boolean): Promise<T> {
    const config = this.getConfig(name);
    let lastError: unknown;

    for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        if (attempt === config.maxRetries) {
          break;
        }
        const retryable = shouldRetry ? shouldRetry(error, attempt) : true;
        if (!retryable) {
          break;
        }
        const delay = this.calculateDelay(attempt, config);
        this.logger.warn(`Retry ${name} attempt ${attempt + 1}/${config.maxRetries} failed, retrying in ${delay}ms`, RetryService.name);
        await this.sleep(delay);
      }
    }

    this.logger.error(`Retry ${name} failed after ${config.maxRetries} retries`, String(lastError), RetryService.name);
    throw lastError;
  }

  async executeWithBackoff<T>(name: string, fn: () => Promise<T>, config?: Partial<RetryConfig>): Promise<T> {
    if (config) {
      this.configs.set(name, { ...DEFAULT_RETRY_CONFIG, ...config });
    }
    return this.execute(name, fn);
  }
}
