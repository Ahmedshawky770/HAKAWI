-- hakawi:down reversibility=data-loss data-loss=rows reason=Drops rentals and rental_extensions. library.rental_id still references rentals, so roll back 0012 first.
DROP INDEX IF EXISTS "rental_extensions_rental_id_idx";
DROP INDEX IF EXISTS "rentals_status_idx";
DROP INDEX IF EXISTS "rentals_book_id_idx";
DROP INDEX IF EXISTS "rentals_user_id_idx";
DROP TABLE IF EXISTS "rental_extensions";
DROP TABLE IF EXISTS "rentals";
