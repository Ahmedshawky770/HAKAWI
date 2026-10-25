import { Injectable, Inject } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { sql } from 'drizzle-orm';

import { WinstonLoggerService } from '../../../common/services/winston-logger.service.ts';
import { dbPrimary } from '../../../db/router.ts';

/**
 * `StorageCleanupService` — وظيفة مجدولة تستعيد أجسام S3 للمرفقات المحذوفة منطقياً.
 *
 * المبدأ #15 (الدفاع الاستباقي): المرفقات المحذوفة منطقياً (`uploads.deleted_at` تُضبط) تحتفظ
 * بأجسامها في S3 إلى أن يُنفَّذ منظف دوري. بدون هذا العملية، تتراكم الأجسام الهامشية وتُكلف
 * مساحة تخزين وتُشكِّل خطر تسريب معلومات.
 *
 * تُشغل هذه الوظيفة يومياً عند الساعة 03:00 UTC وتحذف أجسام S3 للمرفقات التي حُذفت منطقياً
 * منذ أكثر من 30 يوماً (قابلة للتعديل عبر `STORAGE_ORPHANED_RETENTION_DAYS`).
 *
 * تُقرأ من `dbPrimary` للحصول على قائمة دقيقة ومحدثة للمرفقات المحذوفة منطقياً، حتى لا تُحذف
 * جسم سهم كان صف قاعدته البيانات قد أُعيد استعادته.
 */
@Injectable()
export class StorageCleanupService {
  private readonly bucket: string;
  private readonly retentionDays: number;

  constructor(
    @Inject(WinstonLoggerService) private readonly logger: WinstonLoggerService,
  ) {
    this.bucket = process.env.STORAGE_BUCKET ?? 'hakawi-media';
    this.retentionDays = Number(process.env.STORAGE_ORPHANED_RETENTION_DAYS ?? 30);
  }

  /**
   * تُنفَّذ يومياً عند الساعة 03:00 UTC.
   */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async cleanupOrphanedUploads(): Promise<void> {
    this.logger.info(
      `Starting scheduled orphaned-upload cleanup: bucket=${this.bucket}, retentionDays=${this.retentionDays}`,
      'StorageCleanupService',
    );

    try {
      const deleted = await this.runCleanup();
      this.logger.info(
        `Scheduled cleanup complete: deleted=${deleted.deleted}, errors=${deleted.errors}, total=${deleted.total}`,
        'StorageCleanupService',
      );
    } catch (error) {
      this.logger.error(
        `Scheduled orphaned-upload cleanup failed: ${(error as Error).message}`,
        'StorageCleanupService',
      );
      throw error;
    }
  }

  /**
   * يُنفَّذ المنظف يدوياً (للاختبار أو التشغيل اليدوي). يُعيد إحصائيات العملية.
   */
  async runCleanup(): Promise<{ deleted: number; errors: number; total: number }> {
    const s3Client = new S3Client({
      region: process.env.STORAGE_REGION ?? 'us-east-1',
      ...(process.env.STORAGE_ENDPOINT
        ? { endpoint: process.env.STORAGE_ENDPOINT, forcePathStyle: true }
        : {}),
    });

    const cutoff = new Date(
      Date.now() - this.retentionDays * 24 * 60 * 60 * 1000,
    );

    // اقرأ من الأساسي للحصول على قائمة دقيقة ومحدثة.
    const orphanedQuery = sql`SELECT id, filename, deleted_at
        FROM uploads
        WHERE deleted_at IS NOT NULL
          AND deleted_at < ${cutoff.toISOString()}
        ORDER BY deleted_at ASC`;

    const orphanedResult = await dbPrimary.execute(orphanedQuery);
    const orphanedRows = orphanedResult.rows as Array<{ id: string; filename: string; deleted_at: Date }>;

    let deleted = 0;
    let errors = 0;

    for (const row of orphanedRows) {
      try {
        await s3Client.send(
          new DeleteObjectCommand({ Bucket: this.bucket, Key: row.filename }),
        );
        this.logger.debug(
          `Deleted S3 object key=${row.filename} (upload id=${row.id})`,
          'StorageCleanupService',
        );
        deleted += 1;
      } catch (error) {
        errors += 1;
        this.logger.error(
          `Failed to delete S3 object key=${row.filename} (upload id=${row.id}): ${(error as Error).message}`,
          'StorageCleanupService',
        );
      }
    }

    return { deleted, errors, total: orphanedRows.length };
  }
}
