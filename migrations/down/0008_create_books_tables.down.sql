-- hakawi:down reversibility=data-loss data-loss=rows reason=Drops book_categories, books, book_tags and reading_progress. Rentals and library rows from later migrations still reference books, so roll those back first.
DROP INDEX IF EXISTS "reading_progress_book_id_idx";
DROP INDEX IF EXISTS "reading_progress_user_id_idx";
DROP INDEX IF EXISTS "reading_progress_user_book_idx";
DROP INDEX IF EXISTS "book_tags_tag_id_idx";
DROP INDEX IF EXISTS "book_tags_book_id_idx";
DROP INDEX IF EXISTS "books_isbn_idx";
DROP INDEX IF EXISTS "books_title_idx";
DROP INDEX IF EXISTS "books_category_id_idx";
DROP INDEX IF EXISTS "books_status_idx";
DROP INDEX IF EXISTS "books_author_idx";
DROP INDEX IF EXISTS "book_categories_slug_idx";
DROP TABLE IF EXISTS "reading_progress";
DROP TABLE IF EXISTS "book_tags";
DROP TABLE IF EXISTS "books";
DROP TABLE IF EXISTS "book_categories";
