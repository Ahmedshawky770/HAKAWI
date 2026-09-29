CREATE TABLE IF NOT EXISTS "rentals" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id"),
  "book_id" uuid NOT NULL REFERENCES "books"("id"),
  "status" varchar(20) DEFAULT 'active' NOT NULL,
  "start_date" timestamp NOT NULL,
  "end_date" timestamp NOT NULL,
  "extended_count" integer DEFAULT 0 NOT NULL,
  "max_extensions" integer DEFAULT 2 NOT NULL,
  "returned_at" timestamp,
  "deleted_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "rental_extensions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "rental_id" uuid NOT NULL REFERENCES "rentals"("id"),
  "previous_end_date" timestamp NOT NULL,
  "new_end_date" timestamp NOT NULL,
  "extension_days" integer NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "rentals_user_id_idx" ON "rentals" ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "rentals_book_id_idx" ON "rentals" ("book_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "rentals_status_idx" ON "rentals" ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "rental_extensions_rental_id_idx" ON "rental_extensions" ("rental_id");
