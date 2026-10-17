import { Injectable, NotFoundException, ConflictException, ForbiddenException, Inject } from '@nestjs/common';

import { EventValidatorService } from '../../common/events/event-validator.service.ts';
import { WinstonLoggerService } from '../../common/services/winston-logger.service.ts';
import { ValkeyService } from '../../common/services/valkey.service.ts';
import type {
  LibraryItemAddedEvent,
  LibraryItemAccessedEvent,
  LibraryItemRemovedEvent,
} from '../../common/events/library.events.ts';
import type { IBooksRepository } from '../books/interfaces/books-repository.interface.ts';
import { BOOKS_REPOSITORY } from '../books/interfaces/books-repository.interface.ts';

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
    // The books module's own interface: `claimFreeBook` must read `is_free` from the
    // authoritative source rather than trusting the request, and must not query the books
    // table itself (Principles #9 and #7).
    @Inject(BOOKS_REPOSITORY) private readonly booksRepository: IBooksRepository,
  ) {}

  /**
   * THE SINGLE WRITE PATH FOR AN ENTITLEMENT. Two callers, and only two:
   *
   *   claimFreeBook()          — a reader claiming a genuinely free book, over HTTP
   *   LibraryEventHandler      — a completed payment, from `payment.completed`
   *
   * It was previously reachable from `POST /library`, which passed no book, no price and no payment
   * state, so any authenticated account could grant itself any book in the catalogue. Making it
   * internal is the fix; the entitlement's meaning is decided by the callers, not here.
   */
  /**
   * Adds a FREE book to the reader's library, refusing anything for sale.
   *
   * WHY THE CHECK IS HERE AND NOT IN THE CONTROLLER. A controller-level check is bypassed by any other
   * caller, and `addToLibrary` has a second legitimate caller — the payment grant — which must NOT be
   * subject to an `is_free` test. Putting the rule at the service entry point means it holds for every
   * HTTP route, and the payment path reaches the private write path directly instead.
   *
   * WHY THE BOOK IS RE-READ RATHER THAN TRUSTED FROM THE REQUEST. The client names a book id; whether
   * that book is free is a fact about the book, and the only authoritative source for it is the books
   * table (Principle #9). Reading it through the books module's own repository interface rather than
   * querying the table here is Principle #7.
   */
  async claimFreeBook(userId: string, bookId: string): Promise<LibraryItem> {
    const book = await this.booksRepository.findById(bookId);
    if (!book || book.deletedAt) {
      throw new NotFoundException('Book not found');
    }
    if (!book.isFree) {
      // The specific 403 rather than the generic "book not found": the book exists and is visible,
      // so pretending otherwise would send the reader looking for a typo. It names the real route.
      throw new ForbiddenException('This book is not free. Purchase it to add it to your library.');
    }
    return this.addToLibrary(userId, { bookId });
  }

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

    await this.eventBus.emit('library.item.added', {
      libraryItemId: item.id,
      userId,
      bookId: dto.bookId,
    } as LibraryItemAddedEvent);
    return item;
  }

  async findMyLibrary(userId: string, query: LibraryQuery): Promise<LibraryListResponse> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const result = await this.libraryRepository.findByUser(userId, { status: query.status, page, limit });
    const items = await Promise.all(result.items.map(async (item) => this.toLibraryItemResponse(item)));

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

  async accessItem(id: string, userId: string): Promise<LibraryItem> {
    const item = await this.libraryRepository.findById(id);
    if (!item) {
      throw new NotFoundException('Library item not found');
    }

    if (item.userId !== userId) {
      throw new ForbiddenException('You do not have access to this library item');
    }

    // WHY THE STATUS IS LEFT ALONE. This used to write `status: 'reading'` unconditionally, which
    // demoted the very column every entitlement decision reads: a `rented` row opened once became
    // `reading` and slipped past both of `BooksService.purchase`'s guards (`owned` and `rented`), so
    // the reader was charged a second time for a book the library already said they held; and an
    // `owned` row read once stopped being recognisable as owned. The activity signal this route cares
    // about is `lastAccessedAt`, which it already stamps. `reading` and `completed` remain accepted
    // vocabulary in the DTO for callers that have an activity state to record — what this route no
    // longer does is overwrite an entitlement with one.
    const updated = await this.libraryRepository.update(id, {
      lastAccessedAt: new Date(),
    });

    await this.eventBus.emit('library.item.accessed', {
      libraryItemId: id,
      userId: item.userId,
    } as LibraryItemAccessedEvent);
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

  /**
   * Revokes a purchased book's entitlement because its payment was refunded. Idempotent.
   *
   * WHY A DEDICATED METHOD RATHER THAN `removeFromLibrary`. `removeFromLibrary` revokes by the item
   * id and throws `NotFoundException` when the row is already gone — right for a reader-initiated
   * DELETE, wrong for a `refund.completed` consumer: a replayed gateway delivery must not turn "the
   * entitlement is already revoked" into a 500 (Principle #16). This finds the entry the refund
   * targets by the same `(userId, bookId)` the grant used and calls the removal path only when the
   * entry still exists, so removing an already-absent entitlement is a no-op that returns `false`.
   *
   * The removal itself reuses {@link removeFromLibrary}, so the vault-key delete and the
   * `library.item.removed` announcement stay in the one place that owns them (Principle #9); this
   * method only adds the "is it still there?" guard a refund consumer needs.
   *
   * It is only ever called for a `purchase` refund. A purchase payment cannot coexist with a
   * `rented` library row for the same book — the purchase route refuses a reader who is mid-rental —
   * so the entry this removes is the `owned` one the grant wrote, never a rental the reader still
   * paid for.
   *
   * @returns `true` when an entry was removed; `false` when there was none (already revoked, or a
   *   payment whose entitlement never materialised).
   */
  async removeBookForRefund(userId: string, bookId: string): Promise<boolean> {
    const item = await this.libraryRepository.findByUserAndBook(userId, bookId);
    if (!item) {
      return false;
    }
    try {
      await this.removeFromLibrary(item.id, userId);
      return true;
    } catch (error) {
      // `removeFromLibrary` re-reads the row by id and throws `NotFoundException` if it has vanished.
      // A concurrent revocation of the same entry can do that between the lookup and the delete; the
      // entitlement is gone either way, so it is the same no-op a replayed delivery must be rather
      // than a failure (Principle #16). Anything else re-throws — a real infra error is not "gone".
      if (error instanceof NotFoundException) {
        return false;
      }
      throw error;
    }
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
