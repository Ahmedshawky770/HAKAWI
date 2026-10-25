import { dbPrimary } from '../src/db/router.ts';
import { WinstonLoggerService } from '../src/common/services/winston-logger.service.ts';
import { sql } from 'drizzle-orm';

/**
 * `backfill-partitioned-tables` — ينسخ البيانات الموجودة من الجداول الأصلية إلى الجداول
 * البارتيشن (`*_p`) التي أُنشئت في migration 0035.
 *
 * المبدأ #6 (تقليل المبرجشنات): هذه عملية نقل بيانات واحدة فقط، وليس مبرجشنًا هيكليًا.
 * يتم النسخ باستخدام `INSERT ... SELECT ... ON CONFLICT DO NOTHING` ليكون أمينًا (idempotent):
 * يمكن إعادة تشغيله بأمان إذا انقطع منتصف الطريق.
 *
 * جدول النسخ:
 *   messages      → messages_p
 *   notifications → notifications_p
 *   payment_transactions → payment_transactions_p
 *   reactions     → reactions_p
 *
 * الاستخدام:
 *   tsx scripts/backfill-partitioned-tables.ts [--dry-run]
 *
 * يخرج برمز 0 عند النجاح، 1 عند الفشل.
 */

type BackfillResult = {
  readonly table: string;
  readonly copied: number;
  readonly skipped: number;
};

const log = new WinstonLoggerService();

const BACKFILL_JOBS: Array<{
  readonly label: string;
  readonly source: string;
  readonly target: string;
  readonly columns: string;
}> = [
  {
    label: 'messages',
    source: 'messages',
    target: 'messages_p',
    columns: 'id, conversation_id, sender_id, content, is_read, read_at, created_at',
  },
  {
    label: 'notifications',
    source: 'notifications',
    target: 'notifications_p',
    columns: 'id, user_id, type, title, message, data, is_read, read_at, created_at',
  },
  {
    label: 'payment_transactions',
    source: 'payment_transactions',
    target: 'payment_transactions_p',
    columns: 'id, payment_id, type, status, amount, currency, gateway_response, created_at',
  },
  {
    label: 'reactions',
    source: 'reactions',
    target: 'reactions_p',
    columns: 'id, user_id, story_id, type, created_at',
  },
];

async function backfillOne(dryRun: boolean, job: (typeof BACKFILL_JOBS)[number]): Promise<BackfillResult> {
  const resBefore = await dbPrimary.execute<{ cnt: string }>(sql`SELECT count(*) AS cnt FROM ${sql.identifier(job.target)}`);
  const rowsBefore = (resBefore as { rows?: { cnt: string }[] }).rows ?? (resBefore as unknown as { cnt: string }[]);
  const arrBefore = Array.isArray(rowsBefore) ? rowsBefore : [rowsBefore];
  const already = Number(arrBefore[0]?.cnt ?? 0);

  if (dryRun) {
    log.info(
      `[dry-run] would copy ${job.label}: ${job.source} → ${job.target} (already ${already} rows in target)`,
      'BackfillPartitionedTables',
    );
    return { table: job.label, copied: 0, skipped: already };
  }

  await dbPrimary.execute(sql`INSERT INTO ${sql.identifier(job.target)} (${sql.raw(job.columns)})
        SELECT ${sql.raw(job.columns)} FROM ${sql.identifier(job.source)}
        ON CONFLICT (id, created_at) DO NOTHING`);

  const resAfter = await dbPrimary.execute<{ cnt: string }>(sql`SELECT count(*) AS cnt FROM ${sql.identifier(job.target)}`);
  const rowsAfter = (resAfter as { rows?: { cnt: string }[] }).rows ?? (resAfter as unknown as { cnt: string }[]);
  const arrAfter = Array.isArray(rowsAfter) ? rowsAfter : [rowsAfter];
  const after = Number(arrAfter[0]?.cnt ?? 0);
  const copied = after - already;

  log.info(
    `Backfilled ${job.label}: copied ${copied} row(s) from ${job.source} to ${job.target} (total now ${after})`,
    'BackfillPartitionedTables',
  );

  return { table: job.label, copied, skipped: already };
}

async function main(): Promise<number> {
  const dryRun = process.argv.includes('--dry-run');

  log.info(
    `Starting partitioned-table backfill: dryRun=${dryRun}, jobs=${BACKFILL_JOBS.length}`,
    'BackfillPartitionedTables',
  );

  let totalCopied = 0;
  let totalErrors = 0;

  for (const job of BACKFILL_JOBS) {
    try {
      const result = await backfillOne(dryRun, job);
      totalCopied += result.copied;
    } catch (error) {
      totalErrors += 1;
      log.error(
        `Backfill failed for ${job.label}: ${(error as Error).message}`,
        'BackfillPartitionedTables',
      );
    }
  }

  log.info(
    `Backfill complete: copied=${totalCopied}, errors=${totalErrors}, jobs=${BACKFILL_JOBS.length}`,
    'BackfillPartitionedTables',
  );

  return totalErrors > 0 ? 1 : 0;
}

main()
  .then((code) => process.exit(code))
  .catch((error) => {
    log.error(`Backfill failed: ${(error as Error).message}`, 'BackfillPartitionedTables');
    process.exit(1);
  });
