import { IsEmail, IsString, Length } from 'class-validator';

export class ResendVerificationDto {
  @IsEmail({}, { message: 'Invalid email format' })
  email: string;
}
