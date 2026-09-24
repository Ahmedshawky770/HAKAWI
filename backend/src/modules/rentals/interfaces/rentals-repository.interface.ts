export const RENTALS_REPOSITORY = Symbol('RENTALS_REPOSITORY');

export type Rental = {
  id: string;
  userId: string;
  bookId: string;
  status: string;
  startDate: Date;
  endDate: Date;
  extendedCount: number;
  maxExtensions: number;
  returnedAt: Date | null;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type CreateRentalInput = {
  userId: string;
  bookId: string;
  durationDays?: number;
};

export type RentalExtension = {
  id: string;
  rentalId: string;
  previousEndDate: Date;
  newEndDate: Date;
  extensionDays: number;
  createdAt: Date;
};

export interface IRentalsRepository {
  findById(id: string): Promise<Rental | null>;
  findByUserAndBook(userId: string, bookId: string): Promise<Rental | null>;
  findActiveByUser(userId: string): Promise<Rental[]>;
  findAll(params: {
    userId?: string;
    status?: string;
    page?: number;
    limit?: number;
  }): Promise<{ rentals: Rental[]; total: number }>;
  create(data: CreateRentalInput): Promise<Rental>;
  update(id: string, data: Partial<Rental>): Promise<Rental>;
  softDelete(id: string): Promise<void>;
  createExtension(data: {
    rentalId: string;
    previousEndDate: Date;
    newEndDate: Date;
    extensionDays: number;
  }): Promise<RentalExtension>;
  findExtensionsByRental(rentalId: string): Promise<RentalExtension[]>;
  findOverdue(): Promise<Rental[]>;
}
