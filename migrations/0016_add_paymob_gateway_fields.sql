ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "paymob_payment_key" varchar(255);
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "paymob_iframe_url" text;
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "paymob_accept_url" text;
CREATE INDEX IF NOT EXISTS "payments_paymob_payment_key_idx" ON "payments" ("paymob_payment_key");
