import { Injectable, NotFoundException, ForbiddenException, ConflictException, Inject } from '@nestjs/common';

import { EventValidatorService } from '../../common/events/event-validator.service.ts';
import { WinstonLoggerService } from '../../common/services/winston-logger.service.ts';
import { ValkeyService } from '../../common/services/valkey.service.ts';
import type {
  ContestCreatedEvent,
  ContestStartedEvent,
  ContestCompletedEvent,
  SubmissionSubmittedEvent,
  SubmissionApprovedEvent,
  SubmissionRejectedEvent,
  VoteCastEvent,
  WinnerSelectedEvent,
  PrizeDistributedEvent,
} from '../../common/events/contests.events.ts';

import type { IContestsRepository } from './interfaces/contests-repository.interface.ts';
import { CONTESTS_REPOSITORY } from './interfaces/contests-repository.interface.ts';
import type {
  Contest,
  ContestSubmission,
  ContestVote,
  ContestPrize,
  CreateContestInput,
  UpdateContestInput,
  CreateSubmissionInput,
  CastVoteInput,
  SelectWinnerInput,
  DistributePrizeInput,
  ContestResponse,
  ContestSubmissionResponse,
  ContestVoteResponse,
  ContestPrizeResponse,
  ContestsListResponse,
} from './types.ts';

@Injectable()
export class ContestsService {
  constructor(
    @Inject(CONTESTS_REPOSITORY) private readonly contestsRepository: IContestsRepository,
    @Inject(WinstonLoggerService) private readonly logger: WinstonLoggerService,
    @Inject(ValkeyService) private readonly valkeyService: ValkeyService,
    @Inject(EventValidatorService) private readonly eventBus: EventValidatorService,
  ) {}

  async create(createdBy: string, input: CreateContestInput): Promise<Contest> {
    const title = input.title.trim();
    const existing = await this.contestsRepository.findAllContests({ search: title, limit: 1 });
    const duplicate = existing.contests.find((c) => c.title.toLowerCase() === title.toLowerCase());
    if (duplicate) {
      throw new ConflictException('Contest title already exists');
    }

    const data: CreateContestInput & { status: string } = {
      ...input,
      createdBy,
      status: 'draft',
    };

    const contest = await this.contestsRepository.createContest(data);
    await this.eventBus.emit('contest.created', { contestId: contest.id, createdBy } as ContestCreatedEvent);
    return contest;
  }

  async findById(id: string): Promise<Contest> {
    const cached = await this.valkeyService.get(`contest:${id}`);
    if (cached) {
      return JSON.parse(cached) as Contest;
    }

    const contest = await this.contestsRepository.findContestById(id);
    if (!contest) {
      throw new NotFoundException('Contest not found');
    }

    await this.valkeyService.set(`contest:${id}`, JSON.stringify(contest), 600);
    return contest;
  }

  async findAll(params: { page?: number; limit?: number; categoryId?: string; status?: string; search?: string }): Promise<ContestsListResponse> {
    const page = params.page ?? 1;
    const limit = params.limit ?? 20;

    const result = await this.contestsRepository.findAllContests(params);
    const contests = result.contests.map((contest) => this.toContestResponse(contest));

    return {
      contests,
      total: result.total,
      page,
      limit,
    };
  }

  async update(id: string, input: UpdateContestInput): Promise<Contest> {
    const existing = await this.contestsRepository.findContestById(id);
    if (!existing) {
      throw new NotFoundException('Contest not found');
    }

    if (existing.status === 'completed' || existing.status === 'cancelled') {
      throw new ForbiddenException('Cannot update a completed or cancelled contest');
    }

    const contest = await this.contestsRepository.updateContest(id, input);
    await this.valkeyService.del(`contest:${id}`);

    await this.eventBus.emit('contest.updated', { contestId: id, updatedFields: input } as unknown as ContestCreatedEvent);
    return contest;
  }

  async start(id: string): Promise<Contest> {
    const contest = await this.contestsRepository.findContestById(id);
    if (!contest) {
      throw new NotFoundException('Contest not found');
    }

    if (contest.status !== 'draft') {
      throw new ForbiddenException('Contest is not in draft status');
    }

    const updated = await this.contestsRepository.updateContest(id, { status: 'active' });
    await this.valkeyService.del(`contest:${id}`);

    await this.eventBus.emit('contest.started', { contestId: id } as ContestStartedEvent);
    return updated;
  }

