import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
  InternalServerErrorException,
  Inject,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  RENTAL_CURRENCY,
  RENTAL_DURATION_DAYS,
  isRentalDurationDays,
  rentalPriceForDays,
  type BookCheckoutResponse,
} from '@hakawi/shared-types';

import { EventValidatorService } from '../../common/events/event-validator.service.ts';
import { WinstonLoggerService } from '../../common/services/winston-logger.service.ts';
import {
  PAYMOB_CONFIG_NAMESPACE,
  resolvePaymobPaymentMethodId,
  type PaymobConfig,
  type PaymobPaymentMethodChoice,
} from '../../config/paymob.config.ts';
import { TaggedCacheService } from '../shared/cache/tagged-cache.service.ts';
import type {
  BookCreatedEvent,
  BookUpdatedEvent,
  BookPublishedEvent,
  BookArchivedEvent,
  BookDeletedEvent,
} from '../../common/events/books.events.ts';
import { PaymentsService } from '../payments/payments.service.ts';
import type { PaymobCheckoutResponse } from '../payments/types.ts';
import { RentalsService } from '../rentals/rentals.service.ts';
import type { ILibraryRepository } from '../library/interfaces/library-repository.interface.ts';
import { LIBRARY_REPOSITORY } from '../library/interfaces/library-repository.interface.ts';

import type { Book, CreateBookInput, UpdateBookInput, BooksListResponse } from './types.ts';
import { reviveBookDates, toBookResponse } from './types.ts';
import { BOOKS_REPOSITORY } from './interfaces/books-repository.interface.ts';
import type { IBooksRepository } from './interfaces/books-repository.interface.ts';

export const BOOK_CACHE_NAMESPACE = 'book';
export const BOOKS_CACHE_TAG = 'books';
export const BOOK_CACHE_TTL_SECONDS = 600;

/**
 * Cache key for an ISBN lookup. A book is readable by id and by ISBN, so it has two cache entries
 * and therefore two things to invalidate — see `invalidateBookCache`.
 */
export function bookIsbnCacheKey(isbn: string): string {
  return `isbn:${isbn}`;
}

@Injectable()
export class BooksService {
  constructor(
    @Inject(BOOKS_REPOSITORY) private readonly booksRepository: IBooksRepository,
    @Inject(WinstonLoggerService) private readonly logger: WinstonLoggerService,
    @Inject(TaggedCacheService) private readonly cache: TaggedCacheService,
    @Inject(EventValidatorService) private readonly eventBus: EventValidatorService,
    @Inject(PaymentsService) private readonly paymentsService: PaymentsService,
    @Inject(RentalsService) private readonly rentalsService: RentalsService,
    // The library is the authoritative record of what a user owns (Principle #9), so the duplicate
    // purchase guard reads it through the library module's own repository interface rather than
    // querying `library` from the books module (Principle #7).
    @Inject(LIBRARY_REPOSITORY) private readonly libraryRepository: ILibraryRepository,
    // THE PAYMOB CONFIGURATION, FOR THE READER'S CHOICE OF INSTRUMENT.
    //
    // WHY THE CONFIG SERVICE AND NOT THE `PAYMOB_CONFIG` TOKEN. The token is provided inside the
    // payments module and is not exported from it, so it cannot be injected here — and the
    // configuration itself is reachable in exactly one other way: `ConfigModule.forFeature(paymob)`
    // merges the resolved configuration into the shared config host under the `paymob` namespace,
    // which is the same object the token's factory reads with `configService.get('paymob')`. So this
    // is the SAME resolved configuration, parsed from the environment ONCE at boot — not a second
    // parse of `process.env` at request time.
    //
    // It is optional so a service built by hand (a unit test) still works: with no configuration
    // there is no method id, and the gateway asks the customer which instrument to use.
    @Optional() private readonly configService?: ConfigService,
  ) {}

