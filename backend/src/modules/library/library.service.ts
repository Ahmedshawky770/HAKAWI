import { Injectable, NotFoundException, ConflictException, Inject } from '@nestjs/common';

import { EventValidatorService } from '../../common/events/event-validator.service.ts';
import { WinstonLoggerService } from '../../common/services/winston-logger.service.ts';
import { ValkeyService } from '../../common/services/valkey.service.ts';
import type { LibraryItemAddedEvent, LibraryItemAccessedEvent, LibraryItemRemovedEvent } from '../../common/events/library.events.ts';

import type { ILibraryRepository } from './interfaces/library-repository.interface.ts';
import { LIBRARY_REPOSITORY } from './interfaces/library-repository.interface.ts';
import type { LibraryItem, LibraryQuery, LibraryItemResponse, LibraryListResponse } from './types.ts';

@Injectable()
export class LibraryService {
  constructor(
    @Inject(LIBRARY_REPOSITORY) private readonly libraryRepository: ILibraryRepository,
    @Inject(WinstonLoggerService) private readonly logger: WinstonLoggerService,
    @Inject(ValkeyService) private readonly valkeyService: ValkeyService,
    @Inject(EventValidatorService) private readonly eventBus: EventValidatorService,
  ) {}

  async addToLibrary(userId: string, dto: { bookId: string; rentalId?: string }): Promise<LibraryItem> {
    const existing = await this.libraryRepository.findByUserAndBook(userId, dto.bookId);
    if (existing) {
      throw new ConflictException('Book already in library');
    }

    const status = dto.rentalId ? 'rented' : 'owned';
    const item = await this.libraryRepository.create({
      userId,
      bookId: dto.bookId,
      rentalId: dto.rentalId ?? null,
      status,
    });

    await this.eventBus.emit('library.item.added', { libraryItemId: item.id, userId, bookId: dto.bookId } as LibraryItemAddedEvent);
    return item;
  }

  async findMyLibrary(userId: string, query: LibraryQuery): Promise<LibraryListResponse> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const result = await this.libraryRepository.findByUser(userId, { status: query.status, page, limit });
    const items = result.items.map((item) => this.toLibraryItemResponse(item));

    return {
      items,
      total: result.total,
      page,
      limit,
    };
  }

  async count(userId: string): Promise<{ count: number }> {
    const count = await this.libraryRepository.countByUser(userId);
    return { count };
  }

  async accessItem(id: string): Promise<LibraryItem> {
    const item = await this.libraryRepository.findById(id);
    if (!item) {
      throw new NotFoundException('Library item not found');
    }

    const updated = await this.libraryRepository.update(id, {
      lastAccessedAt: new Date(),
      status: 'reading',
    });

    await this.eventBus.emit('library.item.accessed', { libraryItemId: id, userId: item.userId } as LibraryItemAccessedEvent);
    return updated;
  }

  async removeFromLibrary(id: string, userId: string): Promise<void> {
    const item = await this.libraryRepository.findById(id);
    if (!item) {
      throw new NotFoundException('Library item not found');
    }

    if (item.userId !== userId) {
      throw new NotFoundException('Library item not found');
    }

    await this.libraryRepository.delete(id);
    await this.valkeyService.del(`library:${id}`);

    await this.eventBus.emit('library.item.removed', { libraryItemId: id, userId } as LibraryItemRemovedEvent);
  }

  private toLibraryItemResponse(item: LibraryItem): LibraryItemResponse {
    return {
      id: item.id,
      userId: item.userId,
      bookId: item.bookId,
      rentalId: item.rentalId,
      status: item.status,
      addedAt: item.addedAt.toISOString(),
      lastAccessedAt: item.lastAccessedAt?.toISOString() ?? null,
    };
  }
}
