import { Injectable, NotFoundException, ForbiddenException, ConflictException, Inject } from '@nestjs/common';

import { EventValidatorService } from '../../common/events/event-validator.service.ts';
import { WinstonLoggerService } from '../../common/services/winston-logger.service.ts';
import { ValkeyService } from '../../common/services/valkey.service.ts';
import type {
  ContestCreatedEvent,
  ContestUpdatedEvent,
  ContestStartedEvent,
  ContestCompletedEvent,
  ContestCancelledEvent,
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
  ContestResponse,
  ContestSubmissionResponse,
  ContestVoteResponse,
  ContestPrizeResponse,
  ContestsListResponse,
  PublisherStatsResponse,
  PublisherSubmissionOverview,
  PublisherVoteOverview,
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
    const title: string = input.title.trim();
    const existing = await this.contestsRepository.findAllContests({ search: title, limit: 1 });
    const duplicate = existing.contests.find((c) => c.title.toLowerCase() === title.toLowerCase());
    if (duplicate) {
      throw new ConflictException('Contest title already exists');
    }

    const data: CreateContestInput & { createdBy: string; status: string } = {
      ...input,
      createdBy,
      status: 'draft',
      startDate: input.startDate instanceof Date ? input.startDate : new Date(input.startDate),
      endDate: input.endDate instanceof Date ? input.endDate : new Date(input.endDate),
      submissionDeadline: input.submissionDeadline instanceof Date ? input.submissionDeadline : new Date(input.submissionDeadline),
    };

    const contest = await this.contestsRepository.createContest(data);
    this.eventBus.emit('contest.created', { contestId: contest.id, createdBy });
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

  async update(id: string, input: UpdateContestInput, userId: string): Promise<Contest> {
    const existing = await this.contestsRepository.findContestById(id);
    if (!existing) {
      throw new NotFoundException('Contest not found');
    }

    if (existing.createdBy !== userId) {
      throw new ForbiddenException('You can only update your own contests');
    }

    if (existing.status === 'completed' || existing.status === 'cancelled') {
      throw new ForbiddenException('Cannot update a completed or cancelled contest');
    }

    const contest = await this.contestsRepository.updateContest(id, input);
    await this.valkeyService.del(`contest:${id}`);

    this.eventBus.emit('contest.updated', { contestId: id, updatedFields: input });
    return contest;
  }

  async start(id: string, userId: string): Promise<Contest> {
    const contest = await this.contestsRepository.findContestById(id);
    if (!contest) {
      throw new NotFoundException('Contest not found');
    }

    if (contest.createdBy !== userId) {
      throw new ForbiddenException('You can only start your own contests');
    }

    if (contest.status !== 'draft') {
      throw new ForbiddenException('Contest is not in draft status');
    }

    const updated = await this.contestsRepository.updateContest(id, { status: 'active' });
    await this.valkeyService.del(`contest:${id}`);

    this.eventBus.emit('contest.started', { contestId: id });
    return updated;
  }

  async cancel(id: string, userId: string): Promise<Contest> {
    const contest = await this.contestsRepository.findContestById(id);
    if (!contest) {
      throw new NotFoundException('Contest not found');
    }

    if (contest.createdBy !== userId) {
      throw new ForbiddenException('You can only cancel your own contests');
    }

    if (contest.status === 'completed' || contest.status === 'cancelled') {
      throw new ForbiddenException('Cannot cancel a completed or already cancelled contest');
    }

    const updated = await this.contestsRepository.updateContest(id, { status: 'cancelled' });
    await this.valkeyService.del(`contest:${id}`);

    this.eventBus.emit('contest.cancelled', { contestId: id });
    return updated;
  }

  async complete(id: string, userId: string): Promise<Contest> {
    const contest = await this.contestsRepository.findContestById(id);
    if (!contest) {
      throw new NotFoundException('Contest not found');
    }

    if (contest.createdBy !== userId) {
      throw new ForbiddenException('You can only complete your own contests');
    }

    if (contest.status === 'completed' || contest.status === 'cancelled') {
      throw new ForbiddenException('Cannot complete an already completed or cancelled contest');
    }

    const winningSubmission = await this.contestsRepository.findWinningSubmission(id);
    const hasWinner = !!winningSubmission;

    const updateData: UpdateContestInput = { status: 'completed' };
    if (hasWinner) {
      const winning = winningSubmission;
      updateData.winnerId = winning.authorId;
    }

    const updated = await this.contestsRepository.updateContest(id, updateData);
    await this.valkeyService.del(`contest:${id}`);

    if (hasWinner) {
      const winning = winningSubmission;
      this.eventBus.emit('winner.selected', { contestId: id, submissionId: winning.id, winnerId: winning.authorId });
    }
    this.eventBus.emit('contest.completed', { contestId: id, winnerId: updateData.winnerId ?? null });
    return updated;
  }

  async submitStory(contestId: string, authorId: string, storyId: string, userId: string): Promise<ContestSubmission> {
    if (authorId !== userId) {
      throw new ForbiddenException('You can only submit stories as yourself');
    }

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
    this.eventBus.emit('submission.submitted', { submissionId: submission.id, contestId, authorId });
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

  async approveSubmission(submissionId: string, contestId: string, userId: string): Promise<ContestSubmission> {
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

    const updated = await this.contestsRepository.reviewSubmission(submissionId, 'approved', userId);
    this.eventBus.emit('submission.approved', { submissionId, contestId, authorId: submission.authorId });
    return updated;
  }

  async rejectSubmission(submissionId: string, contestId: string, userId: string): Promise<ContestSubmission> {
    const submission = await this.contestsRepository.findSubmissionById(submissionId);
    if (!submission) {
      throw new NotFoundException('Submission not found');
    }

    const updated = await this.contestsRepository.reviewSubmission(submissionId, 'rejected', userId);
    this.eventBus.emit('submission.rejected', { submissionId, contestId, authorId: submission.authorId });
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
    this.eventBus.emit('vote.cast', { voteId: vote.id, contestId, submissionId, userId });
    return vote;
  }

  async getVotes(contestId: string, submissionId: string | undefined, page = 1, limit = 20): Promise<{ votes: ContestVoteResponse[]; total: number }> {
    if (submissionId) {
      const submission = await this.contestsRepository.findSubmissionById(submissionId);
      if (!submission || submission.contestId !== contestId) {
        throw new NotFoundException('Submission not found in this contest');
      }

      const votes = await this.contestsRepository.findVotesBySubmission(submissionId);
      const mapped = votes.map((vote) => ({
        id: vote.id,
        contestId: vote.contestId,
        submissionId: vote.submissionId,
        userId: vote.userId,
        createdAt: vote.createdAt.toISOString(),
      }));

      return {
        votes: mapped.slice((page - 1) * limit, page * limit),
        total: mapped.length,
      };
    }

    const pageNum = Math.max(page, 1);
    const limitNum = Math.max(limit, 1);
    const offset = (pageNum - 1) * limitNum;

    const [votesPage, { total }] = await Promise.all([
      this.contestsRepository.findVotesByContest(contestId, limitNum, offset),
      this.contestsRepository.countVotesByContest(contestId),
    ]);

    return {
      votes: votesPage.map((vote) => ({
        id: vote.id,
        contestId: vote.contestId,
        submissionId: vote.submissionId,
        userId: vote.userId,
        createdAt: vote.createdAt.toISOString(),
      })),
      total: Number(total),
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

    const submission = await this.contestsRepository.findSubmissionById(submissionId);
    if (!submission || submission.contestId !== contestId) {
      throw new NotFoundException('Submission not found in this contest');
    }

    if (submission.authorId !== winnerId) {
      throw new ForbiddenException('Winner must be the author of the selected submission');
    }

    const updated = await this.contestsRepository.updateContest(contestId, { winnerId, status: 'completed' });
    await this.valkeyService.del(`contest:${contestId}`);

    this.eventBus.emit('winner.selected', { contestId, submissionId, winnerId });
    this.eventBus.emit('contest.completed', { contestId, winnerId });
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

    this.eventBus.emit('prize.distributed', { prizeId: prize.id, contestId, winnerId });
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

  async getPublisherStats(publisherId: string): Promise<PublisherStatsResponse> {
    const contests = await this.contestsRepository.findAllContests({});
    const publisherContests = contests.contests.filter((c) => c.createdBy === publisherId);

    const totalContests = publisherContests.length;
    const activeContests = publisherContests.filter((c) => c.status === 'active' || c.status === 'voting').length;
    const completedContests = publisherContests.filter((c) => c.status === 'completed').length;

    let totalSubmissions = 0;
    let pendingSubmissions = 0;
    let approvedSubmissions = 0;
    let rejectedSubmissions = 0;
    let totalVotes = 0;
    let totalPrizes = 0;

    for (const contest of publisherContests) {
      const submissionsResult = await this.contestsRepository.findSubmissionsByContest(contest.id, 1, 1000);
      totalSubmissions += submissionsResult.total;
      pendingSubmissions += submissionsResult.submissions.filter((s) => s.status === 'pending').length;
      approvedSubmissions += submissionsResult.submissions.filter((s) => s.status === 'approved').length;
      rejectedSubmissions += submissionsResult.submissions.filter((s) => s.status === 'rejected').length;

      const votesCount = await this.contestsRepository.countVotesByContest(contest.id);
      totalVotes += Number(votesCount.total);

      const prizes = await this.contestsRepository.findPrizesByContest(contest.id);
      totalPrizes += prizes.length;
    }

    return {
      totalContests,
      activeContests,
      completedContests,
      totalSubmissions,
      pendingSubmissions,
      approvedSubmissions,
      rejectedSubmissions,
      totalVotes,
      totalPrizes,
    };
  }

  async getPublisherSubmissionsOverview(contestId: string, publisherId: string): Promise<PublisherSubmissionOverview[]> {
    const contest = await this.contestsRepository.findContestById(contestId);
    if (!contest) {
      throw new NotFoundException('Contest not found');
    }

    if (contest.createdBy !== publisherId) {
      throw new ForbiddenException('You do not have access to this contest');
    }

    const result = await this.contestsRepository.findSubmissionsByContest(contestId, 1, 1000);
    const overview: PublisherSubmissionOverview[] = [];

    for (const submission of result.submissions) {
      const votesCount = await this.contestsRepository.countVotesBySubmission(submission.id);
      overview.push({
        id: submission.id,
        storyId: submission.storyId,
        authorId: submission.authorId,
        status: submission.status,
        submittedAt: submission.submittedAt.toISOString(),
        reviewedAt: submission.reviewedAt?.toISOString() ?? null,
        reviewedBy: submission.reviewedBy,
        votes: votesCount,
      });
    }

    return overview;
  }

  async getPublisherVotesOverview(contestId: string, publisherId: string): Promise<PublisherVoteOverview[]> {
    const contest = await this.contestsRepository.findContestById(contestId);
    if (!contest) {
      throw new NotFoundException('Contest not found');
    }

    if (contest.createdBy !== publisherId) {
      throw new ForbiddenException('You do not have access to this contest');
    }

    const votes = await this.contestsRepository.findVotesByContest(contestId, 1000, 0);
    return votes.map((vote) => ({
      id: vote.id,
      submissionId: vote.submissionId,
      userId: vote.userId,
      createdAt: vote.createdAt.toISOString(),
    }));
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