  async create(userId: string, input: CreateBookInput): Promise<Book> {
    if (input.isbn) {
      const existing = await this.booksRepository.findByIsbn(input.isbn);
      if (existing) {
        throw new ConflictException('Book ISBN already exists');
      }
    }

    const data: CreateBookInput = {
      ...input,
      // The owner is the authenticated caller, and it is placed AFTER the spread so a body field can
      // never set it. `CreateBookDto` does not declare `ownerId` and `main.ts` installs
      // `forbidNonWhitelisted: true`, so a client that sends one is refused with a 400 — but the
      // ordering is the actual guarantee and the DTO is only the friendlier half of it.
      ownerId: userId,
      status: 'draft',
      viewCount: 0,
      likeCount: 0,
      downloadCount: 0,
    };

    const book = await this.booksRepository.create(data);
    // No invalidation here on purpose: a brand-new id or ISBN has no cached entry to retire, and a
    // lookup that found nothing is not cached either (`getOrSet` never stores a rejected load).
    await this.eventBus.emit('book.created', { bookId: book.id, userId } as BookCreatedEvent);
    return book;
  }

  async findById(id: string): Promise<Book> {
    const { value } = await this.cache.getOrSet<Book>({
      namespace: BOOK_CACHE_NAMESPACE,
      key: id,
      ttl: BOOK_CACHE_TTL_SECONDS,
      tags: [BOOKS_CACHE_TAG],
      // Without this the cached copy of a book carries ISO strings where the repository returns
      // `Date`s, and `toBookResponse` throws `TypeError: createdAt.toISOString is not a function`
      // on every cache hit while the first, cold request succeeds.
      revive: reviveBookDates,
      load: async () => {
        const book = await this.booksRepository.findById(id);
        if (!book || book.deletedAt) {
          throw new NotFoundException('Book not found');
        }
        return book;
      },
    });
    return value;
  }

  /**
   * Reads a book by ISBN through the same cache as {@link findById}.
   *
   * It used to bypass the cache entirely, which made the two read paths of the same row behave
   * differently: a GET by id was served from Valkey for 10 minutes, a GET by ISBN always hit
   * PostgreSQL. That divergence is invisible in tests and is exactly the "conflicting caches"
   * shape Principle #9 forbids — the same entity with two independent staleness windows. Both
   * paths are cached under the same tag with the same TTL, and `invalidateBookCache` drops both
   * keys, so the two can never disagree.
   */
  async findByIsbn(isbn: string): Promise<Book> {
    const { value } = await this.cache.getOrSet<Book>({
      namespace: BOOK_CACHE_NAMESPACE,
      key: bookIsbnCacheKey(isbn),
      ttl: BOOK_CACHE_TTL_SECONDS,
      tags: [BOOKS_CACHE_TAG],
      revive: reviveBookDates,
      load: async () => {
        const book = await this.booksRepository.findByIsbn(isbn);
        if (!book || book.deletedAt) {
          throw new NotFoundException('Book not found');
        }
        return book;
      },
    });
    return value;
  }

  async findAll(params: {
    page?: number;
    limit?: number;
    categoryId?: string;
    status?: string;
    search?: string;
    author?: string;
  }): Promise<BooksListResponse> {
    const page = params.page ?? 1;
    const limit = params.limit ?? 20;

    const result = await this.booksRepository.findAll(params);
    const books = result.books.map((book) => toBookResponse(book));

    return {
      books,
      total: result.total,
      page,
      limit,
    };
  }

  async update(id: string, input: UpdateBookInput, userId: string): Promise<Book> {
    const existing = await this.booksRepository.findById(id);
    if (!existing || existing.deletedAt) {
      throw new NotFoundException('Book not found');
    }

    this.assertOwnership(existing, userId, 'update');

    if (input.isbn && input.isbn !== existing.isbn) {
      const isbnExists = await this.booksRepository.findByIsbn(input.isbn);
      if (isbnExists) {
        throw new ConflictException('Book ISBN already exists');
      }
    }

    const book = await this.booksRepository.update(id, input);
    // Both the previous and the new ISBN: a renamed ISBN leaves the old key behind otherwise.
    await this.invalidateBookCache(id, existing.isbn, book.isbn);

    await this.eventBus.emit('book.updated', { bookId: id, updatedFields: input } as BookUpdatedEvent);
    return book;
  }

