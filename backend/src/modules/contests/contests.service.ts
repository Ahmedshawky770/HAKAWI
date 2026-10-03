import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
  Inject,
} from '@nestjs/common';

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

/**
 * WHY ONE HELPER FOR FIVE ROUTES.
 *
 * The lifecycle routes — `update`, `start`, `cancel`, `complete` — each compared
 * `contest.createdBy !== userId` inline, and four mutating routes had no such comparison at all:
 *
 *   selectWinner(contestId, submissionId, winnerId)   the caller identity was NOT A PARAMETER
 *   distributePrize(contestId, submissionId, ...)     likewise
 *   approveSubmission(...)  `userId` was recorded as the reviewer, never checked as the owner
 *   rejectSubmission(...)   checked nothing at all — not the contest, not the status, not the owner
 *
 * So any authenticated account could pick the winner of a contest it does not own, mint a prize for
 * it, and approve or reject any submission in it. `rejectSubmission` was the worst of them: it did
 * not even confirm the contest existed.
 *
 * Five inline copies of one inequality is how the last four went missing, so the check is one method
 * now and every mutating route calls it. The lifecycle messages stay specific — "start" reads better
 * than a generic verb — so the action is a parameter rather than being derived.
 */
function assertContestOwnership(
  contest: { createdBy: string },
  userId: string,
  action:
    | 'update'
    | 'start'
    | 'cancel'
    | 'complete'
    | 'select a winner for'
    | 'distribute a prize for'
    | 'review submissions for',
): void {
  if (contest.createdBy !== userId) {
    throw new ForbiddenException(`You can only ${action} your own contests`);
  }
}

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

    assertContestOwnership(existing, userId, 'update');

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

    assertContestOwnership(contest, userId, 'start');

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

    assertContestOwnership(contest, userId, 'cancel');

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

    assertContestOwnership(contest, userId, 'complete');

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

    assertContestOwnership(contest, userId, 'review submissions for');

    if (contest.status !== 'active' && contest.status !== 'voting') {
      throw new ForbiddenException('Contest is not in a state to approve submissions');
    }

    if (submission.contestId !== contestId) {
      // The contest was checked and the submission was checked, but nothing connected them: a
      // submission id from contest A approved through contest B's route recorded the reviewer
      // against the wrong contest and emitted `submission.approved` with B's id.
      throw new NotFoundException('Submission not found in this contest');
    }

    const updated = await this.contestsRepository.reviewSubmission(submissionId, 'approved', userId);
    this.eventBus.emit('submission.approved', { submissionId, contestId, authorId: submission.authorId });
    return updated;
  }

  /**
   * IT USED TO CHECK NOTHING BEYOND THE SUBMISSION EXISTING.
   *
   * No contest lookup, so the route would approve a submission against a contest id that does not
   * exist; no ownership check, so any authenticated account could reject a submission in a contest it
   * does not run; and no status check, so a submission could be rejected after the contest had
   * completed and a winner had been selected. `approveSubmission` had the contest and the status
   * checks but not the ownership one — so the pair was neither safe nor symmetrical.
   */
  async rejectSubmission(submissionId: string, contestId: string, userId: string): Promise<ContestSubmission> {
    const submission = await this.contestsRepository.findSubmissionById(submissionId);
    if (!submission) {
      throw new NotFoundException('Submission not found');
    }

    const contest = await this.contestsRepository.findContestById(contestId);
    if (!contest) {
      throw new NotFoundException('Contest not found');
    }

    assertContestOwnership(contest, userId, 'review submissions for');

    if (contest.status !== 'active' && contest.status !== 'voting') {
      throw new ForbiddenException('Contest is not in a state to reject submissions');
    }

    if (submission.contestId !== contestId) {
      throw new NotFoundException('Submission not found in this contest');
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

    // WHY A CLOCK CHECK AND NOT JUST A STATUS CHECK. `status === 'voting'` is set when the contest is
    // started and never cleared by the passage of time, so `end_date` passing does not close voting:
    // it stayed open indefinitely until somebody manually moved the contest on. `submitEntry` below
    // enforces `end_date`, so submissions closed on time while votes did not — which is the worse half
    // to leave open, because a vote changes a winner.
    //
    // One clock is used deliberately: `new Date()` here and `contest.endDate` in the same comparison,
    // rather than the row's own `updatedAt` or a second "now" from the repository.
    if (new Date() > contest.endDate) {
      throw new ForbiddenException('Voting has closed for this contest');
    }

    const submission = await this.contestsRepository.findSubmissionById(submissionId);
    if (!submission || submission.contestId !== contestId) {
      // Nothing connected the submission to the contest, so a submission id from another contest
      // could be voted on through this route — the vote landed against this contest while pointing at
      // somebody else's story.
      throw new NotFoundException('Submission not found in this contest');
    }

    if (submission.authorId === userId) {
      // Self-voting. `contest_votes_unique_idx` is on (contest, submission, user), which stops a
      // double vote but not one vote for your own entry — so a contest with two entrants could be won
      // by a single person casting both votes.
      throw new ForbiddenException('You cannot vote for your own submission');
    }

    if (submission.status !== 'approved') {
      // A rejected submission is still in the table and still has an id, so nothing stopped a vote for
      // something the organiser removed from the contest.
      throw new ForbiddenException('Only approved submissions can be voted on');
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
      const mapped = votes.map((vote) => this.toPublicVoteResponse(vote));

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
      votes: votesPage.map((vote) => this.toPublicVoteResponse(vote)),
      total: Number(total),
      page: pageNum,
      limit: limitNum,
    };
  }

  /**
   * `userId` WAS NOT A PARAMETER, so there was no caller to check.
   *
   * The route passed the winner straight from the request body and the service decided nothing about
   * who was asking. Any authenticated account could therefore end a contest it does not own, pick
   * its own submission as the winner (the `submission.authorId === winnerId` check that does exist
   * only proves the winner wrote the submission — it says nothing about who selected them), and emit
   * `winner.selected` and `contest.completed` for it.
   */
  async selectWinner(contestId: string, submissionId: string, winnerId: string, userId: string): Promise<Contest> {
    const contest = await this.contestsRepository.findContestById(contestId);
    if (!contest) {
      throw new NotFoundException('Contest not found');
    }

    assertContestOwnership(contest, userId, 'select a winner for');

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
    prizeDescription: string | null | undefined,
    userId: string,
    amount?: number | null,
    currency?: string | null,
  ): Promise<ContestPrize> {
    const contest = await this.contestsRepository.findContestById(contestId);
    if (!contest) {
      throw new NotFoundException('Contest not found');
    }

    // Like `selectWinner`, the caller identity was not a parameter. A prize is a disbursement against
    // the contest's own budget, so "who authorised this" is the first question and it was unasked.
    assertContestOwnership(contest, userId, 'distribute a prize for');

    if (contest.status !== 'completed') {
      throw new ForbiddenException('Contest must be completed before distributing prizes');
    }

    // `amount` and `currency` travel together or not at all. The schema carries the same rule as a
    // CHECK, so a half-recorded prize is refused by the database rather than being written and
    // discovered during a budget reconciliation.
    if ((amount === undefined || amount === null) !== (currency === undefined || currency === null)) {
      throw new BadRequestException('Prize amount and currency must be provided together');
    }

    const prize = await this.contestsRepository.createPrize({
      contestId,
      submissionId,
      winnerId,
      prizeType,
      prizeDescription: prizeDescription ?? null,
      amount: amount ?? null,
      currency: currency ?? null,
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

  /**
   * WHY THERE IS NO `userId` HERE.
   *
   * `GET /contests/:id/votes` is `@Public()` — anonymous — and returned every vote's `userId`. So
   * anyone could enumerate which accounts voted for which submission in any contest, with no account
   * and no relationship to it. On a platform where accounts are people, that is a roster of who
   * engaged with what, published to anyone who asks.
   *
   * A public vote tally is reasonable product behaviour; publishing the identities behind it is not,
   * so the count stays and the identity does not. Nothing consumed it: the frontend has no caller for
   * this route at all, so the field was carrying risk and no reader.
   *
   * An organizer who needs the voters gets the publisher dashboard, which is authenticated and
   * already scopes itself to `contest.createdBy`.
   */
  private toPublicVoteResponse(vote: {
    id: string;
    contestId: string;
    submissionId: string;
    createdAt: Date;
  }): ContestVoteResponse {
    return {
      id: vote.id,
      contestId: vote.contestId,
      submissionId: vote.submissionId,
      createdAt: vote.createdAt.toISOString(),
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
      amount: prize.amount,
      currency: prize.currency,
      distributedAt: prize.distributedAt?.toISOString() ?? null,
      createdAt: prize.createdAt.toISOString(),
    };
  }
}
