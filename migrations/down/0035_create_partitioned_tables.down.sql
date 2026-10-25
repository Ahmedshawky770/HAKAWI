-- Down script for 0035_create_partitioned_tables.sql
-- Reversibility: data-loss — drops the partitioned tables and all their
-- partitions, plus the archiving functions. No data in the legacy tables is
-- touched, but any data written to the *_p tables is lost.
-- Re-run with --allow-data-loss.

DROP FUNCTION IF EXISTS archive_reactions_before(timestamp);
DROP FUNCTION IF EXISTS archive_payment_transactions_before(timestamp);
DROP FUNCTION IF EXISTS archive_notifications_before(timestamp);
DROP FUNCTION IF EXISTS archive_messages_before(timestamp);

--> statement-breakpoint

DROP TABLE IF EXISTS reactions_p CASCADE;
DROP TABLE IF EXISTS payment_transactions_p CASCADE;
DROP TABLE IF EXISTS notifications_p CASCADE;
DROP TABLE IF EXISTS messages_p CASCADE;
