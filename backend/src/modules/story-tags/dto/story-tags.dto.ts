import { IsString, MaxLength } from 'class-validator';

export class CreateStoryTagDto {
  @IsString()
  @MaxLength(50, { message: 'Name must not exceed 50 characters' })
  name: string;

  @IsString()
  @MaxLength(50, { message: 'Slug must not exceed 50 characters' })
  slug: string;
}

export class StoryTagResponseDto {
  id: string;
  name: string;
  slug: string;
  createdAt: Date;
}
