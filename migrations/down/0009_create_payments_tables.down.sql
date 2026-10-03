-- hakawi:down reversibility=data-loss data-loss=rows reason=Drops payments, payment_transactions and refunds. This is the money ledger: rolling it back destroys the local record of every captured payment and refund. Reconcile with the Paymob dashboard before accepting the loss.
DROP INDEX IF EXISTS "refunds_payment_id_idx";
DROP INDEX IF EXISTS "payment_transactions_payment_id_idx";
DROP INDEX IF EXISTS "payments_transaction_id_idx";
DROP INDEX IF EXISTS "payments_order_id_idx";
DROP INDEX IF EXISTS "payments_status_idx";
DROP INDEX IF EXISTS "payments_user_id_idx";
DROP TABLE IF EXISTS "refunds";
DROP TABLE IF EXISTS "payment_transactions";
DROP TABLE IF EXISTS "payments";
