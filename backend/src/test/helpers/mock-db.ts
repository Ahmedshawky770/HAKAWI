import { vi, type Mock } from 'vitest';

/**
 * Test double for the module-level Drizzle `db` handle in `src/db/index.ts`.
 *
 * Every repository imports that single live Pool at module scope, so a unit test must
 * replace the module before the repository is loaded. `vi.mock('<path>/db/index.ts', ...)`
 * with the `db` produced here gives a fluent, awaitable builder that records the chain it
 * was driven through, which is what the assertions below actually inspect.
 *
 * The point of asserting on the chain rather than on SQL text is that the recorded calls
 * are what Drizzle actually receives. A defect like `eq(parentId, null)` — which compiles
 * to `parent_id = NULL` and matches nothing — is invisible to a query-text snapshot but
 * obvious once the repository's WHERE arguments are captured as call records.
 */

export type ChainCall = {
  readonly method: string;
  readonly args: readonly unknown[];
};

/** The fluent surface used by the repositories, as a thenable so `await` resolves it. */
export type MockChain = Record<string, Mock> & {
  readonly then: (
    onfulfilled?: (value: unknown) => unknown,
    onrejected?: (reason: unknown) => unknown,
  ) => Promise<unknown>;
  /** Every call made on this chain, in order. */
  readonly calls: ChainCall[];
};

/**
 * Builds a builder that resolves to `result` and remembers every call made on it.
 *
 * `result` must be shaped the way the repository destructures it. A `count(*)` select is
 * usually awaited as `const [[{ total }]] = ...`, so that case needs `[{ total: 3 }]`.
 */
export function makeChain(result: unknown = []): MockChain {
  const calls: ChainCall[] = [];

  const builder: Record<string, unknown> = { calls };

  const record =
    (method: string) =>
    (...args: unknown[]): MockChain => {
      calls.push({ method, args });
      return builder as MockChain;
    };

  for (const method of [
    'from',
    'where',
    'orderBy',
    'groupBy',
    'having',
    'limit',
    'offset',
    'set',
    'values',
    'returning',
    'innerJoin',
    'leftJoin',
    'rightJoin',
    'fullJoin',
    'onConflictDoNothing',
    'onConflictDoUpdate',
    'onConflictDoNothingSet',
  ]) {
    builder[method] = vi.fn(record(method));
  }

  // `await` has to settle with the result, not with the builder object.
  builder.then = (onfulfilled?: (value: unknown) => unknown, onrejected?: (reason: unknown) => unknown) =>
    Promise.resolve(result).then(onfulfilled, onrejected);

  return builder as MockChain;
}

/** The `db` object shape: four entry points, each returning a fresh chain. */
export type MockDb = {
  select: Mock;
  insert: Mock;
  update: Mock;
  delete: Mock;
};

type DbEntryPoints = 'select' | 'insert' | 'update' | 'delete';

const ENTRY_POINTS: readonly DbEntryPoints[] = ['select', 'insert', 'update', 'delete'];

/** Handles a spec uses to queue results and read back the chains that were built. */
export type MockDbControl = {
  /**
   * Queues the result for the next `db.*` call. Call once per query a method issues —
   * a `Promise.all` paged read issues two, so `queue(rows, [{ total: n }])`.
   *
   * A count row must be shaped the way the repository destructures it:
   * `const [[{ total }]] = ...` needs `[{ total: 3 }]`, not `3`.
   */
  queue: (...results: unknown[]) => void;
  /** Queues a rejection, for the error-path tests. */
  queueRejection: (error: unknown) => void;
  /** Every chain built so far this test, in creation order. */
  chains: () => MockChain[];
};

/**
 * Wires a `vi.hoisted` db double to a per-test result queue.
 *
 * The queue is drained by an implementation rather than by a stack of `mockReturnValueOnce`
 * values, so `beforeEach` can call this unconditionally without inheriting leftovers from the
 * previous test — `mockReset` semantics for once-queues differ between Vitest versions, and
 * a stale entry silently hands a method the wrong result.
 */
export function installMockDb(db: MockDb): MockDbControl {
  // Thunks, not values, so a queued rejection is created at consumption time. A rejected
  // promise built at queue time can escape as an unhandled rejection when a method turns out
  // to issue fewer queries than the spec predicted.
  const queue: Array<() => unknown> = [];
  const built: MockChain[] = [];

  for (const name of ENTRY_POINTS) {
    db[name].mockReset();
    db[name].mockImplementation(() => {
      const chain = makeChain(queue.length > 0 ? queue.shift()!() : []);
      built.push(chain);
      return chain;
    });
  }

  return {
    queue: (...results: unknown[]) => {
      for (const result of results) queue.push(() => result);
    },
    queueRejection: (error: unknown) => {
      queue.push(() => Promise.reject(error));
    },
    chains: () => built,
  };
}

/** Calls recorded on a chain, e.g. `callsOf(chain, 'where')`. */
export function callsOf(chain: MockChain, method: string): ChainCall[] {
  return chain.calls.filter((call) => call.method === method);
}

/** Arguments of the first `method` call on a chain, or `undefined` when it was never called. */
export function firstArgsOf(chain: MockChain, method: string): unknown[] | undefined {
  const [call] = callsOf(chain, method);
  return call ? [...call.args] : undefined;
}

export type MockLogger = {
  info: Mock;
  log: Mock;
  error: Mock;
  warn: Mock;
  debug: Mock;
  verbose: Mock;
};

/** A Winston logger stand-in. Repositories only call these for tracing. */
export function createMockLogger(): MockLogger {
  return {
    info: vi.fn(),
    log: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    verbose: vi.fn(),
  };
}
