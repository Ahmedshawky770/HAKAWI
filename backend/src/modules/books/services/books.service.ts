import { Injectable, Logger, NotFoundException, ConflictException, BadRequestException, Inject } from '@nestjs/common';
import type { IBooksRepository, Book, BookFilters } from '../interfaces/books-repository.interface.js';
import { BOOKS_REPOSITORY } from '../interfaces/books-repository.interface.js';
import { BooksRepository } from '../repositories/books.repository.js';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { CreateBookDto, UpdateBookDto } from '../dto/books.dto.js';

@Injectable()
export class BooksService {
  private readonly logger = new Logger(BooksService.name);

  constructor(
    @Inject(BOOKS_REPOSITORY) private readonly booksRepository: BooksRepository,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async findById(id: string): Promise<Book> {
    const book = await this.booksRepository.findById(id);
    if (!book || book.deletedAt) {
      throw new NotFoundException('Book not found');
    }
    return book;
  }

  async findByOwnerId(ownerId: string): Promise<Book[]> {
    return this.booksRepository.findByOwnerId(ownerId);
  }

  async findPublished(filters: BookFilters): Promise<Book[]> {
    return this.booksRepository.findPublished(filters);
  }

  async create(ownerId: string, data: CreateBookDto): Promise<Book> {
    const book = await this.booksRepository.create({
      ...data,
      ownerId,
    });

    this.eventEmitter.emit('book.created', { bookId: book.id, authorId: ownerId, title: book.title, price: book.price });
    return book;
  }

  async update(id: string, ownerId: string, data: UpdateBookDto): Promise<Book> {
    const book = await this.findById(id);
    if (book.ownerId !== ownerId) {
      throw new BadRequestException('You can only update your own books');
    }
    const updated = await this.booksRepository.update(id, data);
    return updated;
  }

  async delete(id: string, ownerId: string): Promise<void> {
    const book = await this.findById(id);
    if (book.ownerId !== ownerId) {
      throw new BadRequestException('You can only delete your own books');
    }
    await this.booksRepository.delete(id);
  }
}
