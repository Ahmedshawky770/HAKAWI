import { Injectable, Logger, NotFoundException, ConflictException, BadRequestException, Inject } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { IContestVotesRepository, CreateContestVoteData } from '../interfaces/contest-votes-repository.interface.js';
import { CONTEST_VOTES_REPOSITORY } from '../interfaces/contest-votes-repository.interface.js';
import { ContestVotesRepository } from '../repositories/contest-votes.repository.js';

@Injectable()
export class ContestVotesService {
  private readonly logger = new Logger(ContestVotesService.name);

  constructor(
    @Inject(CONTEST_VOTES_REPOSITORY) private readonly votesRepository: ContestVotesRepository,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async findByContestAndUser(contestId: string, userId: string): Promise<CreateContestVoteData | null> {
    return this.votesRepository.findByContestAndUser(contestId, userId);
  }

  async findBySubmissionId(submissionId: string): Promise<CreateContestVoteData[]> {
    return this.votesRepository.findBySubmissionId(submissionId);
  }

  async countBySubmission(submissionId: string): Promise<number> {
    return this.votesRepository.countBySubmission(submissionId);
  }

  async vote(userId: string, data: CreateContestVoteData): Promise<CreateContestVoteData> {
    const existing = await this.votesRepository.findByContestAndUser(data.contestId, userId);
    if (existing) {
      throw new ConflictException('You have already voted in this contest');
    }
    const vote = await this.votesRepository.create({ ...data, userId });
    this.eventEmitter.emit('contest.vote_cast', { voteId: vote.id, contestId: data.contestId, userId, submissionId: data.submissionId });
    return vote;
  }
}
