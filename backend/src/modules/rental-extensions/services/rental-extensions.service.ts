import { Injectable, Logger, NotFoundException, Inject } from '@nestjs/common';
import type { IRentalExtensionsRepository, CreateRentalExtensionData } from '../interfaces/rental-extensions-repository.interface.js';
import { RENTAL_EXTENSIONS_REPOSITORY } from '../interfaces/rental-extensions-repository.interface.js';
import { RentalExtensionsRepository } from '../repositories/rental-extensions.repository.js';

@Injectable()
export class RentalExtensionsService {
  private readonly logger = new Logger(RentalExtensionsService.name);

  constructor(
    @Inject(RENTAL_EXTENSIONS_REPOSITORY) private readonly extensionsRepository: RentalExtensionsRepository,
  ) {}

  async findById(id: string): Promise<CreateRentalExtensionData> {
    const extension = await this.extensionsRepository.findById(id);
    if (!extension) {
      throw new NotFoundException('Rental extension not found');
    }
    return extension;
  }

  async findByRentalId(rentalId: string): Promise<CreateRentalExtensionData[]> {
    return this.extensionsRepository.findByRentalId(rentalId);
  }

  async findByUserId(userId: string): Promise<CreateRentalExtensionData[]> {
    return this.extensionsRepository.findByUserId(userId);
  }

  async create(data: CreateRentalExtensionData): Promise<CreateRentalExtensionData> {
    return this.extensionsRepository.create(data);
  }
}
