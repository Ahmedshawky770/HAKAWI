export interface IBookRentalsRepository {
  findById(id: string): Promise<BookRental | null>;
  findByBookId(bookId: string): Promise<BookRental[]>;
  findByRenterId(renterId: string): Promise<BookRental[]>;
  findActiveByBookId(bookId: string): Promise<BookRental | null>;
  create(data: CreateBookRentalData): Promise<BookRental>;
  update(id: string, data: Partial<UpdateBookRentalData>): Promise<BookRental>;
  findExpiredRentals(): Promise<BookRental[]>;
}

export type RentalDuration = 'one_day' | 'three_days' | 'one_week' | 'two_weeks' | 'one_month' | 'three_months';
export type RentalStatus = 'active' | 'expired' | 'cancelled' | 'pending';

export interface BookRental {
  id: string;
  bookId: string;
  renterId: string;
  rentalDuration: RentalDuration;
  rentalPrice: number;
  platformCommission: number;
  ownerEarnings: number;
  status: RentalStatus;
  startDate: Date;
  endDate: Date;
  extensionCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateBookRentalData {
  bookId: string;
  renterId: string;
  rentalDuration: RentalDuration;
  rentalPrice: number;
  platformCommission: number;
  ownerEarnings: number;
  status: RentalStatus;
  startDate: Date;
  endDate: Date;
  extensionCount: number;
}

export interface UpdateBookRentalData extends Partial<Pick<BookRental, 'status' | 'endDate' | 'extensionCount'>> {}

export const BOOK_RENTALS_REPOSITORY = 'BOOK_RENTALS_REPOSITORY';
