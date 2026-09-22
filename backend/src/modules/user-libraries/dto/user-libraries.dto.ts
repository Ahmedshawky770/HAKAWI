import { IsString, IsDateString } from 'class-validator';

export class UserLibraryResponseDto {
  id: string;
  userId: string;
  bookId: string;
  accessType: string;
  accessGrantedAt: Date;
  accessExpiresAt: Date;
  createdAt: Date;
}
