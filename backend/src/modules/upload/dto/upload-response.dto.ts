import { IsInt, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';

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

/**
 * The body of `POST /upload/confirm`, sent after the client has PUT the bytes at the presigned URL.
 *
 * `size` is checked against `MAX_FILE_SIZE` in `UploadService.confirmUpload`, not here: the limit is
 * a deployment setting rather than a constant of the request contract, so the service is the layer
 * that owns it. The presigned `PutObject` cannot itself carry a `ContentLengthRange`, which is why
 * the size has to be re-asserted once the object already exists.
 */
export class ConfirmUploadDto {
  @IsString()
  @MaxLength(255, { message: 'Filename must not exceed 255 characters' })
  filename: string;

  @IsString()
  @MaxLength(255, { message: 'Original name must not exceed 255 characters' })
  originalName: string;

  @IsString()
  @MaxLength(100, { message: 'Mimetype must not exceed 100 characters' })
  mimetype: string;

  @IsInt({ message: 'Size must be an integer' })
  @Min(0, { message: 'Size must not be negative' })
  size: number;

  @IsOptional()
  @IsUUID('4', { message: 'Story id must be a valid UUID' })
  storyId?: string;
}