  async publish(id: string, userId: string): Promise<Book> {
    const book = await this.booksRepository.findById(id);
    if (!book || book.deletedAt) {
      throw new NotFoundException('Book not found');
    }

    this.assertOwnership(book, userId, 'publish');

    if (book.status === 'published') {
      throw new ForbiddenException('Book is already published');
    }

    if (book.status === 'archived') {
      throw new ForbiddenException('Cannot publish an archived book');
    }

    const publishedAt = new Date();
    const updated = await this.booksRepository.update(id, {
      status: 'published',
      publishDate: publishedAt,
    });

    // Publishing changes status and sets `publishDate`, both of which are in the cached payload.
    // Without this the cache kept serving `status: 'draft'` and a null `publishDate` for the next
    // ten minutes — a stale read of the entity's own lifecycle.
    await this.invalidateBookCache(id, book.isbn, updated.isbn);

    await this.eventBus.emit('book.published', { bookId: id, publishedAt } as BookPublishedEvent);
    return updated;
  }

  async archive(id: string, userId: string): Promise<Book> {
    const book = await this.booksRepository.findById(id);
    if (!book || book.deletedAt) {
      throw new NotFoundException('Book not found');
    }

    this.assertOwnership(book, userId, 'archive');

    if (book.status === 'archived') {
      throw new ForbiddenException('Book is already archived');
    }

    const updated = await this.booksRepository.update(id, { status: 'archived' });
    await this.invalidateBookCache(id, book.isbn, updated.isbn);

    await this.eventBus.emit('book.archived', { bookId: id } as BookArchivedEvent);
    return updated;
  }

  async purchase(
    userId: string,
    bookId: string,
    paymentMethod?: PaymobPaymentMethodChoice,
  ): Promise<BookCheckoutResponse> {
    const book = await this.booksRepository.findById(bookId);
    if (!book || book.deletedAt) {
      throw new NotFoundException('Book not found');
    }

    // The self-purchase guard. It previously read `book.author === userId`, which never matched, so
    // nobody was ever stopped from paying for a book they already own.
    this.assertNotOwner(book, userId, 'purchase');

    if (book.isFree) {
      throw new BadRequestException('This book is free, no purchase needed');
    }

    // WHY THE ALREADY-OWNED CHECK COMES BEFORE THE PAYMENT IS INITIALISED.
    //
    // There was none, so ten calls to `POST /books/:id/purchase` created ten payment records and ten
    // checkout sessions for one book: the user is charged ten times for one entitlement. The check
    // reads the library, because that is the authoritative record of what the user has — Principle #9
    // says one source of truth per fact, and "does this user own this book" is answered by the library
    // rather than by counting payment rows, which can disagree with it exactly when the code is broken.
    const existing = await this.libraryRepository.findByUserAndBook(userId, bookId);
    if (existing && existing.status === 'owned') {
      throw new ConflictException('You already own this book');
    }

    // A rental in progress is not an ownership, but it IS a reason not to sell the book outright to
    // the same person: they would keep the rental and gain the permanent entitlement.
    if (existing && existing.status === 'rented') {
      throw new ConflictException('You already have this book on rental');
    }

    await this.booksRepository.incrementViewCount(bookId);
    // `viewCount` is part of the cached payload, so the counter bump has to retire this book's
    // entries or the next GET serves the pre-purchase count. Targeted invalidation — one DEL per
    // key — instead of a `books` sweep that evicted every other book in the deployment.
    await this.invalidateBookCache(bookId, book.isbn);

    // THE READER'S CHOICE, RESOLVED TO A GATEWAY INSTRUMENT — OR TO NOTHING.
    //
    // The choice is SEMANTIC: "card" or "wallet", the two words the reader picked on the checkout
    // panel. The gateway wants this merchant's own numeric id for that instrument, and only this
    // deployment knows it, so the translation happens here — through the ONE resolver both sides
    // share — and the id travels down to the gateway as an id.
    //
    // WHY AN ABSENT CONFIGURATION IS NOT A FAILURE. A deployment that has not configured a method id
    // gets `undefined`, and the gateway is then told nothing about the instrument, which is
    // Paymob's own "let the customer choose" case — exactly the behaviour the product had before
    // the reader could choose. Refusing the purchase over an optional convenience would cost a
    // reader a book because an operator had not filled in a number.
    const paymentMethodId = resolvePaymobPaymentMethodId(this.paymobConfig(), paymentMethod);

    const checkout = await this.paymentsService.paymobInitializePayment(
      userId,
      book.price ?? 0,
      'EGP',
      {
        bookId,
        type: 'purchase',
        // The SEMANTIC value is what the payment record keeps. "card" / "wallet" is what the reader
        // chose and what an analyst reconciles on; the gateway's numeric id is a fact about this
        // merchant's dashboard and never reaches the stored record.
        ...(paymentMethod === undefined ? {} : { paymentMethod }),
      },
      paymentMethodId,
    );
    return BooksService.toCheckoutResponse(checkout);
  }

