-- Make conversations unique on (participant1_id, participant2_id).
--
-- WHY. The current schema has a plain index named `conversations_unique_idx` on
-- (participant1_id, participant2_id) but it is NOT a UNIQUE constraint. This means
-- two users can have MULTIPLE conversation rows between them, which breaks the
-- invariant that a DM thread is a single thread per user pair.
--
-- The bug was introduced because `index()` was used instead of `uniqueIndex()`
-- in `backend/src/db/schema/social.schema.ts:180`. The name `uniqueConversation`
-- is aspirational — it names the intent but the constraint is missing.
--
-- WHY THIS MIGRATION IS TRICKY. If duplicate conversations already exist (same
-- participant pair in either order), the unique index creation will FAIL. The
-- migration handles this in three steps:
--
-- STEP 1 — DEDUPLICATE. Keep the oldest conversation (earliest `created_at`) for
-- each unordered pair, move all messages from the duplicates to the survivor,
-- then delete the duplicates.
--
-- STEP 2 — NORMALIZE ORDER. Ensure participant1_id < participant2_id for all
-- rows so the unique index works regardless of who started the conversation.
--
-- STEP 3 — CREATE UNIQUE INDEX. Replace the plain index with a real unique one.

-- ============================================================
-- STEP 1: Deduplicate existing conversations
-- ============================================================

-- Create a temp table mapping duplicate conversations to their survivor
CREATE TEMP TABLE "_conv_duplicates" AS
WITH ordered AS (
  SELECT
    id,
    LEAST(participant1_id, participant2_id) AS p1,
    GREATEST(participant1_id, participant2_id) AS p2,
    created_at,
    ROW_NUMBER() OVER (PARTITION BY LEAST(participant1_id, participant2_id), GREATEST(participant1_id, participant2_id) ORDER BY created_at ASC) AS rn
  FROM "conversations"
),
survivors AS (
  SELECT id AS survivor_id, p1, p2
  FROM ordered
  WHERE rn = 1
),
duplicates AS (
  SELECT o.id AS duplicate_id, s.survivor_id
  FROM ordered o
  JOIN survivors s ON s.p1 = o.p1 AND s.p2 = o.p2
  WHERE o.rn > 1
)
SELECT duplicate_id, survivor_id FROM duplicates;

--> statement-breakpoint

-- Move messages from duplicates to survivors
UPDATE "messages" m
SET "conversation_id" = d.survivor_id
FROM "_conv_duplicates" d
WHERE m.conversation_id = d.duplicate_id;

--> statement-breakpoint

-- Delete duplicate conversations
DELETE FROM "conversations"
WHERE id IN (SELECT duplicate_id FROM "_conv_duplicates");

--> statement-breakpoint

-- ============================================================
-- STEP 2: Normalize participant order (p1 < p2)
-- ============================================================

UPDATE "conversations"
SET
  "participant1_id" = LEAST("participant1_id", "participant2_id"),
  "participant2_id" = GREATEST("participant1_id", "participant2_id")
WHERE "participant1_id" > "participant2_id";

--> statement-breakpoint

-- ============================================================
-- STEP 3: Replace plain index with UNIQUE INDEX
-- ============================================================

DROP INDEX IF EXISTS "conversations_unique_idx";

--> statement-breakpoint

CREATE UNIQUE INDEX "conversations_unique_idx" ON "conversations" ("participant1_id", "participant2_id");

--> statement-breakpoint

-- ============================================================
-- CLEANUP
-- ============================================================

DROP TABLE IF EXISTS "_conv_duplicates";

--> statement-breakpoint

-- ============================================================
-- VERIFICATION
-- ============================================================
-- SELECT COUNT(*) FROM conversations GROUP BY participant1_id, participant2_id HAVING COUNT(*) > 1;
-- Should return 0 rows