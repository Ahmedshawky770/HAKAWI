import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { NotFoundException, ForbiddenException } from '@nestjs/common';

import { WinstonLoggerService } from '../../common/services/winston-logger.service.ts';
import { ValkeyService } from '../../common/services/valkey.service.ts';

import { ReadingProgressService } from './reading-progress.service.ts';
import type {
  ReadingProgress,
  CreateReadingProgressInput,
  UpdateReadingProgressInput,
} from './interfaces/reading-progress-repository.interface.ts';
import type {
  CreateReadingProgressInput as CreateReadingProgressDtoInput,
  UpdateReadingProgressInput as UpdateReadingProgressDtoInput,
} from './types.ts';

type MockRepository = {
  findById: Mock<(id: string) => Promise<ReadingProgress | null>>;
  findByUserAndBook: Mock<(userId: string, bookId: string) => Promise<ReadingProgress | null>>;
  findByUser: Mock<
    (
      userId: string,
      params: { bookId?: string; page?: number; limit?: number },
    ) => Promise<{ progress: ReadingProgress[]; total: number }>
  >;
  create: Mock<(data: CreateReadingProgressInput) => Promise<ReadingProgress>>;
  update: Mock<(id: string, data: UpdateReadingProgressInput) => Promise<ReadingProgress>>;
  delete: Mock<(id: string) => Promise<void>>;
};

type MockLogger = {
  info: Mock;
  log: Mock;
  error: Mock;
  warn: Mock;
  debug: Mock;
  verbose: Mock;
};

type MockValkey = { get: Mock; set: Mock; del: Mock; exists: Mock };

const STARTED_AT = new Date('2026-01-01T00:00:00.000Z');
const LAST_READ_AT = new Date('2026-01-05T10:00:00.000Z');
const COMPLETED_AT = new Date('2026-01-06T00:00:00.000Z');

function progress(overrides: Partial<ReadingProgress> = {}): ReadingProgress {
  return {
    id: 'progress-1',
    userId: 'user-1',
    bookId: 'book-1',
    currentPage: 50,
    totalPages: 200,
    progressPercentage: 25,
    startedAt: STARTED_AT,
    lastReadAt: LAST_READ_AT,
    completedAt: null,
    createdAt: STARTED_AT,
    updatedAt: LAST_READ_AT,
    ...overrides,
  };
}

function createInput(overrides: Partial<CreateReadingProgressDtoInput> = {}): CreateReadingProgressDtoInput {
  return { bookId: 'book-1', currentPage: 1, totalPages: 200, ...overrides };
}

function updateInput(overrides: Partial<UpdateReadingProgressDtoInput> = {}): UpdateReadingProgressDtoInput {
  return { currentPage: 10, ...overrides };
}

