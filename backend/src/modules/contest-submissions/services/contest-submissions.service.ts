import { Injectable, Logger, NotFoundException, ConflictException, BadRequestException, Inject } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { IContestSubmissionsRepository, CreateContestSubmissionData } from '../interfaces/contest-submissions-repository.interface.js';
import { CONTEST_SUBMISSIONS_REPOSITORY } from '../interfaces/contest-submissions-repository.interface.js';
import { ContestSubmissionsRepository } from '../repositories/contest-submissions.repository.js';

export const SUBMISSION_STATUS = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  WINNER: 'winner',
  RUNNER_UP: 'runner_up',
} as const;

export type SubmissionStatus = (typeof SUBMISSION_STATUS)[keyof typeof SUBMISSION_STATUS];

@Injectable()
export class ContestSubmissionsService {
  private readonly logger = new Logger(ContestSubmissionsService.name);

  constructor(
    @Inject(CONTEST_SUBMISSIONS_REPOSITORY) private readonly submissionsRepository: ContestSubmissionsRepository,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async findById(id: string): Promise<CreateContestSubmissionData> {
    const submission = await this.submissionsRepository.findById(id);
    if (!submission) {
      throw new NotFoundException('Contest submission not found');
    }
    return submission;
  }

  async findByContestId(contestId: string): Promise<CreateContestSubmissionData[]> {
    return this.submissionsRepository.findByContestId(contestId);
  }

  async findByAuthorId(authorId: string): Promise<CreateContestSubmissionData[]> {
    return this.submissionsRepository.findByAuthorId(authorId);
  }

  async create(userId: string, data: CreateContestSubmissionData): Promise<CreateContestSubmissionData> {
    const existing = await this.submissionsRepository.findByContestAndAuthor(data.contestId, userId);
    if (existing) {
      throw new ConflictException('You have already submitted to this contest');
    }
    const submission = await this.submissionsRepository.create({ ...data, authorId: userId, status: SUBMISSION_STATUS.PENDING });
    this.eventEmitter.emit('contest.submission_created', { submissionId: submission.id, contestId: data.contestId, userId, storyId: data.storyId });
    return submission;
  }

  async update(id: string, status: SubmissionStatus, reviewNotes?: string, finalRank?: number): Promise<CreateContestSubmissionData> {
    const updateData: Partial<CreateContestSubmissionData> = { status };
    if (reviewNotes !== undefined) updateData.reviewNotes = reviewNotes;
    if (finalRank !== undefined) updateData.finalRank = finalRank;
    return this.submissionsRepository.update(id, updateData);
  }
}
