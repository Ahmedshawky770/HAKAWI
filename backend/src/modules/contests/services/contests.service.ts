import { Injectable, Logger, NotFoundException, BadRequestException, Inject } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { IContestsRepository, ContestFilters, UpdateContestData } from '../interfaces/contests-repository.interface.js';
import { CONTESTS_REPOSITORY } from '../interfaces/contests-repository.interface.js';
import { ContestsRepository } from '../repositories/contests.repository.js';
import { CreateContestDto, UpdateContestDto } from '../dto/contests.dto.js';

export const CONTEST_STATUS = {
  DRAFT: 'draft',
  PUBLISHED: 'published',
  ACTIVE: 'active',
  VOTING: 'voting',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
} as const;

export type ContestStatus = (typeof CONTEST_STATUS)[keyof typeof CONTEST_STATUS];

export const PRIZE_TYPE = {
  CASH: 'cash',
  BADGE: 'badge',
  RECOGNITION: 'recognition',
  PUBLICATION: 'publication',
} as const;

export type PrizeType = (typeof PRIZE_TYPE)[keyof typeof PRIZE_TYPE];

@Injectable()
export class ContestsService {
  private readonly logger = new Logger(ContestsService.name);

  constructor(
    @Inject(CONTESTS_REPOSITORY) private readonly contestsRepository: ContestsRepository,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async findById(id: string): Promise<unknown> {
    const contest = await this.contestsRepository.findById(id);
    if (!contest) {
      throw new NotFoundException('Contest not found');
    }
    return contest;
  }

  async findByPublisherId(publisherId: string): Promise<unknown[]> {
    return this.contestsRepository.findByPublisherId(publisherId);
  }

  async findPublished(filters: ContestFilters): Promise<unknown[]> {
    return this.contestsRepository.findPublished(filters);
  }

  async create(publisherId: string, data: CreateContestDto): Promise<unknown> {
    const contest = await this.contestsRepository.create({
      ...data,
      publisherId,
      status: CONTEST_STATUS.DRAFT,
      startDate: new Date(data.startDate),
      endDate: new Date(data.endDate),
      submissionDeadline: new Date(data.submissionDeadline),
    });

    this.eventEmitter.emit('contest.created', { contestId: contest.id, publisherId, title: contest.title, theme: contest.theme });
    return contest;
  }

  async update(id: string, publisherId: string, data: UpdateContestDto): Promise<unknown> {
    const contest = await this.findById(id) as { publisherId: string };
    if (contest.publisherId !== publisherId) {
      throw new BadRequestException('You can only update your own contests');
    }
    const updateData: UpdateContestData = {
      ...data,
      startDate: data.startDate ? new Date(data.startDate) : undefined,
      endDate: data.endDate ? new Date(data.endDate) : undefined,
      submissionDeadline: data.submissionDeadline ? new Date(data.submissionDeadline) : undefined,
    };
    return this.contestsRepository.update(id, updateData);
  }

  async delete(id: string, publisherId: string): Promise<void> {
    const contest = await this.findById(id) as { publisherId: string };
    if (contest.publisherId !== publisherId) {
      throw new BadRequestException('You can only delete your own contests');
    }
    await this.contestsRepository.delete(id);
  }

  async start(id: string, publisherId: string): Promise<unknown> {
    const contest = await this.findById(id) as { publisherId: string; status: string };
    if (contest.publisherId !== publisherId) {
      throw new BadRequestException('You can only start your own contests');
    }
    if (contest.status !== CONTEST_STATUS.PUBLISHED) {
      throw new BadRequestException('Only published contests can be started');
    }
    return this.contestsRepository.update(id, { status: CONTEST_STATUS.ACTIVE });
  }

  async end(id: string, publisherId: string): Promise<unknown> {
    const contest = await this.findById(id) as { publisherId: string };
    if (contest.publisherId !== publisherId) {
      throw new BadRequestException('You can only end your own contests');
    }
    return this.contestsRepository.update(id, { status: CONTEST_STATUS.COMPLETED });
  }
}
