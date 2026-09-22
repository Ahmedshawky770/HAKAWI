export interface IRentalExtensionsRepository {
  findById(id: string): Promise<RentalExtension | null>;
  findByRentalId(rentalId: string): Promise<RentalExtension[]>;
  findByUserId(userId: string): Promise<RentalExtension[]>;
  create(data: CreateRentalExtensionData): Promise<RentalExtension>;
}

export interface RentalExtension {
  id: string;
  rentalId: string;
  userId: string;
  oldEndDate: Date;
  newEndDate: Date;
  extensionPrice: number;
  createdAt: Date;
}

export interface CreateRentalExtensionData {
  rentalId: string;
  userId: string;
  oldEndDate: Date;
  newEndDate: Date;
  extensionPrice: number;
}

export const RENTAL_EXTENSIONS_REPOSITORY = 'RENTAL_EXTENSIONS_REPOSITORY';
