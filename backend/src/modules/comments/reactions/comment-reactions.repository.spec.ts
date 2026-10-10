import { describe, it, expect, beforeEach, vi } from 'vitest';

import {
  installMockDb,
  type MockChain,
  type MockDbControl,
} from '../../../test/helpers/mock-db.ts';

import { CommentReactionsRepository } from './comment-reactions.repository.ts';

const db = vi.hoisted(() => ({
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
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

describe('CommentReactionsRepository', () => {
  let repository: CommentReactionsRepository;
  let chains: MockChain[];
  let control: MockDbControl;

  beforeEach(() => {
    vi.clearAllMocks();
    control = installMockDb(db);
    chains = control.chains();
    repository = new CommentReactionsRepository(logger as never);
  });

  it('should be defined', () => {
    expect(repository).toBeDefined();
  });

  it('should find reaction by user and comment', async () => {
    control.queue([{ reaction: { id: 'r1' } }]);
    const result = await repository.findByUserAndComment('u1', 'c1');
    expect(result).toBeDefined();
  });

  it('should create reaction', async () => {
    control.queue([{ id: 'r1', type: 'like' }]);
    const result = await repository.create({ userId: 'u1', commentId: 'c1', type: 'like' });
    expect(result.id).toBe('r1');
  });

  it('should delete reaction', async () => {
    control.queue([]);
    await repository.delete('u1', 'c1');
  });
});
