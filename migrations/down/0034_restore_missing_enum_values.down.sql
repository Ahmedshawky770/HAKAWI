-- hakawi:down reversibility=reversible data-loss=rows reason=the rows that carry the removed values are moved to a status the old enums can hold
--
-- reversible   restores the previous schema and destroys nothing
-- data-loss    drops columns or rows; "migration:rollback" refuses it without --allow-data-loss
-- irreversible cannot be undone; "migration:rollback" always refuses it

-- PostgreSQL cannot remove a value from an enum, so each type has to be rebuilt: a new
-- type with the values it had, the column moved onto it, and the old type dropped.
--
-- THE ORDER MATTERS, AND IT IS THE WHOLE POINT. The column is moved onto a plain
-- VARCHAR FIRST, because the value being removed is one the old enum does not have and
-- the UPDATE that moves those rows cannot name it while the column is still on the
-- enum. Then the rows are moved to a status the old vocabulary can hold, and only then
-- is the type rebuilt and the column put back.
--
-- WHERE THE ROWS GO. An escalated report becomes 'in_review' — the status it was in
-- before it was escalated. A processing payment becomes 'pending' — the status it was
-- in before the checkout was created. A returned rental becomes 'expired' — the
-- closest the old vocabulary has, since it had no way to say "returned" at all.
--
-- THIS IS DATA LOSS, and the declaration above says so: the detail of what was
-- escalated, what was being processed and what had been returned is lost. The
-- alternative is leaving the values in place, which is what the up migration does; the
-- rollback exists for the case where the application has to go back to a version that
-- does not know the values at all.
--
-- The rows that are moved are counted first, and the count is reported, so the
-- operator can see how many rows the rollback touches as it happens.
DO $$
DECLARE
    escalated_count integer;
    processing_count integer;
    returned_count integer;
BEGIN
    SELECT count(*) INTO escalated_count FROM reports WHERE status = 'escalated';
    SELECT count(*) INTO processing_count FROM payments WHERE status = 'processing';
    SELECT count(*) INTO returned_count FROM rentals WHERE status = 'returned';

    -- The columns are moved onto plain VARCHAR first, so that the rows can be moved
    -- while the values are still nameable.
    ALTER TABLE reports ALTER COLUMN status DROP DEFAULT;
    ALTER TABLE reports ALTER COLUMN status TYPE varchar(20) USING status::varchar(20);
    ALTER TABLE reports ALTER COLUMN status SET DEFAULT 'open';

    ALTER TABLE payments ALTER COLUMN status DROP DEFAULT;
    ALTER TABLE payments ALTER COLUMN status TYPE varchar(20) USING status::varchar(20);
    ALTER TABLE payments ALTER COLUMN status SET DEFAULT 'pending';

    ALTER TABLE rentals ALTER COLUMN status DROP DEFAULT;
    ALTER TABLE rentals ALTER COLUMN status TYPE varchar(20) USING status::varchar(20);
    ALTER TABLE rentals ALTER COLUMN status SET DEFAULT 'active';

    -- The rows are moved to a status the old vocabulary can hold.
    UPDATE reports SET status = 'in_review' WHERE status = 'escalated';
    UPDATE payments SET status = 'pending' WHERE status = 'processing';
    UPDATE rentals SET status = 'expired' WHERE status = 'returned';

    -- The types are rebuilt without the values, and the columns are put back.
    DROP TYPE report_status;
    CREATE TYPE report_status AS ENUM ('open', 'in_review', 'resolved', 'dismissed');
    ALTER TABLE reports
        ALTER COLUMN status TYPE report_status
        USING status::report_status;

    DROP TYPE payment_status;
    CREATE TYPE payment_status AS ENUM ('pending', 'completed', 'failed', 'refunded', 'cancelled');
    ALTER TABLE payments
        ALTER COLUMN status TYPE payment_status
        USING status::payment_status;
    ALTER TABLE payments ALTER COLUMN status SET DEFAULT 'pending'::payment_status;

    DROP TYPE rental_status;
    CREATE TYPE rental_status AS ENUM ('active', 'expired', 'cancelled', 'pending');
    ALTER TABLE rentals
        ALTER COLUMN status TYPE rental_status
        USING status::rental_status;
    ALTER TABLE rentals ALTER COLUMN status SET DEFAULT 'active'::rental_status;

    RAISE NOTICE
        'rollback 0034: % escalated report(s), % processing payment(s) and % returned rental(s) were moved',
        escalated_count,
        processing_count,
        returned_count;
END $$;
