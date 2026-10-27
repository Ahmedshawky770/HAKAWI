-- hakawi:down reversibility=data-loss data-loss=rows reason=Rollback reverses this migration; data written to affected tables may be lost.
-- Down script for 0037_books_owner_id_not_null.sql
-- Reversibility: data-loss — drops the NOT NULL constraint so NULL owners are
-- possible again. No data is lost from the books table.
-- Re-run with --allow-data-loss.

ALTER TABLE "books" ALTER COLUMN "owner_id" DROP NOT NULL;
