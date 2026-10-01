import { Injectable, NotFoundException, ForbiddenException, ConflictException, Inject } from '@nestjs/common';

import { EventValidatorService } from '../../common/events/event-validator.service.ts';
import { WinstonLoggerService } from '../../common/services/winston-logger.service.ts';
import { TaggedCacheService } from '../shared/cache/tagged-cache.service.ts';
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
  ContestCategorySummary,
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
import { reviveContestDates } from './types.ts';

export const CONTEST_CACHE_NAMESPACE = 'contest';
export const CONTESTS_CACHE_TAG = 'contests';
export const CONTEST_CACHE_TTL_SECONDS = 600;

/** `categoryId` → category name, built with one query per page rather than one per contest. */
type ContestCategoryIndex = ReadonlyMap<string, string>;

@Injectable()
export class ContestsService {
  constructor(
    @Inject(CONTESTS_REPOSITORY) private readonly contestsRepository: IContestsRepository,
    @Inject(WinstonLoggerService) private readonly logger: WinstonLoggerService,
    @Inject(TaggedCacheService) private readonly cache: TaggedCacheService,
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
      submissionDeadline:
        input.submissionDeadline instanceof Date ? input.submissionDeadline : new Date(input.submissionDeadline),
    };

    const contest = await this.contestsRepository.createContest(data);
    this.eventBus.emit('contest.created', { contestId: contest.id, createdBy });
    return contest;
  }

  /**
   * Reads one contest, cached, and returns it in the same shape `findAll` returns.
   *
   * It used to hand Valkey-read JSON straight back to the controller, which meant two things went
   * wrong for a warm key: the `Date` fields were ISO strings inside an object typed `Contest`, so
   * any mapper touching them threw `TypeError: ...toISOString is not a function`; and the payload
   * carried no `category` name, so the detail page could only show the raw UUID. Both are fixed by
   * reviving the entry to the repository's shape and running it through the one authoritative
   * response mapper.
   */
  async findById(id: string): Promise<ContestResponse> {
    const { value: contest } = await this.cache.getOrSet<Contest>({
      namespace: CONTEST_CACHE_NAMESPACE,
      key: id,
      ttl: CONTEST_CACHE_TTL_SECONDS,
      tags: [CONTESTS_CACHE_TAG],
      // Without this the cached copy is not the row it was loaded from, and the mapper below is
      // the first thing that notices — on every hit, while the first cold read succeeds.
      revive: reviveContestDates,
      load: async () => {
        const loaded = await this.contestsRepository.findContestById(id);
        if (!loaded) {
          throw new NotFoundException('Contest not found');
        }
        return loaded;
      },
    });

    return this.toContestResponse(contest, await this.loadCategoryIndex([contest]));
  }

  async findAll(params: {
    page?: number;
    limit?: number;
    categoryId?: string;
    status?: string;
    search?: string;
  }): Promise<ContestsListResponse> {
    const page = params.page ?? 1;
    const limit = params.limit ?? 20;

    const result = await this.contestsRepository.findAllContests(params);
    const categoriesById = await this.loadCategoryIndex(result.contests);
    const contests = result.contests.map((contest) => this.toContestResponse(contest, categoriesById));

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
    await this.invalidateContestCache(id);

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
    await this.invalidateContestCache(id);

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
    await this.invalidateContestCache(id);

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
    await this.invalidateContestCache(id);

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

  async getSubmissions(
    contestId: string,
    page = 1,
    limit = 20,
  ): Promise<{ submissions: ContestSubmissionResponse[]; total: number; page: number; limit: number }> {
    const result = await this.contestsRepository.findSubmissionsByContest(contestId, page, limit);
    const submissions = result.submissions.map((submission) => this.toSubmissionResponse(submission));

    return {
      submissions,
      total: result.total,
      page,
      limit,
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

  async getVotes(
    contestId: string,
    submissionId: string | undefined,
    page = 1,
    limit = 20,
  ): Promise<{ votes: ContestVoteResponse[]; total: number; page: number; limit: number }> {
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
        page,
        limit,
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
      page: pageNum,
      limit: limitNum,
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
    await this.invalidateContestCache(contestId);

    this.eventBus.emit('winner.selected', { contestId, submissionId, winnerId });
    this.eventBus.emit('contest.completed', { contestId, winnerId });
    return updated;
  }

  async distributePrize(
    contestId: string,
    submissionId: string,
    winnerId: string,
    prizeType: string,
    prizeDescription?: string | null,
  ): Promise<ContestPrize> {
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

  async getPublisherSubmissionsOverview(
    contestId: string,
    publisherId: string,
  ): Promise<PublisherSubmissionOverview[]> {
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

  /**
   * Resolves the category names of a page of contests with a single query.
   *
   * One query per page instead of one per contest is the whole point: a 20-contest list would
   * otherwise issue 20 round trips, and a category name is not worth that. The repository returns
   * nothing for the empty case, so a page with no categories costs no query at all.
   */
  private async loadCategoryIndex(contests: readonly Contest[]): Promise<ContestCategoryIndex> {
    const categoryIds = [
      ...new Set(contests.map((contest) => contest.categoryId).filter((id): id is string => id !== null)),
    ];
    if (categoryIds.length === 0) {
      return new Map<string, string>();
    }
    const summaries: ContestCategorySummary[] = await this.contestsRepository.findCategoriesByIds(categoryIds);
    return new Map(summaries.map((summary) => [summary.id, summary.name]));
  }

  /**
   * Retires the cached copy of one contest.
   *
   * The tag is passed so the key also leaves the index it was written into, and so the generation
   * bump reaches readers that loaded this contest before the change. Every path that mutates a
   * contest routes through here; invalidating on some paths and not others is the same defect as
   * never invalidating (Principle #11).
   */
  private async invalidateContestCache(id: string): Promise<void> {
    await this.cache.invalidateKey(CONTEST_CACHE_NAMESPACE, id, [CONTESTS_CACHE_TAG]);
  }

  private toContestResponse(contest: Contest, categoriesById: ContestCategoryIndex): ContestResponse {
    return {
      id: contest.id,
      title: contest.title,
      description: contest.description,
      categoryId: contest.categoryId,
      category: contest.categoryId === null ? null : (categoriesById.get(contest.categoryId) ?? null),
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
