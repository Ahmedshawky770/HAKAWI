-- Down script for 0039_partition_cutover.sql
-- Reversibility: data-loss — the legacy tables (`messages`, `notifications`,
-- `payment_transactions`, `reactions`) were dropped and cannot be recreated from
-- this script. Their data lives on in the `*_p` partitioned parents.
-- This down script is documentation only; it performs no destructive action.
-- Re-run with --allow-data-loss.

SELECT 'Legacy tables were dropped in 0039; they cannot be restored from this down script.' AS notice;
