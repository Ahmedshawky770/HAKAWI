import { IsString, IsInt, IsNumber, Min, IsEnum, IsDateString } from 'class-validator';

export class PurchaseBookDto {
  @IsString()
  bookId: string;
}

export class BookSaleResponseDto {
  id: string;
  bookId: string;
  sellerId: string;
  buyerId: string;
  salePrice: number;
  currency: string;
  saleType: string;
  purchasedAt: Date;
}
