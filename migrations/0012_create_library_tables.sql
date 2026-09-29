CREATE TABLE IF NOT EXISTS "library" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id"),
  "book_id" uuid NOT NULL REFERENCES "books"("id"),
  "rental_id" uuid REFERENCES "rentals"("id"),
  "status" varchar(20) DEFAULT 'owned' NOT NULL,
  "added_at" timestamp DEFAULT now() NOT NULL,
  "last_accessed_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "library_user_id_idx" ON "library" ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "library_book_id_idx" ON "library" ("book_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "library_rental_id_idx" ON "library" ("rental_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "library_user_book_idx" ON "library" ("user_id", "book_id");
