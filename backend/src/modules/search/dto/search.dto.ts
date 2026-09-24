import { IsString, IsOptional, IsUUID, IsIn, IsInt, Min, Max } from 'class-validator';

export class SearchQueryDto {
  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  tag?: string;

  @IsOptional()
  @IsUUID('4', { message: 'Author ID must be a valid UUID' })
  authorId?: string;

  @IsOptional()
  @IsIn(['draft', 'published', 'archived'], { message: 'Status must be draft, published, or archived' })
  status?: string;

  @IsOptional()
  @IsIn(['relevance', 'date', 'views', 'reactions'], { message: 'Sort by must be relevance, date, views, or reactions' })
  sortBy?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
