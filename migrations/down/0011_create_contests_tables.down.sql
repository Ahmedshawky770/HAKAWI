-- hakawi:down reversibility=data-loss data-loss=rows reason=Drops contests, contest_submissions, contest_votes and contest_prizes. Awarded prizes and the contest archive are lost.
DROP INDEX IF EXISTS "contest_prizes_winner_id_idx";
DROP INDEX IF EXISTS "contest_prizes_contest_id_idx";
DROP INDEX IF EXISTS "contest_votes_user_id_idx";
DROP INDEX IF EXISTS "contest_votes_contest_id_idx";
DROP INDEX IF EXISTS "contest_votes_unique_idx";
DROP INDEX IF EXISTS "contest_submissions_status_idx";
DROP INDEX IF EXISTS "contest_submissions_author_id_idx";
DROP INDEX IF EXISTS "contest_submissions_contest_id_idx";
DROP INDEX IF EXISTS "contests_end_date_idx";
DROP INDEX IF EXISTS "contests_start_date_idx";
DROP INDEX IF EXISTS "contests_created_by_idx";
DROP INDEX IF EXISTS "contests_status_idx";
DROP INDEX IF EXISTS "contests_category_id_idx";
DROP TABLE IF EXISTS "contest_prizes";
DROP TABLE IF EXISTS "contest_votes";
DROP TABLE IF EXISTS "contest_submissions";
DROP TABLE IF EXISTS "contests";
