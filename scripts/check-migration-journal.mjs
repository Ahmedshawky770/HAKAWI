#!/usr/bin/env node
/**
 * WHY THIS SCRIPT EXISTS.
 *
 * `migrations/meta/_journal.json` is a drizzle-kit artefact, not the ledger — the applied
 * history lives in the `drizzle_migrations` table and is driven by
 * `backend/src/db/migrations/migration-runner.ts` (see `migrations/meta/README.md`). But the
 * journal is the index a reader sees next to the `.sql` files, and the deploy workflows used to
 * apply the chain with `npx drizzle-kit migrate`, which reads exactly that journal. It recorded
 * 18 entries against 29 `.sql` files, so every deploy silently applied 18 of 29 migrations and
 * MFA support (0029) and the books-owner backfills (0019, 0025) never reached a database.
 *
 * `npm run migration:run` applies all 29 because it orders by filename prefix and never reads the
 * journal — which is why the journal could rot unnoticed for eleven migrations. This guard is the
 * assertion that closes that gap: it fails when the index stops describing the directory.
 *
 * Checks, all structural and database-free:
 *   1. every journal entry's tag resolves to a real `migrations/NNNN_tag.sql`;
 *   2. every `.sql` file is claimed by exactly one journal entry;
 *   3. the entry count equals the file count;
 *   4. `idx` is unique and strictly increasing, and the tag order matches the file order on disk;
 *   5. the journal shape matches the one drizzle writes (`version`, `dialect`, `breakpoints`).
 *
 * NOT checked, deliberately: `when` is a creation timestamp, not an ordering guarantee. This
 * journal is hand-maintained (the 17 historical entries were generated after the fact), and the
 * committed values already go backwards at 0014 -> 0015. Writing them by hand after the fact is
 * honest; asserting monotonicity on them would fail forever.
 *
 * Run it from anywhere: paths are resolved from this file, not from the cwd.
 *
 *   node scripts/check-migration-journal.mjs
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MIGRATIONS_DIR = join(REPO_ROOT, 'migrations');
const JOURNAL_PATH = join(MIGRATIONS_DIR, 'meta', '_journal.json');

/** The known, permanent gap between 0016 and 0018. See migrations/README.md. */
const DRIZZLE_JOURNAL_VERSION = '7';
const DRIZZLE_DIALECT = 'pg';

const failures = [];
const notes = [];

function fail(message) {
  failures.push(message);
}

function listSqlFiles() {
  return readdirSync(MIGRATIONS_DIR)
    .filter((entry) => entry.endsWith('.sql'))
    .sort();
}

function loadJournal() {
  if (!existsSync(JOURNAL_PATH)) {
    fail(`missing journal: ${JOURNAL_PATH}`);
    process.exit(1);
  }

  let parsed;
  try {
    parsed = JSON.parse(readFileSync(JOURNAL_PATH, 'utf8'));
  } catch (error) {
    fail(`${JOURNAL_PATH} is not valid JSON: ${String(error)}`);
    process.exit(1);
  }

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    fail(`${JOURNAL_PATH} must contain a JSON object`);
    process.exit(1);
  }

  return parsed;
}

function assertEntryShape(entry, index) {
  const where = `journal entry ${index}`;
  if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
    fail(`${where} is not an object`);
    return false;
  }
  if (entry.version !== DRIZZLE_JOURNAL_VERSION) {
    fail(`${where} has version ${JSON.stringify(entry.version)}, expected ${JSON.stringify(DRIZZLE_JOURNAL_VERSION)}`);
  }
  if (typeof entry.when !== 'number' || !Number.isFinite(entry.when)) {
    fail(`${where} has a non-numeric "when" (${JSON.stringify(entry.when)})`);
  }
  if (typeof entry.tag !== 'string' || entry.tag.length === 0) {
    fail(`${where} has no tag`);
    return false;
  }
  if (entry.breakpoints !== true) {
    fail(`${where} is missing breakpoints: true`);
  }
  return true;
}

