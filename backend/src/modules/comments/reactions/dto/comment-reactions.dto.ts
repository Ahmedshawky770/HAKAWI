import { IsIn } from 'class-validator';

export class CreateCommentReactionDto {
  @IsIn(['like', 'love', 'wow', 'sad', 'angry', 'haunted'], {
    message: 'Reaction type must be one of: like, love, wow, sad, angry, haunted',
  })
  type: string;
}
