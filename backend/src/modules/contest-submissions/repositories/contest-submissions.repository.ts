import { Injectable, Logger } from '@nestjs/common';
import { eq, and, desc, asc, sql } from 'drizzle-orm';
import { contestSubmissions } from '../../../db/schema/contest-submissions.schema.js';
import { db } from '../../../db/index.js';
import type {
  IContestSubmissionsRepository,
  ContestSubmission,
  CreateContestSubmissionData,
  UpdateContestSubmissionData,
  SubmissionStatus,
} from '../interfaces/contest-submissions-repository.interface.js';

@Injectable()
export class ContestSubmissionsRepository implements IContestSubmissionsRepository {
  private readonly logger = new Logger(ContestSubmissionsRepository.name);

  private castSubmission = (
    submission: unknown,
  ): ContestSubmission => {
    const cast = submission as ContestSubmission & { status?: string };
    return {
      ...cast,
      status: cast.status as SubmissionStatus,
    };
  };

  async findById(id: string): Promise<ContestSubmission | null> {
    this.logger.debug(`Finding contest submission by id: ${id}`);
    const [submission] = await db
      .select()
      .from(contestSubmissions)
      .where(eq(contestSubmissions.id, id))
      .limit(1);
    return submission ? this.castSubmission(submission) : null;
  }

  async findByContestId(contestId: string): Promise<ContestSubmission[]> {
    this.logger.debug(`Finding submissions by contest: ${contestId}`);
    const submissions = await db
      .select()
      .from(contestSubmissions)
      .where(eq(contestSubmissions.contestId, contestId))
      .orderBy(desc(contestSubmissions.submittedAt));
    return submissions.map((s) => this.castSubmission(s));
  }

  async findByAuthorId(authorId: string): Promise<ContestSubmission[]> {
    this.logger.debug(`Finding submissions by author: ${authorId}`);
    const submissions = await db
      .select()
      .from(contestSubmissions)
      .where(eq(contestSubmissions.authorId, authorId))
      .orderBy(desc(contestSubmissions.submittedAt));
    return submissions.map((s) => this.castSubmission(s));
  }

  async findByContestAndAuthor(
    contestId: string,
    authorId: string,
  ): Promise<ContestSubmission | null> {
    this.logger.debug(
      `Finding submission by contest: ${contestId}, author: ${authorId}`,
    );
    const [submission] = await db
      .select()
      .from(contestSubmissions)
      .where(
        and(
          eq(contestSubmissions.contestId, contestId),
          eq(contestSubmissions.authorId, authorId),
        ),
      )
      .limit(1);
    return submission ? this.castSubmission(submission) : null;
  }

  async create(data: CreateContestSubmissionData): Promise<ContestSubmission> {
    this.logger.log(
      `Creating contest submission for contest: ${data.contestId}`,
    );
    const [submission] = await db
      .insert(contestSubmissions)
      .values(data)
      .returning();
    return this.castSubmission(submission);
  }

  async update(
    id: string,
    data: Partial<UpdateContestSubmissionData>,
  ): Promise<ContestSubmission> {
    this.logger.debug(`Updating contest submission: ${id}`);
    const [submission] = await db
      .update(contestSubmissions)
      .set(data)
      .where(eq(contestSubmissions.id, id))
      .returning();
    return this.castSubmission(submission);
  }

  async countByContest(contestId: string): Promise<number> {
    this.logger.debug(`Counting submissions for contest: ${contestId}`);
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(contestSubmissions)
      .where(eq(contestSubmissions.contestId, contestId));
    return Number(count);
  }
}
