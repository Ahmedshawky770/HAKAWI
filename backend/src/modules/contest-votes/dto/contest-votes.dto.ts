import { IsString } from 'class-validator';

export class CastVoteDto {
  submissionId: string;
}

export class ContestVoteResponseDto {
  id: string;
  contestId: string;
  userId: string;
  submissionId: string;
  createdAt: Date;
}
