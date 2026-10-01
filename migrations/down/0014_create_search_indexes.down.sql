-- hakawi:down reversibility=reversible data-loss=none reason=Drops three GIN expression indexes. No table data is touched; full-text search stops working until they are recreated.
DROP INDEX IF EXISTS "categories_search_idx";
DROP INDEX IF EXISTS "users_search_idx";
DROP INDEX IF EXISTS "stories_search_idx";