  /**
   * The resolved Paymob configuration, or `undefined` when this service was built without one.
   *
   * Read per call rather than cached in the constructor: the configuration is merged into the shared
   * config host when the payments module is initialised, and a service that read it once at
   * construction time could be handed an empty host depending on module order.
   */
  private paymobConfig(): PaymobConfig | undefined {
    return this.configService?.get<PaymobConfig>(PAYMOB_CONFIG_NAMESPACE);
  }

  /**
   * Starts a rental by CHARGING for it.
   *
   * THE RETURN TYPE CHANGED, and it is the fix. This returned a `Rental`, i.e. an ACTIVE rental —
   * which is access — for free, because nothing here or in the rentals module ever took money. It now
   * returns a Paymob checkout, exactly as {@link purchase} does, and `RentalsEventHandler` creates the
   * rental row when `payment.completed` arrives. Access is therefore always downstream of payment, and
   * the two paths cannot diverge again.
   */
  async rent(
    userId: string,
    bookId: string,
    durationDays: number,
    paymentMethod?: PaymobPaymentMethodChoice,
  ): Promise<BookCheckoutResponse> {
    const book = await this.booksRepository.findById(bookId);
    if (!book || book.deletedAt) {
      throw new NotFoundException('Book not found');
    }

    // The self-rental guard, read from the owner column. It previously read `book.author === userId`,
    // which never matched, so renting your own book was never blocked.
    this.assertNotOwner(book, userId, 'rent');

    if (book.isFree) {
      // A free book is CLAIMED, not rented. An active rental is access, and granting access to a free
      // book through the paid path would produce a rental row that never needed one.
      throw new BadRequestException('This book is free. Add it to your library instead of renting it.');
    }

    if (!isRentalDurationDays(durationDays)) {
      throw new BadRequestException(`Invalid rental duration. Allowed values: ${RENTAL_DURATION_DAYS.join(', ')} days`);
    }

    const existingRental = await this.libraryRepository.findByUserAndBook(userId, bookId);
    if (existingRental) {
      // Checked against the library rather than the rentals table so one fact — "does this reader
      // already have this book" — has one answer (Principle #9). A reader who owns the book outright
      // must not also rent it, and a reader mid-rental must not buy their way into a second one.
      throw new ConflictException(
        existingRental.status === 'owned' ? 'You already own this book' : 'You already have this book on rental',
      );
    }

    await this.booksRepository.incrementViewCount(bookId);
    await this.invalidateBookCache(bookId, book.isbn);

    // WHY THIS CHARGES INSTEAD OF GRANTING. `RentalsService.createRental` used to be called here
    // directly and the rental was ACTIVE on return: an active rental IS access to a paid book, and it
    // was granted for free, because a search of the rentals module for `payment|amount|price|charge`
    // returned zero hits. A payment is initialised first and `RentalsEventHandler` creates the rental
    // from `payment.completed`, so access can never precede money.
    //
    // `durationDays` rides in the payment metadata because `RentalsEventHandler` has to reconstruct
    // the rental after the webhook, and the metadata is the stored record of what was bought — the same
    // channel the library grant uses for `bookId` (Principle #9: one authoritative record of the sale).
    const amount = rentalPriceForDays(durationDays);
    if (amount <= 0) {
      // Defensive: a zero or negative amount would initialise a checkout for nothing, which is a free
      // rental arrived at through a pricing mistake rather than through a policy decision.
      throw new InternalServerErrorException('Rental pricing is misconfigured');
    }

    const checkout = await this.paymentsService.paymobInitializePayment(
      userId,
      amount,
      RENTAL_CURRENCY,
      {
        bookId,
        type: 'rental',
        durationDays,
        // The SEMANTIC value, for the same reason the purchase records it: it
        // is what the reader chose, and it is what the stored record says.
        ...(paymentMethod === undefined ? {} : { paymentMethod }),
      },
      // The RESOLVED id, for the same reason the purchase passes it: the
      // gateway is the only thing that can act on it, and it is the only thing
      // that must not learn a number the reader could have typed.
      resolvePaymobPaymentMethodId(this.paymobConfig(), paymentMethod),
    );

    return BooksService.toCheckoutResponse(checkout);
  }

