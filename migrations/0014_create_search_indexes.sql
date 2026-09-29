CREATE INDEX IF NOT EXISTS "stories_search_idx" ON "stories" USING GIN (to_tsvector('simple', title || ' ' || COALESCE(excerpt, '')));
CREATE INDEX IF NOT EXISTS "users_search_idx" ON "users" USING GIN (to_tsvector('simple', name));
CREATE INDEX IF NOT EXISTS "categories_search_idx" ON "categories" USING GIN (to_tsvector('simple', name));