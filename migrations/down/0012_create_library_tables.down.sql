-- hakawi:down reversibility=data-loss data-loss=rows reason=Drops the library table, which is the record of what each user owns or is borrowing.
DROP INDEX IF EXISTS "library_user_book_idx";
DROP INDEX IF EXISTS "library_rental_id_idx";
DROP INDEX IF EXISTS "library_book_id_idx";
DROP INDEX IF EXISTS "library_user_id_idx";
DROP TABLE IF EXISTS "library";
