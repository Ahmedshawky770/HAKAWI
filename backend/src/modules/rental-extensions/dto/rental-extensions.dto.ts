import { IsString, IsInt, IsNumber, Min, IsDateString } from 'class-validator';

export class ExtendRentalDto {
  @IsString()
  rentalId: string;
}

export class RentalExtensionResponseDto {
  id: string;
  rentalId: string;
  userId: string;
  oldEndDate: Date;
  newEndDate: Date;
  extensionPrice: number;
  createdAt: Date;
}
