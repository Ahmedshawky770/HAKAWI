import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class UploadResponseDto {
  @IsString()
  filename: string;

  @IsString()
  originalName: string;

  @IsString()
  mimetype: string;

  @IsInt()
  @Min(0)
  size: number;

  @IsString()
  url: string;

  @IsOptional()
  @IsString()
  cdnUrl?: string;

  @IsOptional()
  @IsString()
  uploadedAt?: string;
}

export type UploadResponse = UploadResponseDto;

export const UPLOAD_FILENAME_PATTERN = /^[A-Za-z0-9._-]+$/;

export class GenerateUploadUrlDto {
  @IsOptional()
  @IsString()
  @MaxLength(255, { message: 'Filename must not exceed 255 characters' })
  filename?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100, { message: 'Content type must not exceed 100 characters' })
  contentType?: string;
}
