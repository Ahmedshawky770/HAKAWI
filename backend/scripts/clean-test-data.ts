import { config } from 'dotenv';
config({ path: '/home/ahmedshawky77/HAKAWI/.env', override: false });

import process from 'node:process';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { sql } from 'drizzle-orm';
import {
  messages, conversations, notifications, notificationPreferences,
  comments, commentReactions, reactions, follows, storyTags,
  stories, categories, tags, users, userBadges, badges,
  books, bookTags, bookCategories, library,
  contests, contestSubmissions, contestVotes, contestPrizes,
  rentals, rentalExtensions, payments, paymentTransactions, refunds,
  uploads, publisherApplications, publisherWriters,
  reports, moderationActions, userRestrictions, adminRoleAssignments,
  readingProgress,
} from '../src/db/schema/index.ts';

/**
 * Dev/test data cleanup. DANGEROUS: deletes application rows.
 * Safety defaults:
 * - dry-run unless --execute is passed
 * - requires --yes and --confirm=<db-name>
 * - requires ALLOW_TEST_DATA_CLEANUP=true
 * - refuses production NODE_ENV/hosts and non-dev/test DB names unless --force-unsafe
 */
const args = new Set(process.argv.slice(2));
const confirmArg = process.argv.slice(2).find((a) => a.startsWith('--confirm='))?.split('=')[1] ?? '';
const execute = args.has('--execute');
const forceUnsafe = args.has('--force-unsafe');
const allowEnv = process.env.ALLOW_TEST_DATA_CLEANUP === 'true';

const host = process.env.DB_HOST || 'localhost';
const port = Number.parseInt(process.env.DB_PORT || '5432', 10);
const database = process.env.DB_NAME || 'hakawi';
const user = process.env.DB_USER || 'postgres';
const password = process.env.DB_PASSWORD;

const productionHosts = new Set(['hakawi-prod', 'production', 'prod']);
const safeDbPattern = /(^|[_-])(test|dev|local)([_-]|$)/i;

function fail(msg: string): never {
  console.error(`Refusing to run: ${msg}`);
  console.error('Usage: ALLOW_TEST_DATA_CLEANUP=true tsx backend/scripts/clean-test-data.ts --execute --yes --confirm=<DB_NAME> [--force-unsafe]');
  process.exit(1);
}

if (process.env.NODE_ENV === 'production') fail('NODE_ENV=production');
if (productionHosts.has(host)) fail(`production-like DB_HOST "${host}"`);
if (!password) fail('DB_PASSWORD is required; do not use implicit defaults for destructive scripts');
if (!allowEnv) fail('ALLOW_TEST_DATA_CLEANUP=true is required');
if (!args.has('--yes')) fail('--yes is required');
if (confirmArg !== database) fail(`--confirm must exactly match DB_NAME (${database})`);
if (!forceUnsafe && !safeDbPattern.test(database)) fail(`DB_NAME "${database}" does not look like test/dev/local; pass --force-unsafe only if you are certain`);

const tables = [
  { name: 'messages', table: messages },
  { name: 'conversations', table: conversations },
  { name: 'notifications', table: notifications },
  { name: 'notification_preferences', table: notificationPreferences },
  { name: 'comments', table: comments },
  { name: 'comment_reactions', table: commentReactions },
  { name: 'reactions', table: reactions },
  { name: 'follows', table: follows },
  { name: 'story_tags', table: storyTags },
  { name: 'stories', table: stories },
  { name: 'categories', table: categories },
  { name: 'tags', table: tags },
  { name: 'user_badges', table: userBadges },
  { name: 'badges', table: badges },
  { name: 'book_tags', table: bookTags },
  { name: 'books', table: books },
  { name: 'book_categories', table: bookCategories },
  { name: 'library', table: library },
  { name: 'contest_submissions', table: contestSubmissions },
  { name: 'contest_votes', table: contestVotes },
  { name: 'contest_prizes', table: contestPrizes },
  { name: 'contests', table: contests },
  { name: 'rental_extensions', table: rentalExtensions },
  { name: 'rentals', table: rentals },
  { name: 'payment_transactions', table: paymentTransactions },
  { name: 'refunds', table: refunds },
  { name: 'payments', table: payments },
  { name: 'uploads', table: uploads },
  { name: 'publisher_writers', table: publisherWriters },
  { name: 'publisher_applications', table: publisherApplications },
  { name: 'reports', table: reports },
  { name: 'moderation_actions', table: moderationActions },
  { name: 'user_restrictions', table: userRestrictions },
  { name: 'admin_role_assignments', table: adminRoleAssignments },
  { name: 'reading_progress', table: readingProgress },
];

async function main() {
  console.log(`Target: ${user}@${host}:${port}/${database}`);
  console.log(`Mode: ${execute ? 'EXECUTE' : 'DRY-RUN'}`);
  console.log(`Tables: ${tables.map((t) => t.name).join(', ')}`);

  if (!execute) {
    console.log('Dry run only. Re-run with --execute --yes --confirm=<DB_NAME> and ALLOW_TEST_DATA_CLEANUP=true to delete rows.');
    return;
  }

  const pool = new Pool({ host, port, database, user, password, max: 5, connectionTimeoutMillis: 5000, allowExitOnIdle: true });
  const db = drizzle(pool);
  try {
    await db.execute(sql`BEGIN`);
    for (const { name, table } of tables) {
      const result = await db.delete(table);
      console.log(`Cleaned ${name}: ${result.rowCount ?? 0}`);
    }
    await db.execute(sql`COMMIT`);
    console.log('Cleanup committed.');
  } catch (error) {
    await db.execute(sql`ROLLBACK`).catch(() => undefined);
    console.error('Cleanup failed; rolled back.', error);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

await main();
