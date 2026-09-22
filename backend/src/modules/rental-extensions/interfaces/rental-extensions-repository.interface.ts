import { symbol } from '../utils/symbol.util.js';
import type { RentalExtension } from '../../../db/schema/rental-extensions.schema.js';
import type { NewRentalExtension } from '../../../db/schema/rental-extensions.schema.js';

export const RENTAL_EXTENSIONS_REPOSITORY = symbol('RENTAL_EXTENSIONS_REPOSITORY');

export type CreateRentalExtensionData = NewRentalExtension;

export interface IRentalExtensionsRepository {
  findById(id: string): Promise<RentalExtension | null>;
  findByRentalId(rentalId: string): Promise<RentalExtension[]>;
  findByUserId(userId: string): Promise<RentalExtension[]>;
  create(data: CreateRentalExtensionData): Promise<RentalExtension>;
}
