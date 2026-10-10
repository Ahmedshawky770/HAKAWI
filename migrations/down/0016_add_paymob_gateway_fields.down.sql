-- hakawi:down reversibility=data-loss data-loss=columns reason=Drops the three Paymob gateway columns. Rows keep their paymob_order_id, so the checkout can be re-registered with Paymob after a forward migration re-adds the columns.
DROP INDEX IF EXISTS "payments_paymob_payment_key_idx";
ALTER TABLE "payments" DROP COLUMN IF EXISTS "paymob_accept_url";
ALTER TABLE "payments" DROP COLUMN IF EXISTS "paymob_iframe_url";
ALTER TABLE "payments" DROP COLUMN IF EXISTS "paymob_payment_key";
