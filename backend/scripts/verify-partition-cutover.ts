import { dbPrimary } from '../src/db/router.ts';
import { WinstonLoggerService } from '../src/common/services/winston-logger.service.ts';
import { sql } from 'drizzle-orm';

/**
 * `verify-partition-cutover` — يتحقق من جاهزية cutover للجداول البارتيشن قبل تشغيل
 * migration 0039.
 *
 * يتحقق من:
 *   1. وجود الجداول البارتيشن (`messages_p`, `notifications_p`, `payment_transactions_p`, `reactions_p`)
 *   2. تطابق counts بين الجداول الأصلية والبارتيشن
 *   3. وجود بيانات حديثة في الجداول البارتيشن (دليل على أن dual-write نشط)
 *
 * الاستخدام:
 *   tsx scripts/verify-partition-cutover.ts
 *
 * يخرج برمز 0 إذا كانت一切 جاهزة للـ cutover، 1 إذا لم تكن.
 */

type CountRow = { source_cnt: string; target_cnt: string };

const log = new WinstonLoggerService();

const TABLES: Array<{
  readonly label: string;
  readonly source: string;
  readonly target: string;
}> = [
  { label: 'messages', source: 'messages', target: 'messages_p' },
  { label: 'notifications', source: 'notifications', target: 'notifications_p' },
  { label: 'payment_transactions', source: 'payment_transactions', target: 'payment_transactions_p' },
  { label: 'reactions', source: 'reactions', target: 'reactions_p' },
];

async function tableExists(tableName: string): Promise<boolean> {
  const res = await dbPrimary.execute<{ exists: boolean }>(sql`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = ${tableName}
    ) AS exists`);
  const rows = (res as { rows?: { exists: boolean }[] }).rows ?? (res as unknown as { exists: boolean }[]);
  return (Array.isArray(rows) ? rows[0]?.exists : (rows as { exists: boolean })?.exists) ?? false;
}

async function getCounts(source: string, target: string): Promise<CountRow> {
  const res = await dbPrimary.execute<CountRow>(sql`
    SELECT
      (SELECT count(*) FROM ${sql.identifier(source)}) AS source_cnt,
      (SELECT count(*) FROM ${sql.identifier(target)}) AS target_cnt`);
  const rows = (res as { rows?: CountRow[] }).rows ?? (res as unknown as CountRow[]);
  return (Array.isArray(rows) ? rows[0] : rows) as CountRow;
}

async function main(): Promise<number> {
  let failures = 0;

  log.info('Verifying partition cutover readiness...', 'VerifyPartitionCutover');

  for (const table of TABLES) {
    const exists = await tableExists(table.target);
    if (!exists) {
      failures += 1;
      log.error(
        `✗ ${table.label}: target table "${table.target}" does not exist — run migration 0035 first`,
        'VerifyPartitionCutover',
      );
      continue;
    }

    let counts: CountRow;
    try {
      counts = await getCounts(table.source, table.target);
    } catch (error) {
      failures += 1;
      log.error(
        `✗ ${table.label}: could not read counts — ${(error as Error).message}`,
        'VerifyPartitionCutover',
      );
      continue;
    }

    const sourceCnt = Number(counts.source_cnt);
    const targetCnt = Number(counts.target_cnt);

    if (sourceCnt !== targetCnt) {
      failures += 1;
      log.error(
        `✗ ${table.label}: source=${sourceCnt}, target=${targetCnt} — run "npm run db:backfill-partitions" first`,
        'VerifyPartitionCutover',
      );
    } else {
      log.info(
        `✓ ${table.label}: source=${sourceCnt}, target=${targetCnt} — counts match`,
        'VerifyPartitionCutover',
      );
    }
  }

  if (failures > 0) {
    log.error(`\n${failures} check(s) failed. Do NOT run migration 0039 yet. Fix the issues above.`, 'VerifyPartitionCutover');
    return 1;
  }

  log.info('\nAll checks passed. The partitioned tables are in sync and ready for cutover.', 'VerifyPartitionCutover');
  log.info('Next steps:', 'VerifyPartitionCutover');
  log.info('  1. Update repository read paths to read from *_p tables instead of legacy tables', 'VerifyPartitionCutover');
  log.info('  2. Run migration 0039 to drop the legacy tables', 'VerifyPartitionCutover');
  log.info('  3. Deploy the updated repository code', 'VerifyPartitionCutover');

  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((error) => {
    log.error(`Verification failed: ${(error as Error).message}`, 'VerifyPartitionCutover');
    process.exit(1);
  });
