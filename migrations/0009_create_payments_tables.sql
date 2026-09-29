CREATE TABLE IF NOT EXISTS "payments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id"),
  "amount" integer NOT NULL,
  "currency" varchar(3) DEFAULT 'EGP' NOT NULL,
  "status" varchar(20) DEFAULT 'pending' NOT NULL,
  "payment_method" varchar(50) NOT NULL,
  "paymob_order_id" varchar(255),
  "paymob_payment_id" varchar(255),
  "paymob_transaction_id" varchar(255),
  "metadata" text,
  "description" text,
  "deleted_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "payment_transactions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "payment_id" uuid NOT NULL REFERENCES "payments"("id"),
  "type" varchar(20) NOT NULL,
  "status" varchar(20) NOT NULL,
  "amount" integer NOT NULL,
  "currency" varchar(3) NOT NULL,
  "gateway_response" text,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "refunds" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "payment_id" uuid NOT NULL REFERENCES "payments"("id"),
  "amount" integer NOT NULL,
  "currency" varchar(3) NOT NULL,
  "reason" text,
  "status" varchar(20) DEFAULT 'pending' NOT NULL,
  "paymob_refund_id" varchar(255),
  "metadata" text,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payments_user_id_idx" ON "payments" ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payments_status_idx" ON "payments" ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payments_order_id_idx" ON "payments" ("paymob_order_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "payments_transaction_id_idx" ON "payments" ("paymob_transaction_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payment_transactions_payment_id_idx" ON "payment_transactions" ("payment_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "refunds_payment_id_idx" ON "refunds" ("payment_id");
