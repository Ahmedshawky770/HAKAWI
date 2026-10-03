import { describe, it, expect, beforeEach, vi } from 'vitest';
import { and, desc, eq, inArray, isNull } from 'drizzle-orm';

import { payments, paymentTransactions, refunds } from '../../../db/schema/payments.schema.ts';
import { installMockDb, firstArgsOf, type MockChain, type MockDbControl } from '../../../test/helpers/mock-db.ts';
import {
  REFUND_CAPACITY_STATUSES,
  RefundCapacityExceededError,
  RefundablePaymentNotFoundError,
} from '../interfaces/payments-repository.interface.ts';

import { PaymentsRepository } from './payments.repository.ts';

const db = vi.hoisted(() => ({
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock('../../../db/index.ts', () => ({ db, default: db }));

const logger = vi.hoisted(() => ({
  info: vi.fn(),
  log: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
  verbose: vi.fn(),
}));

vi.mock('../../../common/services/winston-logger.service.ts', () => ({
  WinstonLoggerService: class {
    info = logger.info;
    log = logger.log;
    error = logger.error;
    warn = logger.warn;
    debug = logger.debug;
    verbose = logger.verbose;
  },
}));

const PAYMENT_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const ORDER_ID = 'ORDER-9f3c1a';
const TRANSACTION_ID = 'TXN-77ab21';
const REFUND_ID = '33333333-3333-4333-8333-333333333333';

/**
 * `installMockDb` builds a fluent builder for the four top-level entry points. The transactional
 * methods additionally call `.for('update')` on the select they hold locked, so the handle Drizzle
 * hands to the callback needs the same fluency.
 *
 * `db.transaction` runs the callback immediately with a handle that delegates to the same mocked
 * entry points, which is the shape the production callback actually receives: every statement it
 * issues goes through one object, and the queue in `installMockDb` orders their results. The chains
 * built inside a transaction are collected so a test can assert on the WHERE clause and the lock.
 */
type TransactionHandle = {
  select: (...args: unknown[]) => MockChain;
  insert: (...args: unknown[]) => MockChain;
  update: (...args: unknown[]) => MockChain;
  delete: (...args: unknown[]) => MockChain;
};

function installTransactionMock(): { chains: () => MockChain[] } {
  const built: MockChain[] = [];
  db.transaction.mockImplementation(async (callback: (tx: TransactionHandle) => Promise<unknown>) => {
    const handle: TransactionHandle = {
      select: (...args: unknown[]) => {
        const chain = db.select(...args) as MockChain;
        // `makeChain` records only the methods it knows; `.for('update')` is recorded here with the
        // same shape so `firstArgsOf(chain, 'for')` sees it like any other clause.
        const lockable = chain as MockChain & { for: (strength: string) => MockChain };
        lockable.for = vi.fn((strength: string) => {
          chain.calls.push({ method: 'for', args: [strength] });
          return chain;
        });
        built.push(chain);
        return chain;
      },
      insert: (...args: unknown[]) => db.insert(...args) as MockChain,
      update: (...args: unknown[]) => db.update(...args) as MockChain,
      delete: (...args: unknown[]) => db.delete(...args) as MockChain,
    };
    return callback(handle);
  });
  return { chains: () => built };
}

describe('PaymentsRepository', () => {
  let repository: PaymentsRepository;
  let chains: MockChain[];
  let control: MockDbControl;
  let transaction: { chains: () => MockChain[] };

  /** The `where` clause the nth query built in this test was given. */
  const whereOf = (index = 0): unknown => firstArgsOf(chains[index]!, 'where')?.[0];

  /** The row literal the write of the only query built in this test was given. */
  const valuesOf = (): Record<string, unknown> => (firstArgsOf(chains[0]!, 'values') as [Record<string, unknown>])[0];

  beforeEach(() => {
    vi.clearAllMocks();
    control = installMockDb(db);
    chains = control.chains();
    transaction = installTransactionMock();
    repository = new PaymentsRepository(logger as never);
  });

  describe('findById', () => {
    it('returns the payment when one matches', async () => {
      control.queue([{ id: PAYMENT_ID, userId: USER_ID, status: 'completed' }]);

      await expect(repository.findById(PAYMENT_ID)).resolves.toMatchObject({ id: PAYMENT_ID });
      expect(db.select).toHaveBeenCalledTimes(1);
    });

    it('narrows the lookup to the requested id and takes a single row', async () => {
      control.queue([]);

      await repository.findById(PAYMENT_ID);

      expect(whereOf()).toEqual(eq(payments.id, PAYMENT_ID));
      expect(firstArgsOf(chains[0]!, 'limit')).toEqual([1]);
    });

    it('returns null when the select yields no row', async () => {
      control.queue([]);

      await expect(repository.findById(PAYMENT_ID)).resolves.toBeNull();
    });

    it('returns null instead of throwing on an invalid-uuid database error', async () => {
      control.queueRejection(Object.assign(new Error('invalid input syntax for uuid'), { code: '22P02' }));

      await expect(repository.findById('not-a-uuid')).resolves.toBeNull();
    });

    it('rethrows any other database error', async () => {
      const failure = Object.assign(new Error('connection terminated'), { code: '08006' });
      control.queueRejection(failure);

      await expect(repository.findById(PAYMENT_ID)).rejects.toBe(failure);
    });
  });

  describe('findByOrderId', () => {
    it('looks the payment up by its gateway order id', async () => {
      control.queue([{ id: PAYMENT_ID, paymobOrderId: ORDER_ID }]);

      await expect(repository.findByOrderId(ORDER_ID)).resolves.toMatchObject({ id: PAYMENT_ID });

      expect(whereOf()).toEqual(eq(payments.paymobOrderId, ORDER_ID));
      expect(firstArgsOf(chains[0]!, 'limit')).toEqual([1]);
    });

    it('returns null when the order id is unknown', async () => {
      control.queue([]);

      await expect(repository.findByOrderId(ORDER_ID)).resolves.toBeNull();
    });
  });

  describe('findByTransactionId', () => {
    it('looks the payment up by its gateway transaction id', async () => {
      control.queue([{ id: PAYMENT_ID, paymobTransactionId: TRANSACTION_ID }]);

      await expect(repository.findByTransactionId(TRANSACTION_ID)).resolves.toMatchObject({ id: PAYMENT_ID });

      expect(whereOf()).toEqual(eq(payments.paymobTransactionId, TRANSACTION_ID));
      expect(firstArgsOf(chains[0]!, 'limit')).toEqual([1]);
    });

    it('returns null when the transaction id is unknown', async () => {
      control.queue([]);

      await expect(repository.findByTransactionId(TRANSACTION_ID)).resolves.toBeNull();
    });
  });

  describe('findAll', () => {
    it('returns the page and the total', async () => {
      control.queue([{ id: PAYMENT_ID }], [{ total: 1 }]);

      await expect(repository.findAll({ userId: USER_ID })).resolves.toEqual({
        payments: [{ id: PAYMENT_ID }],
        total: 1,
      });
    });

    it('excludes soft-deleted payments even when no filter is supplied', async () => {
      control.queue([], [{ total: 0 }]);

      await repository.findAll({});

      expect(whereOf()).toEqual(and(isNull(payments.deletedAt)));
    });

    it('adds an owner filter when a userId is supplied', async () => {
      control.queue([], [{ total: 0 }]);

      await repository.findAll({ userId: USER_ID });

      expect(whereOf()).toEqual(and(isNull(payments.deletedAt), eq(payments.userId, USER_ID)));
    });

    it('passes the requested status straight to the predicate', async () => {
      control.queue([], [{ total: 0 }]);

      await repository.findAll({ status: 'completed' });

      expect(whereOf()).toEqual(and(isNull(payments.deletedAt), eq(payments.status, 'completed')));
    });

    it('combines both filters with the soft-delete rule', async () => {
      control.queue([], [{ total: 0 }]);

      await repository.findAll({ userId: USER_ID, status: 'failed' });

      expect(whereOf()).toEqual(
        and(isNull(payments.deletedAt), eq(payments.userId, USER_ID), eq(payments.status, 'failed')),
      );
    });

    it('uses one shared visibility predicate for the page and the count', async () => {
      control.queue([], [{ total: 0 }]);

      await repository.findAll({ userId: USER_ID, status: 'completed' });

      // If the page and the count disagreed, `total` would not match the rows returned.
      expect(whereOf(1)).toBe(whereOf(0));
      expect(firstArgsOf(chains[1]!, 'from')).toEqual([payments]);
    });

    it('defaults to the first page of twenty with a zero offset', async () => {
      control.queue([], [{ total: 0 }]);

      await repository.findAll({});

      expect(firstArgsOf(chains[0]!, 'limit')).toEqual([20]);
      expect(firstArgsOf(chains[0]!, 'offset')).toEqual([0]);
    });

    it('paginates a later page from the requested limit', async () => {
      control.queue([], [{ total: 0 }]);

      await repository.findAll({ page: 4, limit: 15 });

      expect(firstArgsOf(chains[0]!, 'limit')).toEqual([15]);
      expect(firstArgsOf(chains[0]!, 'offset')).toEqual([45]);
    });

    it('orders newest first and reads from the payments table', async () => {
      control.queue([], [{ total: 0 }]);

      await repository.findAll({});

      expect(firstArgsOf(chains[0]!, 'from')).toEqual([payments]);
      expect(firstArgsOf(chains[0]!, 'orderBy')).toEqual([desc(payments.createdAt)]);
    });

    it('coerces a count delivered as text to a number', async () => {
      control.queue([], [{ total: '31' }]);

      await expect(repository.findAll({})).resolves.toMatchObject({ total: 31 });
    });

    it('propagates a database failure instead of returning a partial page', async () => {
      const failure = Object.assign(new Error('deadlock detected'), { code: '40P01' });
      control.queueRejection(failure);

      await expect(repository.findAll({ userId: USER_ID })).rejects.toBe(failure);
    });
  });

  describe('create', () => {
    it('inserts the payment exactly as submitted and returns it', async () => {
      // Currency and status are optional on the input; leaving them out has to fall through to the
      // column defaults rather than writing null over them.
      const input = {
        userId: USER_ID,
        amount: 250,
        currency: 'EGP',
        paymentMethod: 'card',
        description: 'Book rental #12',
        metadata: null,
        status: 'pending',
      };
      control.queue([{ id: PAYMENT_ID, ...input }]);

      const created = await repository.create(input);

      expect(created).toMatchObject({ id: PAYMENT_ID });
      expect(db.insert).toHaveBeenCalledWith(payments);
      expect(firstArgsOf(chains[0]!, 'values')).toEqual([input]);
    });
  });

  describe('update', () => {
    it('writes the patch, stamps updatedAt, and returns the updated row', async () => {
      control.queue([{ id: PAYMENT_ID, status: 'completed' }]);

      const updated = await repository.update(PAYMENT_ID, { status: 'completed' });

      expect(updated).toMatchObject({ status: 'completed' });
      const [patch] = firstArgsOf(chains[0]!, 'set') as [Record<string, unknown>];
      expect(patch).toMatchObject({ status: 'completed' });
      expect(patch.updatedAt).toBeInstanceOf(Date);
    });

    it('narrows the write to the requested row', async () => {
      control.queue([{ id: PAYMENT_ID }]);

      await repository.update(PAYMENT_ID, { status: 'failed' });

      expect(whereOf()).toEqual(eq(payments.id, PAYMENT_ID));
      expect(db.update).toHaveBeenCalledWith(payments);
    });
  });

  describe('softDelete', () => {
    it('stamps deletedAt instead of removing the row', async () => {
      control.queue([]);

      await repository.softDelete(PAYMENT_ID);

      const [patch] = firstArgsOf(chains[0]!, 'set') as [Record<string, unknown>];
      expect(patch.deletedAt).toBeInstanceOf(Date);
      expect(whereOf()).toEqual(eq(payments.id, PAYMENT_ID));
      expect(db.delete).not.toHaveBeenCalled();
    });
  });

  describe('createTransaction', () => {
    it('records the gateway transaction with its status and amount and returns it', async () => {
      control.queue([{ id: PAYMENT_ID, paymentId: PAYMENT_ID, status: 'success' }]);

      const transaction = await repository.createTransaction({
        paymentId: PAYMENT_ID,
        type: 'capture',
        status: 'success',
        amount: 250,
        currency: 'EGP',
        gatewayResponse: '{"orderId":"ORDER-9f3c1a"}',
      });

      expect(transaction).toMatchObject({ status: 'success' });
      expect(db.insert).toHaveBeenCalledWith(paymentTransactions);
      expect(valuesOf()).toEqual({
        paymentId: PAYMENT_ID,
        type: 'capture',
        status: 'success',
        amount: 250,
        currency: 'EGP',
        gatewayResponse: '{"orderId":"ORDER-9f3c1a"}',
      });
    });

    it('stores a null gateway response when the gateway returned nothing', async () => {
      control.queue([{ id: PAYMENT_ID }]);

      await repository.createTransaction({
        paymentId: PAYMENT_ID,
        type: 'capture',
        status: 'pending',
        amount: 100,
        currency: 'EGP',
      });

      expect(valuesOf()).toMatchObject({ gatewayResponse: null });
    });
  });

  describe('createRefund', () => {
    it('opens the refund as pending and leaves the optional columns null', async () => {
      control.queue([{ id: REFUND_ID, status: 'pending' }]);

      const refund = await repository.createRefund({ paymentId: PAYMENT_ID, amount: 250, currency: 'EGP' });

      expect(refund).toMatchObject({ id: REFUND_ID });
      expect(db.insert).toHaveBeenCalledWith(refunds);
      expect(valuesOf()).toEqual({
        paymentId: PAYMENT_ID,
        amount: 250,
        currency: 'EGP',
        reason: null,
        status: 'pending',
        paymobRefundId: null,
        metadata: null,
      });
    });

    it('keeps the submitted amount, status, and reason verbatim', async () => {
      control.queue([{ id: REFUND_ID, status: 'succeeded' }]);

      await repository.createRefund({
        paymentId: PAYMENT_ID,
        amount: 120,
        currency: 'USD',
        reason: 'customer request',
        status: 'succeeded',
        paymobRefundId: 'REF-5512',
        metadata: '{"by":"support"}',
      });

      // Money and status must reach the column untouched: a partial refund is 120, not the original.
      expect(valuesOf()).toEqual({
        paymentId: PAYMENT_ID,
        amount: 120,
        currency: 'USD',
        reason: 'customer request',
        status: 'succeeded',
        paymobRefundId: 'REF-5512',
        metadata: '{"by":"support"}',
      });
    });
  });

  describe('updateRefund', () => {
    it('writes the patch to the refund row and returns it', async () => {
      control.queue([{ id: REFUND_ID, status: 'succeeded' }]);

      const updated = await repository.updateRefund(REFUND_ID, { status: 'succeeded', paymobRefundId: 'REF-5512' });

      expect(updated).toMatchObject({ status: 'succeeded' });
      expect(db.update).toHaveBeenCalledWith(refunds);
      expect(whereOf()).toEqual(eq(refunds.id, REFUND_ID));
      // refunds has no updated_at column, so the patch has to be forwarded exactly as given.
      expect(firstArgsOf(chains[0]!, 'set')).toEqual([{ status: 'succeeded', paymobRefundId: 'REF-5512' }]);
    });
  });

  describe('findRefundsByPayment', () => {
    it('returns every refund recorded against the payment', async () => {
      control.queue([{ id: REFUND_ID, amount: 250 }]);

      await expect(repository.findRefundsByPayment(PAYMENT_ID)).resolves.toEqual([{ id: REFUND_ID, amount: 250 }]);

      expect(firstArgsOf(chains[0]!, 'from')).toEqual([refunds]);
      expect(whereOf()).toEqual(eq(refunds.paymentId, PAYMENT_ID));
    });

    it('returns an empty list when the payment has never been refunded', async () => {
      control.queue([]);

      await expect(repository.findRefundsByPayment(PAYMENT_ID)).resolves.toEqual([]);
    });
  });

  describe('reserveRefundCapacity', () => {
    const completedPayment = { id: PAYMENT_ID, amount: 1000, status: 'completed', deletedAt: null };

    /** The payment select, then the refunds sum, in the order the method issues them. */
    const lockedSelect = (): MockChain => transaction.chains()[0]!;
    const refundSum = (): MockChain => transaction.chains()[1]!;
    /** The refund insert, then the conditional status write. */
    const refundInsert = (): MockChain => chains[chains.length - 2]!;
    const statusWrite = (): MockChain => chains[chains.length - 1]!;

    it('reads the payment under a row lock inside a transaction', async () => {
      control.queue([completedPayment], [{ reservedTotal: '0' }], [{ id: REFUND_ID, status: 'pending' }]);

      await repository.reserveRefundCapacity({ paymentId: PAYMENT_ID, amountCents: 500, currency: 'EGP' });

      // Without `FOR UPDATE` two concurrent refunds both read the same pre-refund total, both see
      // room, and both commit — the double-refund the whole method exists to prevent.
      expect(db.transaction).toHaveBeenCalledTimes(1);
      expect(firstArgsOf(lockedSelect(), 'where')).toEqual([eq(payments.id, PAYMENT_ID)]);
      expect(firstArgsOf(lockedSelect(), 'for')).toEqual(['update']);
    });

    it('sums only the refund statuses that still hold capacity', async () => {
      control.queue([completedPayment], [{ reservedTotal: '400' }], [{ id: REFUND_ID, status: 'pending' }]);

      await repository.reserveRefundCapacity({ paymentId: PAYMENT_ID, amountCents: 500, currency: 'EGP' });

      // A `failed` refund gives its capacity back; a `pending` one may already have moved the money.
      expect(firstArgsOf(refundSum(), 'where')).toEqual([
        and(eq(refunds.paymentId, PAYMENT_ID), inArray(refunds.status, [...REFUND_CAPACITY_STATUSES])),
      ]);
      expect(REFUND_CAPACITY_STATUSES).toEqual(['pending', 'processed']);
    });

    it('opens the reservation as a pending refund with the reason recorded', async () => {
      control.queue([completedPayment], [{ reservedTotal: '400' }], [{ id: REFUND_ID, status: 'pending' }]);

      const reservation = await repository.reserveRefundCapacity({
        paymentId: PAYMENT_ID,
        amountCents: 600,
        currency: 'EGP',
        reason: 'customer request',
      });

      expect(db.insert).toHaveBeenCalledWith(refunds);
      expect(firstArgsOf(refundInsert(), 'values')).toEqual([
        {
          paymentId: PAYMENT_ID,
          amount: 600,
          currency: 'EGP',
          reason: 'customer request',
          status: 'pending',
          paymobRefundId: null,
          metadata: null,
        },
      ]);
      expect(reservation.alreadyRefunded).toBe(400);
      expect(reservation.reservedTotal).toBe(1000);
      expect(reservation.paymentFullyRefunded).toBe(true);
    });

    it('flips the payment to refunded in the same transaction when the cap is reached', async () => {
      control.queue([completedPayment], [{ reservedTotal: '400' }], [{ id: REFUND_ID, status: 'pending' }]);

      await repository.reserveRefundCapacity({ paymentId: PAYMENT_ID, amountCents: 600, currency: 'EGP' });

      const [patch] = firstArgsOf(statusWrite(), 'set') as [Record<string, unknown>];
      expect(patch.status).toBe('refunded');
      expect(patch.updatedAt).toBeInstanceOf(Date);
      // Written after the insert, so it cannot be committed without it.
      expect(chains.indexOf(statusWrite())).toBeGreaterThan(chains.indexOf(refundInsert()));
    });

    it('leaves the status alone for a partial refund', async () => {
      control.queue([completedPayment], [{ reservedTotal: '0' }], [{ id: REFUND_ID, status: 'pending' }]);

      const reservation = await repository.reserveRefundCapacity({
        paymentId: PAYMENT_ID,
        amountCents: 400,
        currency: 'EGP',
      });

      expect(reservation.paymentFullyRefunded).toBe(false);
      // Only the refund insert was written.
      expect(db.update).not.toHaveBeenCalled();
    });

    it('refuses a refund that would exceed the captured amount and inserts nothing', async () => {
      control.queue([completedPayment], [{ reservedTotal: '600' }]);

      await expect(
        repository.reserveRefundCapacity({ paymentId: PAYMENT_ID, amountCents: 500, currency: 'EGP' }),
      ).rejects.toBeInstanceOf(RefundCapacityExceededError);
      // Throwing inside the transaction rolls it back, so a refused refund leaves no trace.
      expect(db.insert).not.toHaveBeenCalled();
      expect(db.update).not.toHaveBeenCalled();
    });

    it('allows a refund that lands exactly on the cap', async () => {
      control.queue([completedPayment], [{ reservedTotal: '600' }], [{ id: REFUND_ID, status: 'pending' }]);

      const reservation = await repository.reserveRefundCapacity({
        paymentId: PAYMENT_ID,
        amountCents: 400,
        currency: 'EGP',
      });

      expect(reservation.paymentFullyRefunded).toBe(true);
      expect(db.insert).toHaveBeenCalledTimes(1);
    });

    it('names both numbers in the refusal message so the caller can act on it', async () => {
      control.queue([completedPayment], [{ reservedTotal: '400' }]);

      await expect(
        repository.reserveRefundCapacity({ paymentId: PAYMENT_ID, amountCents: 700, currency: 'EGP' }),
      ).rejects.toThrow('Refund amount 700 exceeds the remaining refundable amount 600 (400 of 1000 already refunded)');
    });

    it('reports a payment that does not exist', async () => {
      control.queue([]);

      await expect(
        repository.reserveRefundCapacity({ paymentId: PAYMENT_ID, amountCents: 100, currency: 'EGP' }),
      ).rejects.toBeInstanceOf(RefundablePaymentNotFoundError);
    });

    it('refuses a soft-deleted payment', async () => {
      control.queue([{ ...completedPayment, deletedAt: new Date() }]);

      await expect(
        repository.reserveRefundCapacity({ paymentId: PAYMENT_ID, amountCents: 100, currency: 'EGP' }),
      ).rejects.toBeInstanceOf(RefundablePaymentNotFoundError);
      expect(db.insert).not.toHaveBeenCalled();
    });

    it('treats an empty refund table as zero reserved', async () => {
      control.queue([completedPayment], [], [{ id: REFUND_ID, status: 'pending' }]);

      const reservation = await repository.reserveRefundCapacity({
        paymentId: PAYMENT_ID,
        amountCents: 100,
        currency: 'EGP',
      });

      expect(reservation.alreadyRefunded).toBe(0);
    });

    it('refuses an unreadable capacity total rather than truncating it into a plausible number', async () => {
      control.queue([completedPayment], [{ reservedTotal: 'not-a-number' }]);

      await expect(
        repository.reserveRefundCapacity({ paymentId: PAYMENT_ID, amountCents: 100, currency: 'EGP' }),
      ).rejects.toThrow(/not a usable integer amount/);
      expect(db.insert).not.toHaveBeenCalled();
    });
  });

  describe('reconcileRefundCapacity', () => {
    const refundedPayment = { id: PAYMENT_ID, amount: 1000, status: 'refunded', deletedAt: null };

    it('puts a fully-refunded payment back to completed once capacity is released', async () => {
      control.queue([refundedPayment], [{ reservedTotal: '0' }], [{ ...refundedPayment, status: 'completed' }]);

      const result = await repository.reconcileRefundCapacity(PAYMENT_ID);

      expect(result.payment.status).toBe('completed');
      expect(result.paymentFullyRefunded).toBe(false);
      const [patch] = firstArgsOf(chains[chains.length - 1]!, 'set') as [Record<string, unknown>];
      expect(patch.status).toBe('completed');
    });

    it('completes a payment whose remaining refunds exactly cover the capture', async () => {
      control.queue(
        [{ ...refundedPayment, status: 'completed' }],
        [{ reservedTotal: '1000' }],
        [{ ...refundedPayment }],
      );

      const result = await repository.reconcileRefundCapacity(PAYMENT_ID);

      expect(result.paymentFullyRefunded).toBe(true);
      expect(db.update).toHaveBeenCalledTimes(1);
    });

    it('leaves an untouched payment alone', async () => {
      // A `failed`, `cancelled` or still-`pending` payment was never fully refunded; correcting it
      // would invent a transition that never happened.
      control.queue([{ ...refundedPayment, status: 'failed' }], [{ reservedTotal: '0' }]);

      const result = await repository.reconcileRefundCapacity(PAYMENT_ID);

      expect(result.payment.status).toBe('failed');
      expect(db.update).not.toHaveBeenCalled();
    });

    it('takes the row lock too, so it cannot race a concurrent reservation', async () => {
      control.queue([refundedPayment], [{ reservedTotal: '1000' }]);

      await repository.reconcileRefundCapacity(PAYMENT_ID);

      expect(firstArgsOf(transaction.chains()[0]!, 'for')).toEqual(['update']);
    });

    it('reports a payment that does not exist', async () => {
      control.queue([]);

      await expect(repository.reconcileRefundCapacity(PAYMENT_ID)).rejects.toBeInstanceOf(
        RefundablePaymentNotFoundError,
      );
    });
  });
});
