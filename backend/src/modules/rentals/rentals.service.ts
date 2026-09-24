import { Injectable, NotFoundException, ConflictException, ForbiddenException, BadRequestException, Inject } from '@nestjs/common';

import { EventValidatorService } from '../../common/events/event-validator.service.ts';
import { WinstonLoggerService } from '../../common/services/winston-logger.service.ts';
import { ValkeyService } from '../../common/services/valkey.service.ts';
import type { RentalCreatedEvent, RentalExtendedEvent, RentalReturnedEvent, RentalExpiredEvent } from '../../common/events/rentals.events.ts';

import type { IRentalsRepository } from './interfaces/rentals-repository.interface.ts';
import { RENTALS_REPOSITORY } from './interfaces/rentals-repository.interface.ts';
import type { Rental, CreateRentalInput, RentalExtension, RentalResponse, RentalsListResponse, RentalExtensionResponse } from './types.ts';

@Injectable()
export class RentalsService {
  constructor(
    @Inject(RENTALS_REPOSITORY) private readonly rentalsRepository: IRentalsRepository,
    @Inject(WinstonLoggerService) private readonly logger: WinstonLoggerService,
    @Inject(ValkeyService) private readonly valkeyService: ValkeyService,
    @Inject(EventValidatorService) private readonly eventBus: EventValidatorService,
  ) {}

  async createRental(userId: string, input: CreateRentalInput): Promise<Rental> {
    const existing = await this.rentalsRepository.findByUserAndBook(userId, input.bookId);
    if (existing && existing.status === 'active') {
      throw new ConflictException('You already have an active rental for this book');
    }

    const durationDays = input.durationDays ?? 14;
    const data: CreateRentalInput = {
      ...input,
      userId,
      durationDays,
    };

    const rental = await this.rentalsRepository.create(data);
    await this.eventBus.emit('rental.created', { rentalId: rental.id, userId, bookId: input.bookId } as RentalCreatedEvent);
    return rental;
  }

  async findById(id: string): Promise<Rental> {
    const cached = await this.valkeyService.get(`rental:${id}`);
    if (cached) {
      return JSON.parse(cached) as Rental;
    }

    const rental = await this.rentalsRepository.findById(id);
    if (!rental || rental.deletedAt) {
      throw new NotFoundException('Rental not found');
    }

    await this.valkeyService.set(`rental:${id}`, JSON.stringify(rental), 300);
    return rental;
  }

  async findMyRentals(userId: string, params: { status?: string; page?: number; limit?: number }): Promise<RentalsListResponse> {
    const page = params.page ?? 1;
    const limit = params.limit ?? 20;

    const result = await this.rentalsRepository.findAll({ userId, status: params.status });
    const rentals = result.rentals.map((rental) => this.toRentalResponse(rental));

    return {
      rentals,
      total: result.total,
      page,
      limit,
    };
  }

  async extendRental(id: string, extensionDays: number): Promise<RentalExtension> {
    const rental = await this.rentalsRepository.findById(id);
    if (!rental || rental.deletedAt) {
      throw new NotFoundException('Rental not found');
    }

    if (rental.status !== 'active') {
      throw new ForbiddenException('Cannot extend a non-active rental');
    }

    if (rental.extendedCount >= rental.maxExtensions) {
      throw new ForbiddenException('Maximum extensions reached for this rental');
    }

    const previousEndDate = new Date(rental.endDate);
    const newEndDate = new Date(previousEndDate);
    newEndDate.setDate(newEndDate.getDate() + extensionDays);

    const extension = await this.rentalsRepository.createExtension({
      rentalId: id,
      previousEndDate,
      newEndDate,
      extensionDays,
    });

    await this.rentalsRepository.update(id, {
      endDate: newEndDate,
      extendedCount: rental.extendedCount + 1,
    });

    await this.valkeyService.del(`rental:${id}`);

    await this.eventBus.emit('rental.extended', { rentalId: id } as RentalExtendedEvent);
    return extension;
  }

  async returnRental(id: string): Promise<Rental> {
    const rental = await this.rentalsRepository.findById(id);
    if (!rental || rental.deletedAt) {
      throw new NotFoundException('Rental not found');
    }

    if (rental.status === 'returned') {
      throw new ForbiddenException('Rental has already been returned');
    }

    const updated = await this.rentalsRepository.update(id, {
      status: 'returned',
      returnedAt: new Date(),
    });

    await this.valkeyService.del(`rental:${id}`);

    await this.eventBus.emit('rental.returned', { rentalId: id } as RentalReturnedEvent);
    return updated;
  }

  async findOverdue(): Promise<Rental[]> {
    return this.rentalsRepository.findOverdue();
  }

  async checkAndExpireOverdue(): Promise<void> {
    const overdueRentals = await this.rentalsRepository.findOverdue();
    for (const rental of overdueRentals) {
      await this.rentalsRepository.update(rental.id, { status: 'expired' });
      await this.valkeyService.del(`rental:${rental.id}`);
      await this.eventBus.emit('rental.expired', { rentalId: rental.id } as RentalExpiredEvent);
    }
    this.logger.info(`Expired ${overdueRentals.length} overdue rentals`);
  }

  private toRentalResponse(rental: Rental): RentalResponse {
    return {
      id: rental.id,
      userId: rental.userId,
      bookId: rental.bookId,
      status: rental.status,
      startDate: rental.startDate.toISOString(),
      endDate: rental.endDate.toISOString(),
      extendedCount: rental.extendedCount,
      maxExtensions: rental.maxExtensions,
      returnedAt: rental.returnedAt?.toISOString() ?? null,
      createdAt: rental.createdAt.toISOString(),
      updatedAt: rental.updatedAt.toISOString(),
    };
  }

  private toRentalExtensionResponse(extension: RentalExtension): RentalExtensionResponse {
    return {
      id: extension.id,
      rentalId: extension.rentalId,
      previousEndDate: extension.previousEndDate.toISOString(),
      newEndDate: extension.newEndDate.toISOString(),
      extensionDays: extension.extensionDays,
      createdAt: extension.createdAt.toISOString(),
    };
  }
}
