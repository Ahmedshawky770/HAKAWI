import { dbPrimary } from '../src/db/router.ts';
import { WinstonLoggerService } from '../src/common/services/winston-logger.service.ts';
import { S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { sql } from 'drizzle-orm';
import { uploads } from '../src/db/schema/upload.schema.ts';

/**
 * `cleanup-orphaned-uploads` — Object Storage lifecycle for soft-deleted uploads.
 *
 * Principle #15 (Proactive Defense): orphaned objects in the bucket are a
 * storage-cost and information-leakage risk. When an upload row is soft-deleted
 * (`deleted_at` set), the S3 object is not removed by `UploadService.deleteFile`
 * (that path hard-deletes both row and object). Soft-deleted rows linger until
 * an operator purges them, so their bucket objects linger too.
 *
 * This script finds soft-deleted uploads older than a retention window and
 * deletes their S3 objects, leaving the DB row intact for audit.
 *
 * Usage:
 *   tsx scripts/cleanup-orphaned-uploads.ts [--older-than-days N] [--dry-run] [--confirm]
 *
 * --dry-run     List what would be deleted without deleting anything.
 * --confirm     Required to actually delete S3 objects. Prevents accidental destructive runs.
 *
 * Environment:
 *   STORAGE_BUCKET     S3 bucket name (default: hakawi-media)
 *   STORAGE_REGION     S3 region (default: us-east-1)
 *   STORAGE_ENDPOINT   Optional S3-compatible endpoint (MinIO, etc.)
 *
 * Exits 0 on success, 1 on failure.
 */

type Args = {
  readonly olderThanDays: number;
  readonly dryRun: boolean;
  readonly confirm: boolean;
};

function parseArgs(argv: readonly string[]): Args {
  let olderThanDays = 30;
  let dryRun = false;
  let confirm = false;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dry-run') {
      dryRun = true;
    } else if (arg === '--confirm') {
      confirm = true;
    } else if (arg === '--older-than-days') {
      olderThanDays = Number(argv[i + 1] ?? 30);
      i += 1;
    }
  }
  return { olderThanDays, dryRun, confirm };
}

const log = new WinstonLoggerService();

const s3Client = new S3Client({
  region: process.env.STORAGE_REGION ?? 'us-east-1',
  ...(process.env.STORAGE_ENDPOINT
    ? { endpoint: process.env.STORAGE_ENDPOINT, forcePathStyle: true }
    : {}),
});

const bucket = process.env.STORAGE_BUCKET ?? 'hakawi-media';

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  const cutoff = new Date(
    Date.now() - args.olderThanDays * 24 * 60 * 60 * 1000,
  );

  log.info(
    `Starting orphaned-upload cleanup: bucket=${bucket}, olderThanDays=${args.olderThanDays}, cutoff=${cutoff.toISOString()}, dryRun=${args.dryRun}`,
    'CleanupOrphanedUploads',
  );

  if (!args.dryRun && !args.confirm) {
    log.error(
      'Refusing to delete S3 objects without --confirm. Re-run with --confirm to proceed, or use --dry-run to preview.',
      'CleanupOrphanedUploads',
    );
    return 1;
  }

  // Read from primary: we need an accurate, up-to-date list of soft-deleted
  // uploads so we never delete an object whose row was restored.
  type OrphanedRow = {
    id: string;
    filename: string;
    deleted_at: Date;
  };

  const orphanedRows = await dbPrimary.$client.query<OrphanedRow>(
    sql`SELECT id, filename, deleted_at
        FROM uploads
        WHERE deleted_at IS NOT NULL
          AND deleted_at < ${cutoff.toISOString()}
        ORDER BY deleted_at ASC`,
  );

  let deleted = 0;
  let skipped = 0;
  let errors = 0;

  for (const row of orphanedRows) {
    if (args.dryRun) {
      log.info(
        `[dry-run] would delete S3 object key=${row.filename} (upload id=${row.id}, deleted_at=${row.deleted_at.toISOString()})`,
        'CleanupOrphanedUploads',
      );
      skipped += 1;
      continue;
    }

    try {
      await s3Client.send(
        new DeleteObjectCommand({ Bucket: bucket, Key: row.filename }),
      );
      log.info(
        `Deleted S3 object key=${row.filename} (upload id=${row.id})`,
        'CleanupOrphanedUploads',
      );
      deleted += 1;
    } catch (error) {
      errors += 1;
      log.error(
        `Failed to delete S3 object key=${row.filename} (upload id=${row.id}): ${(error as Error).message}`,
        'CleanupOrphanedUploads',
      );
    }
  }

  log.info(
    `Cleanup complete: deleted=${deleted}, skipped=${skipped}, errors=${errors}, total=${orphanedRows.length}`,
    'CleanupOrphanedUploads',
  );

  return errors > 0 ? 1 : 0;
}

main()
  .then((code) => process.exit(code))
  .catch((error) => {
    log.error(
      `Cleanup failed: ${(error as Error).message}`,
      'CleanupOrphanedUploads',
    );
    process.exit(1);
  });
