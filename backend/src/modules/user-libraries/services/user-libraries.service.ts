import { Injectable, Logger, NotFoundException, ConflictException, Inject } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { IUserLibrariesRepository, CreateUserLibraryData } from '../interfaces/user-libraries-repository.interface.js';
import { USER_LIBRARIES_REPOSITORY } from '../interfaces/user-libraries-repository.interface.js';
import { UserLibrariesRepository } from '../repositories/user-libraries.repository.js';

@Injectable()
export class UserLibrariesService {
  private readonly logger = new Logger(UserLibrariesService.name);

  constructor(
    @Inject(USER_LIBRARIES_REPOSITORY) private readonly librariesRepository: UserLibrariesRepository,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async findByUserId(userId: string): Promise<CreateUserLibraryData[]> {
    return this.librariesRepository.findByUserId(userId);
  }

  async create(userId: string, bookId: string, accessType: string): Promise<CreateUserLibraryData> {
    const existing = await this.librariesRepository.findByUserAndBook(userId, bookId);
    if (existing) {
      throw new ConflictException('Book already in library');
    }
    const entry = await this.librariesRepository.create({ userId, bookId, accessType });
    this.eventEmitter.emit('book.added_to_library', { userId, bookId, accessType });
    return entry;
  }

  async delete(userId: string, bookId: string): Promise<void> {
    const existing = await this.librariesRepository.findByUserAndBook(userId, bookId);
    if (!existing) {
      throw new NotFoundException('Book not found in library');
    }
    await this.librariesRepository.delete(existing.id);
  }
}
