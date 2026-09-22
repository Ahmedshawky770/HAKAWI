import { Injectable, Logger } from '@nestjs/common';
import { eq, and, desc, sql } from 'drizzle-orm';
import { contestVotes } from '../../../db/schema/contest-votes.schema.js';
import { db } from '../../../db/index.js';
import type {
  IContestVotesRepository,
  ContestVote,
  CreateContestVoteData,
} from '../interfaces/contest-votes-repository.interface.js';

@Injectable()
export class ContestVotesRepository implements IContestVotesRepository {
  private readonly logger = new Logger(ContestVotesRepository.name);

  async findById(id: string): Promise<ContestVote | null> {
    this.logger.debug(`Finding contest vote by id: ${id}`);
    const [vote] = await db
      .select()
      .from(contestVotes)
      .where(eq(contestVotes.id, id))
      .limit(1);
    return vote ?? null;
  }

  async findByContestAndUser(
    contestId: string,
    userId: string,
  ): Promise<ContestVote | null> {
    this.logger.debug(
      `Finding contest vote by contest and user: ${contestId} / ${userId}`,
    );
    const [vote] = await db
      .select()
      .from(contestVotes)
      .where(
        and(
          eq(contestVotes.contestId, contestId),
          eq(contestVotes.userId, userId),
        ),
      )
      .limit(1);
    return vote ?? null;
  }

  async findBySubmissionId(submissionId: string): Promise<ContestVote[]> {
    this.logger.debug(`Finding contest votes by submission: ${submissionId}`);
    return db
      .select()
      .from(contestVotes)
      .where(eq(contestVotes.submissionId, submissionId))
      .orderBy(desc(contestVotes.createdAt));
  }

  async countBySubmission(submissionId: string): Promise<number> {
    this.logger.debug(`Counting votes for submission: ${submissionId}`);
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(contestVotes)
      .where(eq(contestVotes.submissionId, submissionId));
    return Number(count);
  }

  async create(data: CreateContestVoteData): Promise<ContestVote> {
    this.logger.info(
      `Creating contest vote for submission: ${data.submissionId}`,
    );
    const [vote] = await db.insert(contestVotes).values(data).returning();
    return vote;
  }
}
