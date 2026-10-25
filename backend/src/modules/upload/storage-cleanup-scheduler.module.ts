import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';

import { StorageCleanupService } from './services/storage-cleanup.service.ts';

/**
 * وحدة جدولة تنظيف التخزين.
 *
 * WHAT THIS MODULE IS FOR. `ScheduleModule.forRoot()` يُشغّل جدولة NestJS؛ ومنهج `@Cron`
 على `StorageCleanupService` يُكتشف تلقائياً عبر التطبيق. تُوفَّر الخدمة — مرة واحدة — من قبل
 * `UploadModule`، التي تملك مستودع الرفع وعميل S3. هذه الوحدة مهمة واحدة فقط: تشغيل الجدولة.
 */
@Module({
  imports: [ScheduleModule.forRoot()],
  providers: [StorageCleanupService],
})
export class StorageCleanupSchedulerModule {}