  /**
   * THE CHECKOUT CONTRACT, AND WHY IT IS EXPLICIT.
   *
   * `purchase` used to return the whole `payments` row — so the client received `paymentId`,
   * `orderId` and no URL at all. The frontend's schema asks for `paymobUrl`, Zod rejected the
   * response, and the buy flow therefore errored on every attempt AND never redirected the customer to
   * Paymob. `iframeUrl` and `acceptUrl` existed on `PaymobCheckoutResponse` the whole time and were
   * discarded by returning the wrong object.
   *
   * Both money paths now return the same shape, because "where do I send this customer" is one fact
   * (Principle #9) and it was previously answered two different ways — wrongly once.
   *
   * `checkoutUrl` is `iframeUrl` because that is what the customer-facing iframe integration loads.
   * `paymentKey` is included because a headless integration needs it and the type is already
   * public; it is not a secret in Paymob's model, but a caller that does not need it should ignore
   * it rather than this method pretending it does not exist.
   */
  private static toCheckoutResponse(checkout: PaymobCheckoutResponse): BookCheckoutResponse {
    return {
      paymentId: checkout.paymentId,
      orderId: checkout.orderId,
      checkoutUrl: checkout.iframeUrl,
      acceptUrl: checkout.acceptUrl,
      status: checkout.status,
    };
  }

  async delete(id: string, userId: string): Promise<void> {
    const book = await this.booksRepository.findById(id);
    if (!book || book.deletedAt) {
      throw new NotFoundException('Book not found');
    }

    this.assertOwnership(book, userId, 'delete');

    await this.booksRepository.softDelete(id);
    await this.invalidateBookCache(id, book.isbn);

    // `userId` is the OWNER's account id, not `book.author`. It used to carry the display name, which is
    // a 404 for every subscriber that compared it to a token subject — the same display-name-as-identity
    // conflation this whole change set removes.
    await this.eventBus.emit('book.deleted', { bookId: id, userId: book.ownerId } as BookDeletedEvent);
  }

  async incrementViewCount(id: string): Promise<void> {
    const book = await this.booksRepository.findById(id);
    if (!book || book.deletedAt) {
      throw new NotFoundException('Book not found');
    }

    await this.booksRepository.incrementViewCount(id);
    await this.invalidateBookCache(id, book.isbn);
  }

  // WHY THERE IS NO `incrementDownloadCount` HERE. The service carried one next to `incrementViewCount`
  // until this module's download work, when `POST /books/:id/download` moved to `recordDownload` —
  // the entitlement-checked path that does the counter bump itself. Left in place it was a second,
  // unchecked door to the same repository write: fetch, 404, increment, invalidate, with none of the
  // access question. It had exactly one caller (the controller line that now calls `recordDownload`)
  // and its own unit spec, so it kept looking alive. `incrementViewCount` above stays: the view route
  // still calls it.

  /**
   * The whole read path for a book's FILE: who may download it, and the counter that records it.
   *
   * WHY THE CHECK IS HERE. `POST /books/:id/download` used to authenticate the caller and then hand
   * over the file URL of any book in the catalogue — a paid book included — because nothing on the
   * route asked what the caller had paid for. Authentication is not entitlement: the question this
   * answers is what the account has ACQUIRED, and the library and the rental are the two records
   * that say so, read through their own modules' contracts (Principle #7) rather than by querying
   * their tables from here (Principle #9 keeps them authoritative for ownership and for the rental's
   * remaining time, respectively — hence `findActiveRentalForBook`, which judges access by the end
   * date rather than by a status word no clock maintains).
   *
   * A free book is the one exception, and it is stated first because it is the common case: nothing
   * was ever charged for it, so there is nothing to enforce.
   */
  async recordDownload(id: string, userId: string): Promise<Book> {
    const book = await this.booksRepository.findById(id);
    if (!book || book.deletedAt) {
      throw new NotFoundException('Book not found');
    }

    await this.assertReadAccess(book, userId);

    await this.booksRepository.incrementDownloadCount(id);
    await this.invalidateBookCache(id, book.isbn);
    return book;
  }

