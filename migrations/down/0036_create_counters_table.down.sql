-- hakawi:down reversibility=data-loss data-loss=rows reason=Rollback reverses this migration; data written to affected tables may be lost.
-- Down script for 0036_create_counters_table.sql
-- Reversibility: data-loss — drops the counters table. The cache columns on
-- stories, books and comments are untouched, so no application data is lost
-- from the main tables. The counters themselves are lost (derived state,
-- recomputable from reactions/comments/stories/books).
-- Re-run with --allow-data-loss.

DROP TABLE IF EXISTS counters CASCADE;
