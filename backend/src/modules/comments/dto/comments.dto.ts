import { IsString, IsUUID, IsOptional, MaxLength, MinLength } from 'class-validator';

export class CreateCommentDto {
  @IsUUID('4', { message: 'Story ID must be a valid UUID' })
  storyId: string;

  @IsString()
  @MinLength(1, { message: 'Comment content is required' })
  @MaxLength(2000, { message: 'Comment must not exceed 2000 characters' })
  content: string;

  @IsOptional()
  @IsUUID('4', { message: 'Parent comment ID must be a valid UUID' })
  parentId?: string;
}

export class UpdateCommentDto {
  @IsString()
  @MinLength(1, { message: 'Comment content is required' })
  @MaxLength(2000, { message: 'Comment must not exceed 2000 characters' })
  content: string;
}
