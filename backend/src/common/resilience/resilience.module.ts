import { Module, Global } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { ValkeyService } from '../services/valkey.service.js';

import { CircuitBreakerService } from './circuit-breaker.service.js';
import { RetryService } from './retry.service.js';
import { TimeoutService } from './timeout.service.js';
import { FallbackService } from './fallback.service.js';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [CircuitBreakerService, RetryService, TimeoutService, FallbackService, ValkeyService],
  exports: [CircuitBreakerService, RetryService, TimeoutService, FallbackService],
})
export class ResilienceModule {}
