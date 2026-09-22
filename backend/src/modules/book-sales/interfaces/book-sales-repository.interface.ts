export interface IBookSalesRepository {
  findById(id: string): Promise<BookSale | null>;
  findByBookId(bookId: string): Promise<BookSale[]>;
  findByBuyerId(buyerId: string): Promise<BookSale[]>;
  findBySellerId(sellerId: string): Promise<BookSale[]>;
  create(data: CreateBookSaleData): Promise<BookSale>;
  findByTransactionId(transactionId: string): Promise<BookSale | null>;
}

export interface BookSale {
  id: string;
  bookId: string;
  sellerId: string;
  buyerId: string;
  salePrice: number;
  currency: string;
  saleType: string;
  purchasedAt: Date;
}

export interface CreateBookSaleData {
  bookId: string;
  sellerId: string;
  buyerId: string;
  salePrice: number;
  currency: string;
  saleType: string;
}

export const BOOK_SALES_REPOSITORY = 'BOOK_SALES_REPOSITORY';
