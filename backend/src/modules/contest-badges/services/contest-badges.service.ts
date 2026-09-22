import { Injectable, Logger, NotFoundException, Inject } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { IContestBadgesRepository, CreateContestBadgeData } from '../interfaces/contest-badges-repository.interface.js';
import { CONTEST_BADGES_REPOSITORY } from '../interfaces/contest-badges-repository.interface.js';
import { ContestBadgesRepository } from '../repositories/contest-badges.repository.js';

@Injectable()
export class ContestBadgesService {
  private readonly logger = new Logger(ContestBadgesService.name);

  constructor(
    @Inject(CONTEST_BADGES_REPOSITORY) private readonly badgesRepository: ContestBadgesRepository,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async findByContestId(contestId: string): Promise<CreateContestBadgeData[]> {
    return this.badgesRepository.findByContestId(contestId);
  }

  async findByWinnerId(winnerId: string): Promise<CreateContestBadgeData[]> {
    return this.badgesRepository.findByWinnerId(winnerId);
  }

  async award(data: CreateContestBadgeData): Promise<CreateContestBadgeData> {
    const badge = await this.badgesRepository.create(data);
    this.eventEmitter.emit('contest.winner_selected', { contestId: data.contestId, winnerId: data.winnerId, submissionId: data.contestId, prize: data.badgeType });
    return badge;
  }
}