  async cancel(id: string): Promise<Contest> {
    const contest = await this.contestsRepository.findContestById(id);
    if (!contest) {
      throw new NotFoundException('Contest not found');
    }

    if (contest.status === 'completed' || contest.status === 'cancelled') {
      throw new ForbiddenException('Cannot cancel a completed or already cancelled contest');
    }

    const updated = await this.contestsRepository.updateContest(id, { status: 'cancelled' });
    await this.valkeyService.del(`contest:${id}`);

    await this.eventBus.emit('contest.cancelled', { contestId: id } as unknown as ContestCreatedEvent);
    return updated;
  }

  async complete(id: string): Promise<Contest> {
    const contest = await this.contestsRepository.findContestById(id);
    if (!contest) {
      throw new NotFoundException('Contest not found');
    }

    if (contest.status === 'completed' || contest.status === 'cancelled') {
      throw new ForbiddenException('Cannot complete an already completed or cancelled contest');
    }

    const updated = await this.contestsRepository.updateContest(id, { status: 'completed' });
    await this.valkeyService.del(`contest:${id}`);

    const winningSubmission = await this.contestsRepository.findWinningSubmission(id);
    if (winningSubmission) {
      await this.contestsRepository.updateContest(id, { winnerId: winningSubmission.authorId });
      await this.eventBus.emit('winner.selected', { contestId: id, submissionId: winningSubmission.id, winnerId: winningSubmission.authorId } as WinnerSelectedEvent);
    }

    await this.eventBus.emit('contest.completed', { contestId: id, winnerId: winningSubmission?.authorId ?? null } as ContestCompletedEvent);
    return updated;
  }

  async submitStory(contestId: string, authorId: string, storyId: string): Promise<ContestSubmission> {
    const contest = await this.contestsRepository.findContestById(contestId);
    if (!contest) {
      throw new NotFoundException('Contest not found');
    }

    if (contest.status !== 'active') {
      throw new ForbiddenException('Contest is not accepting submissions');
    }

    const now = new Date();
    if (now > contest.submissionDeadline) {
      throw new ForbiddenException('Submission deadline has passed');
    }

    const existing = await this.contestsRepository.findSubmissionByContestAndAuthor(contestId, authorId);
    if (existing) {
      throw new ConflictException('You have already submitted a story to this contest');
    }

    const submission = await this.contestsRepository.createSubmission({ contestId, storyId, authorId });
    await this.eventBus.emit('submission.submitted', { submissionId: submission.id, contestId, authorId } as SubmissionSubmittedEvent);
    return submission;
  }

  async getSubmissions(contestId: string, page = 1, limit = 20): Promise<{ submissions: ContestSubmissionResponse[]; total: number }> {
    const result = await this.contestsRepository.findSubmissionsByContest(contestId, page, limit);
    const submissions = result.submissions.map((submission) => this.toSubmissionResponse(submission));

    return {
      submissions,
      total: result.total,
    };
  }

  async approveSubmission(submissionId: string, contestId: string): Promise<ContestSubmission> {
    const submission = await this.contestsRepository.findSubmissionById(submissionId);
    if (!submission) {
      throw new NotFoundException('Submission not found');
    }

    const contest = await this.contestsRepository.findContestById(contestId);
    if (!contest) {
      throw new NotFoundException('Contest not found');
    }

    if (contest.status !== 'active' && contest.status !== 'voting') {
      throw new ForbiddenException('Contest is not in a state to approve submissions');
    }

    const updated = await this.contestsRepository.reviewSubmission(submissionId, 'approved', contestId);
    await this.eventBus.emit('submission.approved', { submissionId, contestId, authorId: submission.authorId } as SubmissionApprovedEvent);
    return updated;
  }

  async rejectSubmission(submissionId: string, contestId: string): Promise<ContestSubmission> {
    const submission = await this.contestsRepository.findSubmissionById(submissionId);
    if (!submission) {
      throw new NotFoundException('Submission not found');
    }

    const updated = await this.contestsRepository.reviewSubmission(submissionId, 'rejected', contestId);
    await this.eventBus.emit('submission.rejected', { submissionId, contestId, authorId: submission.authorId } as SubmissionRejectedEvent);
    return updated;
  }

  async castVote(contestId: string, submissionId: string, userId: string): Promise<ContestVote> {
    const contest = await this.contestsRepository.findContestById(contestId);
    if (!contest) {
      throw new NotFoundException('Contest not found');
    }

    if (contest.status !== 'voting') {
      throw new ForbiddenException('Voting is not currently open for this contest');
    }

    const existing = await this.contestsRepository.findVoteByUserContestSubmission(contestId, submissionId, userId);
    if (existing) {
      throw new ConflictException('You have already voted for this submission');
    }

    const vote = await this.contestsRepository.castVote({ contestId, submissionId, userId });
    await this.eventBus.emit('vote.cast', { voteId: vote.id, contestId, submissionId, userId } as VoteCastEvent);
    return vote;
  }

