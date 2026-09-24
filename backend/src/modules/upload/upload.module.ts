import { Module } from '@nestjs/common';

import { CommonModule } from '../../common/common.module.ts';
import { DatabaseModule } from '../../db/database.module.ts';

import { UploadService } from './upload.service.ts';
import { UploadController } from './upload.controller.ts';

@Module({
  imports: [CommonModule, DatabaseModule],
  controllers: [UploadController],
  providers: [UploadService],
  exports: [UploadService],
})
export class UploadModule {}
