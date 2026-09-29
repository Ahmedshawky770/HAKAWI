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
  durationDays: number;
};

export type CreateRentalRequest = {
  bookId: string;
  durationDays: number;
};

export type RentalExtension = {
  id: string;
  rentalId: string;
  previousEndDate: Date;
  newEndDate: Date;
  extensionDays: number;
  createdAt: Date;
};

export type RentalResponse = {
  id: string;
  userId: string;
  bookId: string;
  status: string;
  startDate: string;
  endDate: string;
  extendedCount: number;
  maxExtensions: number;
  returnedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type RentalExtensionResponse = {
  id: string;
  rentalId: string;
  previousEndDate: string;
  newEndDate: string;
  extensionDays: number;
  createdAt: string;
};

export type RentalsListResponse = {
  rentals: RentalResponse[];
  total: number;
  page: number;
  limit: number;
};

export type RentalStatus = 'active' | 'expired' | 'returned' | 'cancelled';

export const RENTAL_DURATION_PRESETS = [
  { label: '1 day', days: 1 },
  { label: '3 days', days: 3 },
  { label: '1 week', days: 7 },
  { label: '2 weeks', days: 14 },
  { label: '1 month', days: 30 },
  { label: '3 months', days: 90 },
] as const;

export type RentalDurationPreset = typeof RENTAL_DURATION_PRESETS[number]['days'];
