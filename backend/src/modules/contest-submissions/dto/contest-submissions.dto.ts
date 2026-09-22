import { IsString, IsInt } from 'class-validator';

export class CreateContestSubmissionDto {
  contestId: string;

  storyId: string;
}

export class ContestSubmissionResponseDto {
  id: string;
  contestId: string;
  authorId: string;
  storyId: string;
  status: string;
  submittedAt: Date;
  reviewNotes: string;
  finalRank: number;
  votesCount: number;
}
