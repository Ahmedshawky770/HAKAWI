import { IsIn } from 'class-validator';

export class CreateReactionDto {
  @IsIn(['like', 'love', 'wow', 'sad', 'angry', 'haunted'], {
    message: 'Reaction type must be one of: like, love, wow, sad, angry, haunted',
  })
  type: string;
}

export class UpdateReactionDto {
  @IsIn(['like', 'love', 'wow', 'sad', 'angry', 'haunted'], {
    message: 'Reaction type must be one of: like, love, wow, sad, angry, haunted',
  })
  type: string;
}
