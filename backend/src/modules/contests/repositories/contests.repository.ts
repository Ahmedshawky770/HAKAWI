import { Injectable, Inject } from '@nestjs/common';
import { eq, and, desc, like, count, sql } from 'drizzle-orm';

import { WinstonLoggerService } from '../../../common/services/winston-logger.service.ts';
import type {
  IContestsRepository,
  Contest,
  CreateContestInput,
  UpdateContestInput,
  ContestSubmission,
  ContestVote,
  ContestPrize,
  CreateSubmissionInput,
  CastVoteInput,
  DistributePrizeInput,
} from '../interfaces/contests-repository.interface.ts';
import {
  contests,
  contestSubmissions,
  contestVotes,
  contestPrizes,
} from '../../../db/schema/contests.schema.ts';
import { db } from '../../../db/index.ts';

@Injectable()
export class ContestsRepository implements IContestsRepository {
  constructor(@Inject(WinstonLoggerService) private readonly logger: WinstonLoggerService) {}

  async findContestById(id: string): Promise<Contest | null> {
    this.logger.debug(`Finding contest by id: ${id}`);
    try {
      const [contest] = await db.select().from(contests).where(eq(contests.id, id)).limit(1);
      return contest ?? null;
    } catch (error) {
      const code = (error as { code?: string } | null)?.code;
      if (code === '22P02') {
        return null;
      }
      throw error;
    }
  }

