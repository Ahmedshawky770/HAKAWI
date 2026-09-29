CREATE TABLE IF NOT EXISTS "book_categories" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" varchar(100) NOT NULL,
  "slug" varchar(100) NOT NULL,
  "description" text,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "books" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "title" varchar(255) NOT NULL,
  "author" varchar(255) NOT NULL,
  "description" text,
  "cover_image" text,
  "isbn" varchar(20),
  "publisher" varchar(255),
  "publish_date" timestamp,
  "language" varchar(50),
  "page_count" integer,
  "file_url" text,
  "file_type" varchar(50),
  "price" integer,
  "is_free" boolean DEFAULT true NOT NULL,
  "status" varchar(20) DEFAULT 'draft' NOT NULL,
  "category_id" uuid REFERENCES "book_categories"("id"),
  "view_count" integer DEFAULT 0 NOT NULL,
  "like_count" integer DEFAULT 0 NOT NULL,
  "download_count" integer DEFAULT 0 NOT NULL,
  "deleted_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "book_tags" (
  "book_id" uuid NOT NULL REFERENCES "books"("id"),
  "tag_id" uuid NOT NULL REFERENCES "tags"("id"),
  "created_at" timestamp DEFAULT now() NOT NULL,
  PRIMARY KEY ("book_id", "tag_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "reading_progress" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id"),
  "book_id" uuid NOT NULL REFERENCES "books"("id"),
  "current_page" integer DEFAULT 0 NOT NULL,
  "total_pages" integer,
  "progress_percentage" integer DEFAULT 0 NOT NULL,
  "started_at" timestamp DEFAULT now() NOT NULL,
  "last_read_at" timestamp DEFAULT now() NOT NULL,
  "completed_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "book_categories_slug_idx" ON "book_categories" ("slug");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "books_author_idx" ON "books" ("author");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "books_status_idx" ON "books" ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "books_category_id_idx" ON "books" ("category_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "books_title_idx" ON "books" ("title");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "books_isbn_idx" ON "books" ("isbn");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "book_tags_book_id_idx" ON "book_tags" ("book_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "book_tags_tag_id_idx" ON "book_tags" ("tag_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reading_progress_user_book_idx" ON "reading_progress" ("user_id", "book_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reading_progress_user_id_idx" ON "reading_progress" ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reading_progress_book_id_idx" ON "reading_progress" ("book_id");