  async getVotes(contestId: string, submissionId: string | undefined, page = 1, limit = 20): Promise<{ votes: ContestVoteResponse[]; total: number }> {
    if (submissionId) {
      const submission = await this.contestsRepository.findSubmissionById(submissionId);
      if (!submission || submission.contestId !== contestId) {
        throw new NotFoundException('Submission not found in this contest');
      }
      const vote = await this.contestsRepository.findVoteByUserContestSubmission(contestId, submissionId, '');
      return { votes: vote ? [{ id: vote.id, contestId: vote.contestId, submissionId: vote.submissionId, userId: vote.userId, createdAt: vote.createdAt.toISOString() }] : [], total: vote ? 1 : 0 };
    }

    const allSubmissions = await this.contestsRepository.findSubmissionsByContest(contestId, 1, 1000);
    const votes: ContestVoteResponse[] = [];
    for (const submission of allSubmissions.submissions) {
      const count = await this.contestsRepository.countVotesBySubmission(submission.id);
      votes.push({
        id: crypto.randomUUID(),
        contestId,
        submissionId: submission.id,
        userId: '',
        createdAt: submission.submittedAt.toISOString(),
      });
    }

    return {
      votes: votes.slice((page - 1) * limit, page * limit),
      total: votes.length,
    };
  }

  async selectWinner(contestId: string, submissionId: string, winnerId: string): Promise<Contest> {
    const contest = await this.contestsRepository.findContestById(contestId);
    if (!contest) {
      throw new NotFoundException('Contest not found');
    }

    if (contest.status !== 'voting') {
      throw new ForbiddenException('Contest is not in voting phase');
    }

    const updated = await this.contestsRepository.updateContest(contestId, { winnerId, status: 'completed' } as UpdateContestInput);
    await this.valkeyService.del(`contest:${contestId}`);

    await this.eventBus.emit('winner.selected', { contestId, submissionId, winnerId } as WinnerSelectedEvent);
    await this.eventBus.emit('contest.completed', { contestId, winnerId } as ContestCompletedEvent);
    return updated;
  }

  async distributePrize(contestId: string, submissionId: string, winnerId: string, prizeType: string, prizeDescription?: string | null): Promise<ContestPrize> {
    const contest = await this.contestsRepository.findContestById(contestId);
    if (!contest) {
      throw new NotFoundException('Contest not found');
    }

    if (contest.status !== 'completed') {
      throw new ForbiddenException('Contest must be completed before distributing prizes');
    }

    const prize = await this.contestsRepository.createPrize({
      contestId,
      submissionId,
      winnerId,
      prizeType,
      prizeDescription: prizeDescription ?? null,
    });

    await this.eventBus.emit('prize.distributed', { prizeId: prize.id, contestId, winnerId } as PrizeDistributedEvent);
    return prize;
  }

  async getPrizes(contestId: string): Promise<ContestPrizeResponse[]> {
    const contest = await this.contestsRepository.findContestById(contestId);
    if (!contest) {
      throw new NotFoundException('Contest not found');
    }

    const prizes = await this.contestsRepository.findPrizesByContest(contestId);
    return prizes.map((prize) => this.toPrizeResponse(prize));
  }

  private toContestResponse(contest: Contest): ContestResponse {
    return {
      id: contest.id,
      title: contest.title,
      description: contest.description,
      categoryId: contest.categoryId,
      startDate: contest.startDate.toISOString(),
      endDate: contest.endDate.toISOString(),
      submissionDeadline: contest.submissionDeadline.toISOString(),
      status: contest.status,
      createdBy: contest.createdBy,
      winnerId: contest.winnerId,
      createdAt: contest.createdAt.toISOString(),
      updatedAt: contest.updatedAt.toISOString(),
    };
  }

  private toSubmissionResponse(submission: ContestSubmission): ContestSubmissionResponse {
    return {
      id: submission.id,
      contestId: submission.contestId,
      storyId: submission.storyId,
      authorId: submission.authorId,
      status: submission.status,
      submittedAt: submission.submittedAt.toISOString(),
      reviewedAt: submission.reviewedAt?.toISOString() ?? null,
      reviewedBy: submission.reviewedBy,
    };
  }

  private toPrizeResponse(prize: ContestPrize): ContestPrizeResponse {
    return {
      id: prize.id,
      contestId: prize.contestId,
      submissionId: prize.submissionId,
      winnerId: prize.winnerId,
      prizeType: prize.prizeType,
      prizeDescription: prize.prizeDescription,
      distributedAt: prize.distributedAt?.toISOString() ?? null,
      createdAt: prize.createdAt.toISOString(),
    };
  }
}
