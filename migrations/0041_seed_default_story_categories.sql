-- Seed the default story categories the frontend filter and i18n rely on.
--
-- WHY THIS EXISTS. `GET /api/v1/stories?category=<slug>` resolves the slug through
-- `CategoriesService.findBySlug` and 404s when no row matches, and the frontend's
-- `StoryCategoryOptions` hard-codes the four slugs below as its filter values. The
-- categories table used to be empty in every environment that did not hand-create
-- rows, so selecting "Fiction" (or any other genre) answered 404 "Category not
-- found". Seeding the four default genres here makes the filter usable out of the
-- box while leaving taxonomy management (creating/renaming genres) to editors.
--
-- Idempotent: rows whose slug already exists are left untouched, so re-running
-- the migration or applying it over an existing catalogue cannot clobber an
-- editor's renamed category.

INSERT INTO categories (name, slug, sort_order, is_active)
SELECT v.name, v.slug, v.sort_order, v.is_active
FROM (VALUES
  ('fiction', 'fiction', 0, true),
  ('non-fiction', 'non-fiction', 1, true),
  ('poetry', 'poetry', 2, true),
  ('fantasy', 'fantasy', 3, true)
) AS v(name, slug, sort_order, is_active)
WHERE NOT EXISTS (
  SELECT 1 FROM categories c WHERE c.slug = v.slug
);
