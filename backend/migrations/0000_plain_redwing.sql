CREATE TABLE IF NOT EXISTS "book_rentals" (
	"id" uuid PRIMARY KEY DEFAULT 'ozbt0byqjtd5ezgh4sy63bn3' NOT NULL,
	"book_id" uuid NOT NULL,
	"renter_id" uuid NOT NULL,
	"rental_duration" varchar(20) NOT NULL,
	"rental_price" integer NOT NULL,
	"platform_commission" integer DEFAULT 0 NOT NULL,
	"owner_earnings" integer DEFAULT 0 NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"start_date" timestamp,
	"end_date" timestamp,
	"extension_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "book_reviews" (
	"id" uuid PRIMARY KEY DEFAULT 'eutvxvykxaivog6zdm3lebsi' NOT NULL,
	"book_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"rating" integer NOT NULL,
	"comment" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "book_reviews_user_book_unique" UNIQUE("user_id","book_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "book_sales" (
	"id" uuid PRIMARY KEY DEFAULT 'fgea3kcp6s7giamgb44t1hus' NOT NULL,
	"book_id" uuid NOT NULL,
	"seller_id" uuid NOT NULL,
	"buyer_id" uuid NOT NULL,
	"sale_price" integer NOT NULL,
	"currency" varchar(3) DEFAULT 'EGP' NOT NULL,
	"sale_type" varchar(20) DEFAULT 'digital' NOT NULL,
	"purchased_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "books" (
	"id" uuid PRIMARY KEY DEFAULT 'lc0tfu3rsm9ct2s3bczc6z83' NOT NULL,
	"owner_id" uuid NOT NULL,
	"title" varchar(255) NOT NULL,
	"subtitle" varchar(255),
	"author_name" varchar(255) NOT NULL,
	"cover_image" text,
	"pdf_url" text,
	"pdf_pages" integer,
	"price" integer DEFAULT 0 NOT NULL,
	"is_available" boolean DEFAULT true NOT NULL,
	"deleted_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "contest_badges" (
	"id" uuid PRIMARY KEY DEFAULT 'rc3frcqlu1ucxbtkjoyzd83t' NOT NULL,
	"contest_id" uuid NOT NULL,
	"winner_id" uuid NOT NULL,
	"badge_type" varchar(50) NOT NULL,
	"awarded_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "contest_submissions" (
	"id" uuid PRIMARY KEY DEFAULT 'mz2baynl1v3hphx5mks5ygzp' NOT NULL,
	"contest_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"story_id" uuid NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"submitted_at" timestamp DEFAULT now() NOT NULL,
	"review_notes" text,
	"final_rank" integer,
	"votes_count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "contest_submissions_contest_id_author_id_key" UNIQUE("contest_id","author_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "contest_votes" (
	"id" uuid PRIMARY KEY DEFAULT 'nh5voh1hla1d0z7zupdb29jz' NOT NULL,
	"contest_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"submission_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "contest_votes_user_id_submission_id_key" UNIQUE("user_id","submission_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "contests" (
	"id" uuid PRIMARY KEY DEFAULT 'nllunrtvt5h94mjm22ey70t4' NOT NULL,
	"publisher_id" uuid NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text NOT NULL,
	"theme" varchar(255),
	"category" varchar(100),
	"participant_type" varchar(20) DEFAULT 'writer' NOT NULL,
	"status" varchar(20) DEFAULT 'draft' NOT NULL,
	"start_date" timestamp NOT NULL,
	"end_date" timestamp NOT NULL,
	"submission_deadline" timestamp NOT NULL,
	"prize_type" varchar(20) NOT NULL,
	"prize_value" integer,
	"prize_description" text,
	"rules" text,
	"min_word_count" integer DEFAULT 0 NOT NULL,
	"max_word_count" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "conversations" (
	"id" uuid PRIMARY KEY DEFAULT 'oz8t3girb3dbrwx8xnzgcuuf' NOT NULL,
	"participant_ids" uuid[] NOT NULL,
	"last_message_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "message_read_receipts" (
	"id" uuid PRIMARY KEY DEFAULT 'cuwu6d9ybooeweoqh0fmnn90' NOT NULL,
	"message_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"read_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "message_read_receipts_user_id_message_id_key" UNIQUE("user_id","message_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "messages" (
	"id" uuid PRIMARY KEY DEFAULT 'ry4yx2sjpsxsd4lr6qaymc6s' NOT NULL,
	"conversation_id" uuid NOT NULL,
	"sender_id" uuid NOT NULL,
	"content" text NOT NULL,
	"deleted_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "moderation_logs" (
	"id" uuid PRIMARY KEY DEFAULT 'vxun0hbaecmvkhz6nhnjab39' NOT NULL,
	"moderator_id" uuid NOT NULL,
	"action" varchar(50) NOT NULL,
	"target_id" uuid NOT NULL,
	"target_type" varchar(20) NOT NULL,
	"reason" text NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "notification_preferences" (
	"id" uuid PRIMARY KEY DEFAULT 'rytowgtlubldmw60b5fukwvo' NOT NULL,
	"user_id" uuid NOT NULL,
	"email_enabled" boolean DEFAULT true NOT NULL,
	"push_enabled" boolean DEFAULT true NOT NULL,
	"in_app_enabled" boolean DEFAULT true NOT NULL,
	"types" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "notification_preferences_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "notifications" (
	"id" uuid PRIMARY KEY DEFAULT 'w2i177tg48wstlxukhtmwrss' NOT NULL,
	"user_id" uuid NOT NULL,
	"type" varchar(50) NOT NULL,
	"title" varchar(255) NOT NULL,
	"message" text NOT NULL,
	"is_read" boolean DEFAULT false NOT NULL,
	"read_at" timestamp,
	"actor_id" uuid,
	"entity_id" uuid,
	"data" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "payments" (
	"id" uuid PRIMARY KEY DEFAULT 'dfrfw597pj96e127i0aptodc' NOT NULL,
	"user_id" uuid NOT NULL,
	"amount" integer NOT NULL,
	"currency" varchar(3) DEFAULT 'EGP' NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"transaction_id" varchar(255),
	"payment_method_id" varchar(255),
	"metadata" jsonb,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "payments_transaction_id_unique" UNIQUE("transaction_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "prize_transactions" (
	"id" uuid PRIMARY KEY DEFAULT 'v917knx2qatig67xqk360kbw' NOT NULL,
	"contest_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"amount" integer DEFAULT 0 NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"transaction_id" varchar(255),
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "prize_transactions_transaction_id_unique" UNIQUE("transaction_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "refunds" (
	"id" uuid PRIMARY KEY DEFAULT 'gyg1vjy8juqj9ory8hj69lpz' NOT NULL,
	"payment_id" uuid NOT NULL,
	"amount" integer NOT NULL,
	"reason" text NOT NULL,
	"refunded_by" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "refunds_payment_id_unique" UNIQUE("payment_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "rental_extensions" (
	"id" uuid PRIMARY KEY DEFAULT 'd5puax1uv3xab5e48pyabq3t' NOT NULL,
	"rental_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"old_end_date" timestamp NOT NULL,
	"new_end_date" timestamp NOT NULL,
	"extension_price" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "reports" (
	"id" uuid PRIMARY KEY DEFAULT 'oboi40n57dwban4cp2iz9dzz' NOT NULL,
	"reporter_id" uuid NOT NULL,
	"target_id" uuid NOT NULL,
	"target_type" varchar(20) NOT NULL,
	"reason" varchar(100) NOT NULL,
	"description" text,
	"status" varchar(20) DEFAULT 'open' NOT NULL,
	"resolved_by" uuid,
	"resolved_at" timestamp,
	"resolution" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "reports_reporter_id_target_id_target_type_key" UNIQUE("reporter_id","target_id","target_type")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "stories" (
	"id" uuid PRIMARY KEY DEFAULT 'bmvx32p6eiep5zwrgzls44uq' NOT NULL,
	"sanity_story_id" varchar(255),
	"author_id" uuid NOT NULL,
	"title" varchar(255) NOT NULL,
	"slug" varchar(255) NOT NULL,
	"description" text,
	"cover_image" text,
	"status" varchar(20) DEFAULT 'draft' NOT NULL,
	"word_count" integer DEFAULT 0 NOT NULL,
	"reading_time" integer DEFAULT 0 NOT NULL,
	"views" integer DEFAULT 0 NOT NULL,
	"reactions" integer DEFAULT 0 NOT NULL,
	"comments" integer DEFAULT 0 NOT NULL,
	"category" varchar(100),
	"tags" text[],
	"published_at" timestamp,
	"deleted_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "stories_sanity_story_id_unique" UNIQUE("sanity_story_id"),
	CONSTRAINT "stories_sanity_story_id_idx" UNIQUE("sanity_story_id"),
	CONSTRAINT "stories_author_slug_idx" UNIQUE("author_id","slug")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "story_categories" (
	"id" uuid PRIMARY KEY DEFAULT 'k30jcp0luihbe46t7jck6127' NOT NULL,
	"name" varchar(100) NOT NULL,
	"slug" varchar(100) NOT NULL,
	"description" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "story_categories_name_unique" UNIQUE("name"),
	CONSTRAINT "story_categories_slug_unique" UNIQUE("slug"),
	CONSTRAINT "story_categories_name_idx" UNIQUE("name"),
	CONSTRAINT "story_categories_slug_idx" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "story_tags" (
	"id" uuid PRIMARY KEY DEFAULT 'erkgzyazg9z5vfhocp9ch5h4' NOT NULL,
	"name" varchar(50) NOT NULL,
	"slug" varchar(50) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "story_tags_name_unique" UNIQUE("name"),
	CONSTRAINT "story_tags_slug_unique" UNIQUE("slug"),
	CONSTRAINT "story_tags_name_idx" UNIQUE("name"),
	CONSTRAINT "story_tags_slug_idx" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "story_views" (
	"id" uuid PRIMARY KEY DEFAULT 'qsbcq7vtujj3a4pqv3yiarlq' NOT NULL,
	"story_id" uuid NOT NULL,
	"viewer_id" uuid,
	"view_duration" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "transactions" (
	"id" uuid PRIMARY KEY DEFAULT 'rp4nsawkx79ci15de5o0ktil' NOT NULL,
	"payment_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"type" varchar(20) NOT NULL,
	"amount" integer NOT NULL,
	"currency" varchar(3) DEFAULT 'EGP' NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"description" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_libraries" (
	"id" uuid PRIMARY KEY DEFAULT 'x5w86ogqirlituaz5gh7hqqk' NOT NULL,
	"user_id" uuid NOT NULL,
	"book_id" uuid NOT NULL,
	"access_type" varchar(20) NOT NULL,
	"access_granted_at" timestamp DEFAULT now() NOT NULL,
	"access_expires_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_libraries_user_book_unique" UNIQUE("user_id","book_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_restrictions" (
	"id" uuid PRIMARY KEY DEFAULT 'd5x4y1q0h2mol183767vbd9g' NOT NULL,
	"user_id" uuid NOT NULL,
	"restriction_type" varchar(50) NOT NULL,
	"reason" text NOT NULL,
	"expires_at" timestamp,
	"created_by" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_restrictions_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" uuid PRIMARY KEY DEFAULT 'pcyryce9fpkmzp756vtydbuv' NOT NULL,
	"google_id" varchar(255),
	"facebook_id" varchar(255),
	"twitter_id" varchar(255),
	"github_id" varchar(255),
	"apple_id" varchar(255),
	"tiktok_id" varchar(255),
	"username" varchar(50) NOT NULL,
	"email" varchar(255) NOT NULL,
	"password_hash" varchar(255),
	"name" varchar(100) NOT NULL,
	"avatar" text,
	"bio" text,
	"account_type" varchar(20) DEFAULT 'reader' NOT NULL,
	"admin_role" varchar(20),
	"is_verified" boolean DEFAULT false,
	"onboarding_completed" boolean DEFAULT false,
	"access_blocked" boolean DEFAULT false,
	"last_login_at" timestamp,
	"deleted_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_google_id_unique" UNIQUE("google_id"),
	CONSTRAINT "users_facebook_id_unique" UNIQUE("facebook_id"),
	CONSTRAINT "users_twitter_id_unique" UNIQUE("twitter_id"),
	CONSTRAINT "users_github_id_unique" UNIQUE("github_id"),
	CONSTRAINT "users_apple_id_unique" UNIQUE("apple_id"),
	CONSTRAINT "users_tiktok_id_unique" UNIQUE("tiktok_id"),
	CONSTRAINT "users_username_unique" UNIQUE("username"),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "withdrawals" (
	"id" uuid PRIMARY KEY DEFAULT 'u6oxo40dn7pt1drexzp6e7oo' NOT NULL,
	"user_id" uuid NOT NULL,
	"amount" integer NOT NULL,
	"currency" varchar(3) DEFAULT 'EGP' NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"transaction_id" varchar(255),
	"notes" text,
	"requested_at" timestamp DEFAULT now() NOT NULL,
	"processed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "withdrawals_transaction_id_unique" UNIQUE("transaction_id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "book_rentals_book_id_idx" ON "book_rentals" ("book_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "book_rentals_renter_id_idx" ON "book_rentals" ("renter_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "book_rentals_status_idx" ON "book_rentals" ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "book_rentals_end_date_idx" ON "book_rentals" ("end_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "book_reviews_book_id_idx" ON "book_reviews" ("book_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "book_reviews_user_id_idx" ON "book_reviews" ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "book_reviews_rating_idx" ON "book_reviews" ("rating");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "book_sales_book_id_idx" ON "book_sales" ("book_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "book_sales_buyer_id_idx" ON "book_sales" ("buyer_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "book_sales_seller_id_idx" ON "book_sales" ("seller_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "books_owner_id_idx" ON "books" ("owner_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "books_is_available_idx" ON "books" ("is_available");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "books_created_at_idx" ON "books" ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contest_badges_contest_id_idx" ON "contest_badges" ("contest_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contest_badges_winner_id_idx" ON "contest_badges" ("winner_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contest_submissions_contest_id_idx" ON "contest_submissions" ("contest_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contest_submissions_author_id_idx" ON "contest_submissions" ("author_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contest_submissions_story_id_idx" ON "contest_submissions" ("story_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contest_submissions_status_idx" ON "contest_submissions" ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contest_votes_contest_id_idx" ON "contest_votes" ("contest_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contest_votes_submission_id_idx" ON "contest_votes" ("submission_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contest_votes_user_id_idx" ON "contest_votes" ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contests_publisher_id_idx" ON "contests" ("publisher_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contests_status_idx" ON "contests" ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contests_start_date_idx" ON "contests" ("start_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contests_end_date_idx" ON "contests" ("end_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "conversations_created_at_idx" ON "conversations" ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "message_read_receipts_message_id_idx" ON "message_read_receipts" ("message_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "message_read_receipts_user_id_idx" ON "message_read_receipts" ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "messages_conversation_id_idx" ON "messages" ("conversation_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "messages_sender_id_idx" ON "messages" ("sender_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "messages_created_at_idx" ON "messages" ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "moderation_logs_moderator_id_idx" ON "moderation_logs" ("moderator_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "moderation_logs_target_id_idx" ON "moderation_logs" ("target_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "moderation_logs_created_at_idx" ON "moderation_logs" ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notification_preferences_user_id_idx" ON "notification_preferences" ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notifications_user_id_idx" ON "notifications" ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notifications_is_read_idx" ON "notifications" ("is_read");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notifications_type_idx" ON "notifications" ("type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notifications_created_at_idx" ON "notifications" ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notifications_actor_id_idx" ON "notifications" ("actor_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payments_user_id_idx" ON "payments" ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payments_status_idx" ON "payments" ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payments_transaction_id_idx" ON "payments" ("transaction_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payments_created_at_idx" ON "payments" ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "prize_transactions_contest_id_idx" ON "prize_transactions" ("contest_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "prize_transactions_user_id_idx" ON "prize_transactions" ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "prize_transactions_status_idx" ON "prize_transactions" ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "refunds_payment_id_idx" ON "refunds" ("payment_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "refunds_refunded_by_idx" ON "refunds" ("refunded_by");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "rental_extensions_rental_id_idx" ON "rental_extensions" ("rental_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "rental_extensions_user_id_idx" ON "rental_extensions" ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reports_reporter_id_idx" ON "reports" ("reporter_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reports_target_id_idx" ON "reports" ("target_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reports_status_idx" ON "reports" ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reports_created_at_idx" ON "reports" ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "stories_author_id_idx" ON "stories" ("author_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "stories_status_idx" ON "stories" ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "stories_category_idx" ON "stories" ("category");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "stories_slug_idx" ON "stories" ("slug");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "story_views_story_id_idx" ON "story_views" ("story_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "story_views_viewer_id_idx" ON "story_views" ("viewer_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "story_views_created_at_idx" ON "story_views" ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "transactions_payment_id_idx" ON "transactions" ("payment_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "transactions_user_id_idx" ON "transactions" ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "transactions_type_idx" ON "transactions" ("type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "transactions_status_idx" ON "transactions" ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_libraries_user_id_idx" ON "user_libraries" ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_libraries_book_id_idx" ON "user_libraries" ("book_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_restrictions_user_id_idx" ON "user_restrictions" ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_restrictions_expires_at_idx" ON "user_restrictions" ("expires_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_restrictions_created_by_idx" ON "user_restrictions" ("created_by");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "users_email_idx" ON "users" ("email");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "users_username_idx" ON "users" ("username");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "users_account_type_idx" ON "users" ("account_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "withdrawals_user_id_idx" ON "withdrawals" ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "withdrawals_status_idx" ON "withdrawals" ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "withdrawals_created_at_idx" ON "withdrawals" ("created_at");