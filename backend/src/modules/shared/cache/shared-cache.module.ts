import { Global, Module } from '@nestjs/common';

import { CommonModule } from '../../../common/common.module.ts';

import { TaggedCacheService } from './tagged-cache.service.ts';

@Global()
@Module({
  imports: [CommonModule],
  providers: [TaggedCacheService],
  exports: [TaggedCacheService],
})
export class SharedCacheModule {}