describe('ReadingProgressService', () => {
  let service: ReadingProgressService;
  let repository: MockRepository;
  let logger: MockLogger;
  let valkey: MockValkey;

  beforeEach(() => {
    repository = {
      findById: vi.fn<(id: string) => Promise<ReadingProgress | null>>(),
      findByUserAndBook: vi.fn<(userId: string, bookId: string) => Promise<ReadingProgress | null>>(),
      findByUser:
        vi.fn<
          (
            userId: string,
            params: { bookId?: string; page?: number; limit?: number },
          ) => Promise<{ progress: ReadingProgress[]; total: number }>
        >(),
      create: vi.fn<(data: CreateReadingProgressInput) => Promise<ReadingProgress>>(),
      update: vi.fn<(id: string, data: UpdateReadingProgressInput) => Promise<ReadingProgress>>(),
      delete: vi.fn<(id: string) => Promise<void>>(),
    };

    logger = { info: vi.fn(), log: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn(), verbose: vi.fn() };
    valkey = { get: vi.fn(), set: vi.fn(), del: vi.fn(), exists: vi.fn() };

    service = new ReadingProgressService(
      repository,
      logger as unknown as WinstonLoggerService,
      valkey as unknown as ValkeyService,
    );
  });

  describe('create', () => {
    it('should create a progress row for the user and book', async () => {
      vi.mocked(repository.findByUserAndBook).mockResolvedValue(null);
      vi.mocked(repository.create).mockResolvedValue(progress());

      const result = await service.create('user-1', createInput());

      expect(result.id).toBe('progress-1');
      expect(result.bookId).toBe('book-1');
    });

    it('should force the userId from the authenticated caller', async () => {
      vi.mocked(repository.findByUserAndBook).mockResolvedValue(null);
      vi.mocked(repository.create).mockResolvedValue(progress());

      await service.create('user-1', createInput({ bookId: 'book-9' }));

      expect(repository.create).toHaveBeenCalledWith({
        bookId: 'book-9',
        currentPage: 1,
        totalPages: 200,
        userId: 'user-1',
      });
    });

    it('should check for an existing row for that user and book first', async () => {
      vi.mocked(repository.findByUserAndBook).mockResolvedValue(null);
      vi.mocked(repository.create).mockResolvedValue(progress());

      await service.create('user-1', createInput({ bookId: 'book-42' }));

      expect(repository.findByUserAndBook).toHaveBeenCalledWith('user-1', 'book-42');
    });

    it('should refuse to create a second progress row for the same book', async () => {
      vi.mocked(repository.findByUserAndBook).mockResolvedValue(progress());

      await expect(service.create('user-1', createInput())).rejects.toThrow(ForbiddenException);
      await expect(service.create('user-1', createInput())).rejects.toThrow(
        'Reading progress already exists for this book',
      );
    });

    it('should not write a second row when progress already exists', async () => {
      vi.mocked(repository.findByUserAndBook).mockResolvedValue(progress());

      await expect(service.create('user-1', createInput())).rejects.toThrow();

      expect(repository.create).not.toHaveBeenCalled();
    });

    it('should let the same book be tracked by a different user', async () => {
      vi.mocked(repository.findByUserAndBook).mockResolvedValue(null);
      vi.mocked(repository.create).mockResolvedValue(progress({ userId: 'user-2' }));

      const result = await service.create('user-2', createInput());

      expect(result.userId).toBe('user-2');
      expect(repository.findByUserAndBook).toHaveBeenCalledWith('user-2', 'book-1');
    });

    it('should create a row with only a book id when nothing else is supplied', async () => {
      vi.mocked(repository.findByUserAndBook).mockResolvedValue(null);
      vi.mocked(repository.create).mockResolvedValue(
        progress({ currentPage: 0, totalPages: null, progressPercentage: 0 }),
      );

      await service.create('user-1', { bookId: 'book-1' });

      expect(repository.create).toHaveBeenCalledWith({ bookId: 'book-1', userId: 'user-1' });
    });

    it('should log the new progress id, user and book', async () => {
      vi.mocked(repository.findByUserAndBook).mockResolvedValue(null);
      vi.mocked(repository.create).mockResolvedValue(progress());

      await service.create('user-1', createInput({ bookId: 'book-7' }));

      expect(logger.info).toHaveBeenCalledWith(
        'Reading progress created: progress-1 for user: user-1, book: book-7',
        'ReadingProgressService',
      );
    });

    it('should let a repository failure propagate', async () => {
      vi.mocked(repository.findByUserAndBook).mockResolvedValue(null);
      vi.mocked(repository.create).mockRejectedValue(new Error('duplicate key value violates unique constraint'));

      await expect(service.create('user-1', createInput())).rejects.toThrow(
        'duplicate key value violates unique constraint',
      );
    });
  });

  describe('findById', () => {
    it('should return the row when the caller owns it', async () => {
      vi.mocked(repository.findById).mockResolvedValue(progress());

      await expect(service.findById('progress-1', 'user-1')).resolves.toEqual(progress());
      expect(repository.findById).toHaveBeenCalledWith('progress-1');
    });

    it('should throw NotFoundException for a row that does not exist', async () => {
      vi.mocked(repository.findById).mockResolvedValue(null);

      await expect(service.findById('missing', 'user-1')).rejects.toThrow(NotFoundException);
      await expect(service.findById('missing', 'user-1')).rejects.toThrow('Reading progress not found');
    });

    it('should report another user progress as not found rather than forbidden', async () => {
      vi.mocked(repository.findById).mockResolvedValue(progress({ userId: 'user-2' }));

      await expect(service.findById('progress-1', 'user-1')).rejects.toThrow(NotFoundException);
      await expect(service.findById('progress-1', 'user-1')).rejects.toThrow('Reading progress not found');
    });

    it('should not leak that the row exists to a non-owner', async () => {
      vi.mocked(repository.findById).mockResolvedValue(null);
      const missing = await service.findById('missing', 'user-1').catch((error: unknown) => error as Error);

      vi.mocked(repository.findById).mockResolvedValue(progress({ userId: 'user-2' }));
      const otherUsers = await service.findById('progress-1', 'user-1').catch((error: unknown) => error as Error);

      expect((otherUsers as Error).message).toBe((missing as Error).message);
      expect((otherUsers as Error).constructor).toBe((missing as Error).constructor);
    });
  });

  describe('findByUserAndBook', () => {
    it('should return the row for that user and book', async () => {
      vi.mocked(repository.findByUserAndBook).mockResolvedValue(progress());

      await expect(service.findByUserAndBook('user-1', 'book-1')).resolves.toEqual(progress());
      expect(repository.findByUserAndBook).toHaveBeenCalledWith('user-1', 'book-1');
    });

    it('should throw NotFoundException when the user never started the book', async () => {
      vi.mocked(repository.findByUserAndBook).mockResolvedValue(null);

      await expect(service.findByUserAndBook('user-1', 'book-1')).rejects.toThrow(NotFoundException);
      await expect(service.findByUserAndBook('user-1', 'book-1')).rejects.toThrow('Reading progress not found');
    });

    it('should scope the lookup to the requesting user', async () => {
      vi.mocked(repository.findByUserAndBook).mockResolvedValue(null);

      await expect(service.findByUserAndBook('user-2', 'book-1')).rejects.toThrow();

      expect(repository.findByUserAndBook).toHaveBeenCalledWith('user-2', 'book-1');
    });
  });

  describe('findMyProgress', () => {
    it('should map every row and report the total, page and limit', async () => {
      vi.mocked(repository.findByUser).mockResolvedValue({ progress: [progress()], total: 1 });

      const result = await service.findMyProgress('user-1', {});

      expect(result).toEqual({
        progress: [
          {
            id: 'progress-1',
            bookId: 'book-1',
            currentPage: 50,
            totalPages: 200,
            progressPercentage: 25,
            lastReadAt: '2026-01-05T10:00:00.000Z',
            completedAt: null,
          },
        ],
        total: 1,
        page: 1,
        limit: 20,
      });
    });

    it('should never expose the owning user id in the response', async () => {
      vi.mocked(repository.findByUser).mockResolvedValue({ progress: [progress()], total: 1 });

      const result = await service.findMyProgress('user-1', {});

      expect(result.progress[0]).not.toHaveProperty('userId');
      expect(result.progress[0]).not.toHaveProperty('startedAt');
    });

    it('should default to the first page of twenty', async () => {
      vi.mocked(repository.findByUser).mockResolvedValue({ progress: [], total: 0 });

      await service.findMyProgress('user-1', {});

      expect(repository.findByUser).toHaveBeenCalledWith('user-1', { bookId: undefined, page: 1, limit: 20 });
    });

    it('should forward an explicit page and limit', async () => {
      vi.mocked(repository.findByUser).mockResolvedValue({ progress: [], total: 0 });

      await service.findMyProgress('user-1', { page: 3, limit: 5 });

      expect(repository.findByUser).toHaveBeenCalledWith('user-1', { bookId: undefined, page: 3, limit: 5 });
    });

    it('should filter by book when one is requested', async () => {
      vi.mocked(repository.findByUser).mockResolvedValue({ progress: [], total: 0 });

      await service.findMyProgress('user-1', { bookId: 'book-7' });

      expect(repository.findByUser).toHaveBeenCalledWith('user-1', { bookId: 'book-7', page: 1, limit: 20 });
    });

    it.each([0, 1, 50, 100])('should pass a stored progressPercentage of %i straight through', async (percentage) => {
      vi.mocked(repository.findByUser).mockResolvedValue({
        progress: [progress({ progressPercentage: percentage })],
        total: 1,
      });

      const result = await service.findMyProgress('user-1', {});

      expect(result.progress[0]?.progressPercentage).toBe(percentage);
    });

    it('should serialise completedAt when the book was finished', async () => {
      vi.mocked(repository.findByUser).mockResolvedValue({
        progress: [progress({ progressPercentage: 100, completedAt: COMPLETED_AT })],
        total: 1,
      });

      const result = await service.findMyProgress('user-1', {});

      expect(result.progress[0]?.completedAt).toBe('2026-01-06T00:00:00.000Z');
    });

    it('should report a null completedAt for an unfinished book', async () => {
      vi.mocked(repository.findByUser).mockResolvedValue({ progress: [progress({ completedAt: null })], total: 1 });

      const result = await service.findMyProgress('user-1', {});

      expect(result.progress[0]?.completedAt).toBeNull();
    });

    it('should return an empty page for a user who never started a book', async () => {
      vi.mocked(repository.findByUser).mockResolvedValue({ progress: [], total: 0 });

      await expect(service.findMyProgress('user-1', {})).resolves.toEqual({
        progress: [],
        total: 0,
        page: 1,
        limit: 20,
      });
    });

    it('should always query for the requesting user only', async () => {
      vi.mocked(repository.findByUser).mockResolvedValue({ progress: [progress({ userId: 'user-2' })], total: 1 });

      await service.findMyProgress('user-1', {});

      expect(repository.findByUser.mock.calls[0]?.[0]).toBe('user-1');
    });
  });

  describe('update', () => {
    it('should persist the new page and progress', async () => {
      vi.mocked(repository.findById).mockResolvedValue(progress());
      vi.mocked(repository.update).mockResolvedValue(progress({ currentPage: 10, progressPercentage: 5 }));

      const result = await service.update('progress-1', 'user-1', updateInput({ progressPercentage: 5 }));

      expect(result.currentPage).toBe(10);
      expect(repository.update).toHaveBeenCalledWith('progress-1', {
        currentPage: 10,
        progressPercentage: 5,
        completedAt: undefined,
      });
    });

    it('should stamp completedAt when the progress reaches one hundred percent', async () => {
      vi.mocked(repository.findById).mockResolvedValue(progress());
      vi.mocked(repository.update).mockResolvedValue(progress({ progressPercentage: 100, completedAt: COMPLETED_AT }));

      await service.update('progress-1', 'user-1', updateInput({ currentPage: 200, progressPercentage: 100 }));

      expect(repository.update).toHaveBeenCalledWith('progress-1', {
        currentPage: 200,
        progressPercentage: 100,
        completedAt: expect.any(Date),
      });
    });

    it('should leave completedAt undefined below one hundred percent', async () => {
      vi.mocked(repository.findById).mockResolvedValue(progress());
      vi.mocked(repository.update).mockResolvedValue(progress());

      await service.update('progress-1', 'user-1', updateInput({ progressPercentage: 99 }));

      expect(repository.update).toHaveBeenCalledWith('progress-1', {
        currentPage: 10,
        progressPercentage: 99,
        completedAt: undefined,
      });
    });

    it.each([0, 1, 50, 99, 100])(
      'should not treat %i percent as complete when the payload omits progress',
      async (percentage) => {
        vi.mocked(repository.findById).mockResolvedValue(progress({ progressPercentage: percentage }));
        vi.mocked(repository.update).mockResolvedValue(progress());

        await service.update('progress-1', 'user-1', updateInput());

        expect(repository.update).toHaveBeenCalledWith('progress-1', {
          currentPage: 10,
          completedAt: undefined,
        });
      },
    );

    it('should invalidate the cached progress after a write', async () => {
      vi.mocked(repository.findById).mockResolvedValue(progress());
      vi.mocked(repository.update).mockResolvedValue(progress());

      await service.update('progress-1', 'user-1', updateInput());

      expect(valkey.del).toHaveBeenCalledWith('reading-progress:progress-1');
    });

    it('should log the updated progress id', async () => {
      vi.mocked(repository.findById).mockResolvedValue(progress());
      vi.mocked(repository.update).mockResolvedValue(progress());

      await service.update('progress-1', 'user-1', updateInput());

      expect(logger.info).toHaveBeenCalledWith('Reading progress updated: progress-1', 'ReadingProgressService');
    });

    it('should throw NotFoundException for a row that does not exist', async () => {
      vi.mocked(repository.findById).mockResolvedValue(null);

      await expect(service.update('missing', 'user-1', updateInput())).rejects.toThrow(NotFoundException);
      expect(repository.update).not.toHaveBeenCalled();
    });

    it('should refuse to update another user progress', async () => {
      vi.mocked(repository.findById).mockResolvedValue(progress({ userId: 'user-2' }));

      await expect(service.update('progress-1', 'user-1', updateInput())).rejects.toThrow(NotFoundException);
      await expect(service.update('progress-1', 'user-1', updateInput())).rejects.toThrow('Reading progress not found');
    });

    it('should not write or invalidate the cache for another user progress', async () => {
      vi.mocked(repository.findById).mockResolvedValue(progress({ userId: 'user-2' }));

      await expect(service.update('progress-1', 'user-1', updateInput())).rejects.toThrow();

      expect(repository.update).not.toHaveBeenCalled();
      expect(valkey.del).not.toHaveBeenCalled();
    });

    it('should let a repository failure propagate', async () => {
      vi.mocked(repository.findById).mockResolvedValue(progress());
      vi.mocked(repository.update).mockRejectedValue(new Error('write conflict'));

      await expect(service.update('progress-1', 'user-1', updateInput())).rejects.toThrow('write conflict');
    });
  });

  describe('delete', () => {
    it('should delete a row the caller owns', async () => {
      vi.mocked(repository.findById).mockResolvedValue(progress());

      await service.delete('progress-1', 'user-1');

      expect(repository.delete).toHaveBeenCalledWith('progress-1');
    });

    it('should invalidate the cache after the delete', async () => {
      vi.mocked(repository.findById).mockResolvedValue(progress());

      await service.delete('progress-1', 'user-1');

      expect(valkey.del).toHaveBeenCalledWith('reading-progress:progress-1');
    });

    it('should log the deleted progress id', async () => {
      vi.mocked(repository.findById).mockResolvedValue(progress());

      await service.delete('progress-1', 'user-1');

      expect(logger.info).toHaveBeenCalledWith('Reading progress deleted: progress-1', 'ReadingProgressService');
    });

    it('should throw NotFoundException for a row that does not exist', async () => {
      vi.mocked(repository.findById).mockResolvedValue(null);

      await expect(service.delete('missing', 'user-1')).rejects.toThrow(NotFoundException);
      await expect(service.delete('missing', 'user-1')).rejects.toThrow('Reading progress not found');
      expect(repository.delete).not.toHaveBeenCalled();
    });

    it('should refuse to delete another user progress', async () => {
      vi.mocked(repository.findById).mockResolvedValue(progress({ userId: 'user-2' }));

      await expect(service.delete('progress-1', 'user-1')).rejects.toThrow(NotFoundException);
      await expect(service.delete('progress-1', 'user-1')).rejects.toThrow('Reading progress not found');
    });

    it('should not delete or invalidate the cache for another user progress', async () => {
      vi.mocked(repository.findById).mockResolvedValue(progress({ userId: 'user-2' }));

      await expect(service.delete('progress-1', 'user-1')).rejects.toThrow();

      expect(repository.delete).not.toHaveBeenCalled();
      expect(valkey.del).not.toHaveBeenCalled();
    });
  });

  describe('ownership enforcement across the three mutators', () => {
    it.each([
      {
        method: 'update',
        invoke: (target: ReadingProgressService, id: string) => target.update(id, 'user-1', updateInput()),
      },
      { method: 'delete', invoke: (target: ReadingProgressService, id: string) => target.delete(id, 'user-1') },
    ])('should reject $method on a row owned by somebody else', async ({ invoke }) => {
      vi.mocked(repository.findById).mockResolvedValue(progress({ userId: 'user-2' }));

      await expect(invoke(service, 'progress-1')).rejects.toThrow(NotFoundException);
    });

    it('should reject findById on a row owned by somebody else', async () => {
      vi.mocked(repository.findById).mockResolvedValue(progress({ userId: 'user-2' }));

      await expect(service.findById('progress-1', 'user-1')).rejects.toThrow(NotFoundException);
    });

    it.each([
      {
        method: 'update',
        invoke: (target: ReadingProgressService, id: string) => target.update(id, 'user-1', updateInput()),
      },
      { method: 'delete', invoke: (target: ReadingProgressService, id: string) => target.delete(id, 'user-1') },
    ])('should not leak that the row exists through $method', async ({ invoke }) => {
      vi.mocked(repository.findById).mockResolvedValue(null);
      const missing = await invoke(service, 'missing').catch((error: unknown) => error as Error);

      vi.mocked(repository.findById).mockResolvedValue(progress({ userId: 'user-2' }));
      const otherUsers = await invoke(service, 'progress-1').catch((error: unknown) => error as Error);

      expect((otherUsers as Error).message).toBe((missing as Error).message);
      expect((otherUsers as Error).constructor).toBe((missing as Error).constructor);
    });
  });
});
