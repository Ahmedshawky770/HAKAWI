-- hakawi:down reversibility=reversible data-loss=none reason=Drops the purge_job_runs table and the purge_soft_deleted function. No data is lost — the table only contains audit logs of purge runs, and the function is a utility. Any scheduled cron jobs calling the function will fail after rollback and must be removed by the operator.
DROP FUNCTION IF EXISTS purge_soft_deleted(integer, integer, boolean);
--> statement-breakpoint
DROP TABLE IF EXISTS "purge_job_runs";