  async findAllContests(params: {
    page?: number;
    limit?: number;
    categoryId?: string;
    status?: string;
    search?: string;
  }): Promise<{ contests: Contest[]; total: number }> {
    this.logger.debug('Finding all contests');
    const page = params.page ?? 1;
    const limit = params.limit ?? 20;
    const offset = (page - 1) * limit;

    const conditions: (ReturnType<typeof eq> | ReturnType<typeof and> | ReturnType<typeof like>)[] = [];

    if (params.categoryId) {
      conditions.push(eq(contests.categoryId, params.categoryId));
    }
    if (params.status) {
      conditions.push(eq(contests.status, params.status));
    }
    if (params.search) {
      conditions.push(like(contests.title, `%${params.search}%`));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [contestsResult, [{ total }]] = await Promise.all([
      db.select().from(contests).where(whereClause).orderBy(desc(contests.createdAt)).limit(limit).offset(offset),
      db.select({ total: count() }).from(contests).where(whereClause),
    ]);

    return { contests: contestsResult, total: Number(total) };
  }

  async createContest(data: CreateContestInput & { createdBy: string; status: string }): Promise<Contest> {
    this.logger.info(`Creating contest with title: ${data.title}`);
    const [contest] = await db.insert(contests).values(data).returning();
    return contest;
  }

  async updateContest(id: string, data: UpdateContestInput): Promise<Contest> {
    this.logger.debug(`Updating contest: ${id}`);
    const [contest] = await db.update(contests).set({ ...data, updatedAt: new Date() }).where(eq(contests.id, id)).returning();
    return contest;
  }

  async findSubmissionById(id: string): Promise<ContestSubmission | null> {
    this.logger.debug(`Finding submission by id: ${id}`);
    try {
      const [submission] = await db.select().from(contestSubmissions).where(eq(contestSubmissions.id, id)).limit(1);
      return submission ?? null;
    } catch (error) {
      const code = (error as { code?: string } | null)?.code;
      if (code === '22P02') {
        return null;
      }
      throw error;
    }
  }

  async findSubmissionsByContest(contestId: string, page: number, limit: number): Promise<{ submissions: ContestSubmission[]; total: number }> {
    this.logger.debug(`Finding submissions for contest: ${contestId}`);
    const offset = (page - 1) * limit;

    const [submissionsList, [{ total }]] = await Promise.all([
      db.select().from(contestSubmissions).where(eq(contestSubmissions.contestId, contestId)).orderBy(desc(contestSubmissions.submittedAt)).limit(limit).offset(offset),
      db.select({ total: sql<number>`count(*)` }).from(contestSubmissions).where(eq(contestSubmissions.contestId, contestId)),
    ]);

    return { submissions: submissionsList, total: Number(total) };
  }

  async findSubmissionByContestAndAuthor(contestId: string, authorId: string): Promise<ContestSubmission | null> {
    this.logger.debug(`Finding submission by contest ${contestId} and author ${authorId}`);
    const [submission] = await db
      .select()
      .from(contestSubmissions)
      .where(and(eq(contestSubmissions.contestId, contestId), eq(contestSubmissions.authorId, authorId)))
      .limit(1);
    return submission ?? null;
  }

  async createSubmission(data: CreateSubmissionInput): Promise<ContestSubmission> {
    this.logger.info(`Creating submission for contest: ${data.contestId} by author: ${data.authorId}`);
    const [submission] = await db.insert(contestSubmissions).values(data).returning();
    return submission;
  }

  async reviewSubmission(id: string, status: string, reviewedBy: string): Promise<ContestSubmission> {
    this.logger.debug(`Reviewing submission: ${id} with status: ${status}`);
    const [submission] = await db
      .update(contestSubmissions)
      .set({ status, reviewedAt: new Date(), reviewedBy })
      .where(eq(contestSubmissions.id, id))
      .returning();
    return submission;
  }

  async findVoteById(id: string): Promise<ContestVote | null> {
    this.logger.debug(`Finding vote by id: ${id}`);
    try {
      const [vote] = await db.select().from(contestVotes).where(eq(contestVotes.id, id)).limit(1);
      return vote ?? null;
    } catch (error) {
      const code = (error as { code?: string } | null)?.code;
      if (code === '22P02') {
        return null;
      }
      throw error;
    }
  }

  async findVoteByUserContestSubmission(contestId: string, submissionId: string, userId: string): Promise<ContestVote | null> {
    this.logger.debug(`Finding vote by user ${userId} for submission ${submissionId} in contest ${contestId}`);
    const [vote] = await db
      .select()
      .from(contestVotes)
      .where(and(eq(contestVotes.contestId, contestId), eq(contestVotes.submissionId, submissionId), eq(contestVotes.userId, userId)))
      .limit(1);
    return vote ?? null;
  }

  async countVotesBySubmission(submissionId: string): Promise<number> {
    this.logger.debug(`Counting votes for submission: ${submissionId}`);
    const [{ total }] = await db.select({ total: sql<number>`count(*)` }).from(contestVotes).where(eq(contestVotes.submissionId, submissionId));
    return Number(total);
  }

  async castVote(data: CastVoteInput): Promise<ContestVote> {
    this.logger.info(`Casting vote for submission ${data.submissionId} in contest ${data.contestId} by user ${data.userId}`);
    const [vote] = await db.insert(contestVotes).values(data).returning();
    return vote;
  }

  async findPrizeById(id: string): Promise<ContestPrize | null> {
    this.logger.debug(`Finding prize by id: ${id}`);
    try {
      const [prize] = await db.select().from(contestPrizes).where(eq(contestPrizes.id, id)).limit(1);
      return prize ?? null;
    } catch (error) {
      const code = (error as { code?: string } | null)?.code;
      if (code === '22P02') {
        return null;
      }
      throw error;
    }
  }

  async createPrize(data: DistributePrizeInput): Promise<ContestPrize> {
    this.logger.info(`Creating prize for contest ${data.contestId}, winner ${data.winnerId}, type: ${data.prizeType}`);
    const [prize] = await db.insert(contestPrizes).values(data).returning();
    return prize;
  }

  async findPrizesByContest(contestId: string): Promise<ContestPrize[]> {
    this.logger.debug(`Finding prizes for contest: ${contestId}`);
    const prizes = await db.select().from(contestPrizes).where(eq(contestPrizes.contestId, contestId)).orderBy(desc(contestPrizes.createdAt));
    return prizes;
  }

  async findWinningSubmission(contestId: string): Promise<ContestSubmission | null> {
    this.logger.debug(`Finding winning submission for contest: ${contestId}`);

    const [result] = await db
      .select({
        id: contestSubmissions.id,
        contestId: contestSubmissions.contestId,
        storyId: contestSubmissions.storyId,
        authorId: contestSubmissions.authorId,
        status: contestSubmissions.status,
        submittedAt: contestSubmissions.submittedAt,
        reviewedAt: contestSubmissions.reviewedAt,
        reviewedBy: contestSubmissions.reviewedBy,
      })
      .from(contestSubmissions)
      .leftJoin(contestVotes, eq(contestVotes.submissionId, contestSubmissions.id))
      .where(eq(contestSubmissions.contestId, contestId))
      .groupBy(
        contestSubmissions.id,
        contestSubmissions.contestId,
        contestSubmissions.storyId,
        contestSubmissions.authorId,
        contestSubmissions.status,
        contestSubmissions.submittedAt,
        contestSubmissions.reviewedAt,
        contestSubmissions.reviewedBy,
      )
      .orderBy(sql`count(${contestVotes.id}) DESC`)
      .limit(1);

    return result ?? null;
  }
}