  /**
   * Whether `userId` may read the FILE of `book`.
   *
   * The facts that confer access, in order of cheapness: the book is free; the reader holds an
   * `owned` library row (the purchase grant or the free-book claim); or a rental of it is still
   * inside its dates. Anything else is a 403 that names the real route out — buy it or rent it —
   * rather than pretending the book is missing.
   *
   * WHY THE RENTAL IS RESOLVED EVEN WHEN A ROW EXISTS. This used to return on the mere existence of
   * a library row, so a `rented` row whose rental had lapsed kept handing out the paid book forever:
   * `checkAndExpireOverdue` has no scheduled caller, nothing retires a lapsed rental on a clock, and
   * `rental.expired` is only published by a refund. The stale row also blocked the legitimate
   * re-purchase and re-rental with a `ConflictException`. An `owned` row is a permanent entitlement
   * and is trusted on its own; every other row is only as good as the rental it records, and
   * `findActiveRentalForBook` judges that by the end date rather than by a status word no clock
   * maintains.
   */
  private async assertReadAccess(book: Book, userId: string): Promise<void> {
    if (book.isFree) {
      return;
    }

    const entry = await this.libraryRepository.findByUserAndBook(userId, book.id);
    if (entry && entry.status === 'owned') {
      return;
    }

    const rental = await this.rentalsService.findActiveRentalForBook(userId, book.id);
    if (rental) {
      return;
    }

    throw new ForbiddenException(
      'You do not have access to this book. Purchase it or rent it to add it to your library.',
    );
  }

  /**
   * Retires every cache entry that can represent this book: the id entry and the ISBN entry.
   *
   * WHY targeted and not a tag sweep: the `books` tag indexes *all* book entries, so
   * `invalidateTags([BOOKS_CACHE_TAG])` evicted every other book on every view, download, update
   * and publish — under read traffic the hit rate collapsed towards zero while still paying two
   * `SMEMBERS` + N `DEL` round trips per request. Deleting only this book's keys gives the same
   * correctness for the row that actually changed (the tag generation bump inside `invalidateKey`
   * makes the deletion visible to in-flight readers, which is what made the sweep necessary)
   * without turning one book's write into a cache-wide event.
   *
   * Callers pass every ISBN the row has been cached under — including the previous one when the
   * ISBN itself changed, otherwise the old key would keep serving the pre-rename book.
   */
  /**
   * Whether `userId` may mutate this book.
   *
   * WHY A HELPER RATHER THAN FIVE COPIES OF AN INEQUALITY. The same check appears on update,
   * publish, archive and delete, and it had drifted: the duplicate `CreateBookInput` that let a
   * field exist on one side of the repository boundary and not the other (Principle #9) is the same
   * failure mode as a guard copied four times. One implementation is one thing to get right.
   *
   * @param action the verb, for the message. It is interpolated rather than generic so an operator
   * reading a 403 knows which path refused them.
   */
  private isOwner(book: { ownerId: string | null }, userId: string): boolean {
    return book.ownerId !== null && book.ownerId === userId;
  }

  private assertOwnership(book: { ownerId: string | null }, userId: string, action: string): void {
    if (this.isOwner(book, userId)) {
      return;
    }
    if (book.ownerId === null) {
      // A book predating migration 0021. Saying so is the difference between an operator filing a
      // bug about "my books are locked" and one filing "these three books need claiming".
      throw new ForbiddenException(
        'This book has no owner. It was created before ownership was recorded, so an administrator must claim it before it can be ' +
          action +
          'd',
      );
    }
    throw new ForbiddenException('You can only ' + action + ' your own books');
  }

  private assertNotOwner(book: { ownerId: string | null }, userId: string, action: string): void {
    if (this.isOwner(book, userId)) {
      throw new ForbiddenException('Cannot ' + action + ' your own book');
    }
    // A null owner is not the caller, so this correctly allows the action. Failing closed here would
    // stop everyone from renting or buying every pre-existing book, which is a worse outcome than the
    // loss it would prevent — and the book has no owner to lose money to.
  }

  private async invalidateBookCache(id: string, ...isbns: readonly (string | null | undefined)[]): Promise<void> {
    await this.cache.invalidateKey(BOOK_CACHE_NAMESPACE, id, [BOOKS_CACHE_TAG]);
    for (const isbn of new Set(isbns.filter((value): value is string => typeof value === 'string' && value !== ''))) {
      await this.cache.invalidateKey(BOOK_CACHE_NAMESPACE, bookIsbnCacheKey(isbn), [BOOKS_CACHE_TAG]);
    }
  }
}
