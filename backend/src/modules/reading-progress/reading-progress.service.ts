import { Injectable, NotFoundException, ForbiddenException, Inject } from '@nestjs/common';

import { WinstonLoggerService } from '../../common/services/winston-logger.service.ts';
import { ValkeyService } from '../../common/services/valkey.service.ts';

import type {
  IReadingProgressRepository,
  ReadingProgress,
  CreateReadingProgressInput,
  UpdateReadingProgressInput,
} from './interfaces/reading-progress-repository.interface.ts';
import { READING_PROGRESS_REPOSITORY } from './interfaces/reading-progress-repository.interface.ts';
import type {
  ReadingProgressResponse,
  ReadingProgressListResponse,
  CreateReadingProgressInput as CreateReadingProgressDtoInput,
  UpdateReadingProgressInput as UpdateReadingProgressDtoInput,
} from './types.ts';

@Injectable()
export class ReadingProgressService {
  constructor(
    @Inject(READING_PROGRESS_REPOSITORY) private readonly readingProgressRepository: IReadingProgressRepository,
    @Inject(WinstonLoggerService) private readonly logger: WinstonLoggerService,
    @Inject(ValkeyService) private readonly valkeyService: ValkeyService,
  ) {}

  async create(userId: string, input: CreateReadingProgressDtoInput): Promise<ReadingProgress> {
    const existing = await this.readingProgressRepository.findByUserAndBook(userId, input.bookId);
    if (existing) {
      throw new ForbiddenException('Reading progress already exists for this book');
    }

    const data: CreateReadingProgressInput = {
      ...input,
      userId,
    };

    const progress = await this.readingProgressRepository.create(data);
    this.logger.info(
      `Reading progress created: ${progress.id} for user: ${userId}, book: ${input.bookId}`,
      'ReadingProgressService',
    );
    return progress;
  }

  async findById(id: string, userId: string): Promise<ReadingProgress> {
    const progress = await this.readingProgressRepository.findById(id);
    if (!progress) {
      throw new NotFoundException('Reading progress not found');
    }

    if (progress.userId !== userId) {
      throw new NotFoundException('Reading progress not found');
    }

    return progress;
  }

  async findByUserAndBook(userId: string, bookId: string): Promise<ReadingProgress> {
    const progress = await this.readingProgressRepository.findByUserAndBook(userId, bookId);
    if (!progress) {
      throw new NotFoundException('Reading progress not found');
    }
    return progress;
  }

  async findMyProgress(
    userId: string,
    params: { bookId?: string; page?: number; limit?: number },
  ): Promise<ReadingProgressListResponse> {
    const page = params.page ?? 1;
    const limit = params.limit ?? 20;

    const result = await this.readingProgressRepository.findByUser(userId, { bookId: params.bookId, page, limit });
    const progressList = result.progress.map((progress) => this.toResponse(progress));

    return {
      progress: progressList,
      total: result.total,
      page,
      limit,
    };
  }

  async update(id: string, userId: string, input: UpdateReadingProgressDtoInput): Promise<ReadingProgress> {
    const progress = await this.readingProgressRepository.findById(id);
    if (!progress) {
      throw new NotFoundException('Reading progress not found');
    }

    if (progress.userId !== userId) {
      throw new NotFoundException('Reading progress not found');
    }

    const data: UpdateReadingProgressInput = {
      ...input,
      completedAt: input.progressPercentage === 100 ? new Date() : undefined,
    };

    const updated = await this.readingProgressRepository.update(id, data);
    await this.valkeyService.del(`reading-progress:${id}`);

    this.logger.info(`Reading progress updated: ${id}`, 'ReadingProgressService');
    return updated;
  }

  async delete(id: string, userId: string): Promise<void> {
    const progress = await this.readingProgressRepository.findById(id);
    if (!progress) {
      throw new NotFoundException('Reading progress not found');
    }

    if (progress.userId !== userId) {
      throw new NotFoundException('Reading progress not found');
    }

    await this.readingProgressRepository.delete(id);
    await this.valkeyService.del(`reading-progress:${id}`);
    this.logger.info(`Reading progress deleted: ${id}`, 'ReadingProgressService');
  }

  private toResponse(progress: ReadingProgress): ReadingProgressResponse {
    return {
      id: progress.id,
      bookId: progress.bookId,
      currentPage: progress.currentPage,
      totalPages: progress.totalPages,
      progressPercentage: progress.progressPercentage,
      lastReadAt: progress.lastReadAt.toISOString(),
      completedAt: progress.completedAt?.toISOString() ?? null,
    };
  }
}
