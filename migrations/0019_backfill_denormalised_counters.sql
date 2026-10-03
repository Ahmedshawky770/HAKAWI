-- Backfill the four denormalised counters from their source tables.
--
-- WHY THIS MIGRATION EXISTS. The counters were declared and initialised to 0 by the create path
-- and then never written again:
--
--   stories.like_count      no writer anywhere  -> always 0
--   stories.comment_count   no writer anywhere  -> always 0
--   comments.like_count     no writer anywhere  -> always 0
--   comments.reply_count    incremented on reply create, never decremented -> only ever climbed
--
-- The event handlers that now maintain them only fire on NEW activity, so every existing row in
-- every deployed database is still wrong. This closes that gap once; the handlers keep it correct
-- from here.
--
-- WHY RE-COUNT AND NOT ADD. An additive correction would need to know how far each counter had
-- drifted, and there is no record of that. Re-counting is idempotent: running it twice produces the
-- same result, and running it after some rows have already been corrected by the handlers still
-- produces the correct value.
--
-- WHY A JOIN-BASED UPDATE AND NOT FOUR ROUND TRIPS THROUGH THE APPLICATION. A correlated subquery
-- per counter is a single statement per table, runs inside the migration's transaction, and needs
-- no application code path. The alternative — a script that loads every story and writes back — is
-- four times the I/O and can leave the database half-corrected if it is interrupted.
--
-- WHY SOFT-DELETED ROWS ARE EXCLUDED WHERE THEY EXIST. `comments.is_deleted` marks a tombstone:
-- `CommentsService.findById` rejects it with a 404 and `findReplies` filters it out, so counting
-- one in `reply_count` would make the counter disagree with the list rendered beside it.
-- `stories` has no `is_deleted` — it is a hard delete plus a `deleted_at` column that the soft
-- path in `StoriesService.softDelete` also uses, so both are excluded. Neither reactions table has
-- a soft-delete column at all, so those counts are unconditional.

-- 1. stories.like_count from the reactions table.
--
-- `reactions_unique_idx` is on (user_id, story_id), so there is at most one reaction per user per
-- story and a plain COUNT(*) is already the distinct count.
UPDATE stories AS s
SET like_count = COALESCE(r.total, 0)
FROM (SELECT story_id, COUNT(*)::int AS total FROM reactions GROUP BY story_id) AS r
WHERE r.story_id = s.id;
--> statement-breakpoint

-- 2. stories.comment_count from the comments table.
--
-- Counts replies as well as top-level comments, because the column is the story's TOTAL, not the
-- size of the top-level listing. Tombstones are excluded.
UPDATE stories AS s
SET comment_count = COALESCE(c.total, 0)
FROM (
  SELECT story_id, COUNT(*)::int AS total
  FROM comments
  WHERE is_deleted = false
  GROUP BY story_id
) AS c
WHERE c.story_id = s.id;
--> statement-breakpoint

-- Stories with no reactions and no comments keep their column default of 0, which is already
-- correct, so the two UPDATEs above need no ELSE branch. Stated explicitly rather than left
-- implicit: a future reader should not have to check whether an untouched story is now NULL.
UPDATE stories SET like_count = 0 WHERE like_count IS NULL;
--> statement-breakpoint
UPDATE stories SET comment_count = 0 WHERE comment_count IS NULL;
--> statement-breakpoint

-- 3. comments.like_count from the comment_reactions table.
--
-- `comment_reactions_unique_idx` is on (user_id, comment_id), so one row per pair and a plain
-- COUNT(*) is the distinct count.
--
-- A reaction on a soft-deleted comment is left alone rather than zeroed: the comment is a
-- tombstone, nobody reads its counter, and rewriting it would make this migration's behaviour
-- depend on a cleanup that has not happened yet.
UPDATE comments AS c
SET like_count = COALESCE(cr.total, 0)
FROM (
  SELECT comment_id, COUNT(*)::int AS total
  FROM comment_reactions
  GROUP BY comment_id
) AS cr
WHERE cr.comment_id = c.id AND c.is_deleted = false;
--> statement-breakpoint

UPDATE comments SET like_count = 0 WHERE like_count IS NULL;
--> statement-breakpoint

-- 4. comments.reply_count from the comments table itself.
--
-- This is the counter that could only climb, so it is the one most likely to be wrong on a
-- long-lived database. A parent's `reply_count` is the number of its live direct children, which is
-- exactly what `CommentsRepository.countReplies` reports — so after this statement the column
-- agrees with the endpoint that renders it.
UPDATE comments AS parent
SET reply_count = COALESCE(children.total, 0)
FROM (
  SELECT parent_id, COUNT(*)::int AS total
  FROM comments
  WHERE parent_id IS NOT NULL AND is_deleted = false
  GROUP BY parent_id
) AS children
WHERE children.parent_id = parent.id;
--> statement-breakpoint

-- A comment with NO live children never appears in the GROUP BY above, and an `UPDATE ... FROM`
-- only touches rows the FROM produced, so such a comment keeps whatever the old only-ever-climbing
-- value happened to be. This statement closes that gap.
--
-- WHY `NOT EXISTS` AND NOT `SET reply_count = 0 WHERE reply_count <> 0`. That is the obvious
-- one-liner and it is wrong: it would also zero every parent the statement above had just
-- corrected, since their new value is non-zero too. The predicate has to be "has no live children",
-- which excludes precisely the rows that are already right.
UPDATE comments AS c
SET reply_count = 0
WHERE NOT EXISTS (
  SELECT 1
  FROM comments AS child
  WHERE child.parent_id = c.id AND child.is_deleted = false
);