function main() {
  const journal = loadJournal();

  if (journal.dialect !== DRIZZLE_DIALECT) {
    fail(`journal dialect is ${JSON.stringify(journal.dialect)}, expected ${JSON.stringify(DRIZZLE_DIALECT)}`);
  }

  const entries = Array.isArray(journal.entries) ? journal.entries : null;
  if (entries === null) {
    fail('journal has no "entries" array');
    process.exit(1);
  }

  const files = listSqlFiles();

  // 1. tags must resolve to files, and each tag must be claimed only once.
  const claimedBy = new Map();
  entries.forEach((entry, index) => {
    if (!assertEntryShape(entry, index)) {
      return;
    }
    const existing = claimedBy.get(entry.tag);
    if (existing !== undefined) {
      fail(`tag ${entry.tag} is claimed by two journal entries (idx ${existing} and ${String(entry.idx)})`);
      return;
    }
    claimedBy.set(entry.tag, entry.idx);

    const file = `${entry.tag}.sql`;
    if (!files.includes(file)) {
      fail(`journal tag ${entry.tag} does not resolve to ${file} in ${MIGRATIONS_DIR}`);
    }
  });

  // 2. every file must be claimed, and only by the entry that names it.
  const ids = new Set(files.map((file) => file.slice(0, -'.sql'.length)));
  for (const id of ids) {
    if (!claimedBy.has(id)) {
      fail(`${id}.sql has no journal entry in ${JOURNAL_PATH}`);
    }
  }
  for (const tag of claimedBy.keys()) {
    if (!ids.has(tag)) {
      fail(`journal tag ${tag} does not match any migration id in ${MIGRATIONS_DIR}`);
    }
  }

  // 3. count equality.
  if (entries.length !== files.length) {
    fail(
      `journal has ${entries.length} entr${entries.length === 1 ? 'y' : 'ies'} but ${MIGRATIONS_DIR} holds ` +
        `${files.length} .sql files; the missing tags are: ` +
        `${[...ids].filter((id) => !claimedBy.has(id)).join(', ') || '(none)'}`,
    );
  }

  // 4. idx must be a unique, strictly-increasing run, and the order must match the files on disk.
  //    Contiguity is NOT required: drizzle increments a counter rather than mirroring the
  //    sequence prefix, and the committed journal already skips idx 17 because 0017 is a permanent
  //    hole (migrations/README.md). Requiring 0..n-1 here would fail on that hole forever.
  const seenIdx = new Set();
  entries.forEach((entry, index) => {
    if (!assertEntryShape(entry, index)) {
      return;
    }
    const idx = entry.idx;
    if (typeof idx !== 'number' || !Number.isInteger(idx)) {
      fail(`journal entry ${index} (${entry.tag}) has a non-integer idx ${JSON.stringify(idx)}`);
      return;
    }
    if (seenIdx.has(idx)) {
      fail(`idx ${idx} is claimed by more than one journal entry`);
      return;
    }
    seenIdx.add(idx);
    const previous = entries[index - 1];
    if (index > 0 && assertEntryShape(previous, 0) && typeof previous.idx === 'number' && idx < previous.idx) {
      fail(`journal idx decreases at position ${index} (${entry.tag}, idx ${idx} after idx ${String(previous.idx)})`);
    }
  });
  const fileOrder = files.map((file) => file.slice(0, -'.sql'.length));
  const journalOrder = entries.map((entry) => entry.tag);
  if (fileOrder.length === journalOrder.length && fileOrder.some((id, index) => id !== journalOrder[index])) {
    const firstDifference = fileOrder.findIndex((id, index) => id !== journalOrder[index]);
    fail(
      `journal order does not match the .sql order: position ${firstDifference} names ${journalOrder[firstDifference]} ` +
        `but the file at that position is ${fileOrder[firstDifference]}.sql`,
    );
  }

  // Sequence holes are information, not failure: `migration:create` allocates max(sequence) + 1,
  // so a hole is permanent and must never be back-filled by hand (migrations/README.md).
  const sequences = fileOrder.map((id) => Number.parseInt(id.slice(0, 4), 10));
  for (let index = 1; index < sequences.length; index += 1) {
    const gap = sequences[index] - sequences[index - 1];
    if (gap > 1) {
      const missing = [];
      for (let missing_ = sequences[index - 1] + 1; missing_ < sequences[index]; missing_ += 1) {
        missing.push(String(missing_).padStart(4, '0'));
      }
      notes.push(
        `permanent gap: no migration${missing.length === 1 ? '' : 's'} ${missing.join(', ')} ` +
          `(between ${fileOrder[index - 1]} and ${fileOrder[index]}); do not back-fill it by hand`,
      );
    }
  }

  if (notes.length > 0) {
    for (const note of notes) {
      console.log(`note: ${note}`);
    }
  }

  if (failures.length > 0) {
    console.error(`\nMigration journal check FAILED (${failures.length}):`);
    for (const failure of failures) {
      console.error(`  - ${failure}`);
    }
    process.exit(1);
  }

  console.log(
    `Migration journal OK: ${entries.length} journal entries, ${files.length} .sql files, ` +
      'every tag resolves and every file is claimed once.',
  );
}

main();
