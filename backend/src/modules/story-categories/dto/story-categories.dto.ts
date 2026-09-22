import { IsString, IsOptional, MaxLength } from 'class-validator';

export class CreateStoryCategoryDto {
  @IsString()
  @MaxLength(100, { message: 'Name must not exceed 100 characters' })
  name: string;

  @IsString()
  @MaxLength(100, { message: 'Slug must not exceed 100 characters' })
  slug: string;

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'Description must not exceed 500 characters' })
  description?: string;
}

export class UpdateStoryCategoryDto {
  @IsOptional()
  @IsString()
  @MaxLength(100, { message: 'Name must not exceed 100 characters' })
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100, { message: 'Slug must not exceed 100 characters' })
  slug?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'Description must not exceed 500 characters' })
  description?: string;
}

export class StoryCategoryResponseDto {
  id: string;
  name: string;
  slug: string;
  description: string;
  createdAt: Date;
  updatedAt: Date;
}
