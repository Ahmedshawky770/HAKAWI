-- Make `stories.slug` unique, so the slug collision walk in `StoriesService.insertWithResolvedSlug`
-- has a database backstop.
--
-- WHY THIS IS NEEDED. `migrations/0001_create_stories_tables.sql:52` created a PLAIN index on
-- `stories.slug`, and the application behaved as though a unique one existed:
-- `StoriesService.insertWithResolvedSlug` walks candidate slugs while `slugIsTaken` reports free and
-- catches a unique-violation on insert. The catch can never fire, because there is no constraint to
-- violate. Two concurrent `POST /stories` calls for the same title therefore both see the slug as
-- free and both insert it, and `/stories/slug/:slug` then returns an arbitrary one of the two.
--
-- WHY NOT A PARTIAL INDEX ON `deleted_at IS NULL`. `StoriesService.slugIsTaken` deliberately counts
-- a soft-deleted story as still owning its slug, and `softDelete` keeps the row. A partial index
-- would let a new story claim a soft-deleted slug, and the very next read through `slugIsTaken`
-- would then disagree with the database — reintroducing the split-brain this migration is removing.
-- The plain unique index is the constraint that matches the documented contract.
--
-- WHY A PRE-FLIGHT CHECK AND NOT A DE-DUPLICATION. Duplicates may already exist on any database that
-- has accepted two concurrent creates since the slug walk landed. Choosing a survivor here would be
-- a silent rewrite of a published URL — somebody's bookmark or inbound link points at one of them —
-- and which one to keep is a per-row editorial decision, not a migration's. So the migration refuses
-- to apply and names the offending slugs instead. Run `npm run migration:status` first to see
-- whether any exist.
DO $$
DECLARE
  duplicate_slugs TEXT;
BEGIN
  SELECT string_agg(DISTINCT slug, ', ') INTO duplicate_slugs
  FROM stories
  GROUP BY slug
  HAVING COUNT(*) > 1;

  IF duplicate_slugs IS NOT NULL THEN
    RAISE EXCEPTION
      'stories.slug contains duplicate values (%), so the unique index cannot be created. Resolve each one by hand — deleting or renaming the row that should not keep the slug — then re-run this migration.',
      duplicate_slugs;
  END IF;
END $$;
--> statement-breakpoint

-- The existing plain index is kept: it is a strict prefix of the unique one, so it is redundant for
-- lookups, but dropping it is a non-additive change that belongs in its own migration rather than as
-- a side effect of adding a constraint.
CREATE UNIQUE INDEX IF NOT EXISTS "stories_slug_unique" ON "stories" ("slug");
