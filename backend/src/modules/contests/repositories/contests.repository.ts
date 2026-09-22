import { Injectable, Logger } from '@nestjs/common';
import { eq, and, desc, asc, sql } from 'drizzle-orm';
import { contests } from '../../../db/schema/contests.schema.js';
import { db } from '../../../db/index.js';
import type {
  IContestsRepository,
  Contest,
  CreateContestData,
  UpdateContestData,
  ContestFilters,
  ContestStatus,
  PrizeType,
} from '../interfaces/contests-repository.interface.js';

@Injectable()
export class ContestsRepository implements IContestsRepository {
  private readonly logger = new Logger(ContestsRepository.name);

  private castContest = (contest: Record<string, unknown>): Contest => ({
    ...contest,
    status: contest.status as ContestStatus,
    prizeType: contest.prizeType as PrizeType,
    participantType: contest.participantType as string,
    category: contest.category as string | null,
    rules: contest.rules as string | null,
  } as Contest);

  async findById(id: string): Promise<Contest | null> {
    this.logger.debug(`Finding contest by id: ${id}`);
    const [contest] = await db
      .select()
      .from(contests)
      .where(eq(contests.id, id))
      .limit(1);
    return contest ? this.castContest(contest) : null;
  }

  async findByPublisherId(publisherId: string): Promise<Contest[]> {
    this.logger.debug(`Finding contests by publisher: ${publisherId}`);
    const contestList = await db
      .select()
      .from(contests)
      .where(eq(contests.publisherId, publisherId))
      .orderBy(desc(contests.createdAt));
    return contestList.map((c) => this.castContest(c));
  }

  async findPublished(filters: ContestFilters): Promise<Contest[]> {
    this.logger.debug('Finding published contests with filters');
    const conditions = [eq(contests.status, 'published')];

    if (filters.category) {
      conditions.push(eq(contests.category, filters.category));
    }
    if (filters.participantType) {
      conditions.push(eq(contests.participantType, filters.participantType));
    }

    let query = db
      .select()
      .from(contests)
      .where(and(...conditions))
      .orderBy(desc(contests.createdAt));

    const offset = ((filters.page ?? 1) - 1) * (filters.limit ?? 20);
    const contestList = await query.limit(filters.limit ?? 20).offset(offset);
    return contestList.map((c) => this.castContest(c));
  }

  async create(data: CreateContestData): Promise<Contest> {
    this.logger.info(`Creating contest: ${data.title}`);
    const [contest] = await db.insert(contests).values(data).returning();
    return this.castContest(contest);
  }

  async update(id: string, data: Partial<UpdateContestData>): Promise<Contest> {
    this.logger.debug(`Updating contest: ${id}`);
    const [contest] = await db
      .update(contests)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(contests.id, id))
      .returning();
    return this.castContest(contest);
  }

  async delete(id: string): Promise<void> {
    this.logger.debug(`Deleting contest: ${id}`);
    await db.delete(contests).where(eq(contests.id, id));
  }

  async count(filters: ContestFilters): Promise<number> {
    this.logger.debug('Counting contests with filters');
    const conditions = [eq(contests.status, 'published')];

    if (filters.category) {
      conditions.push(eq(contests.category, filters.category));
    }
    if (filters.participantType) {
      conditions.push(eq(contests.participantType, filters.participantType));
    }

    const [{ count }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(contests)
      .where(and(...conditions));
    return Number(count);
  }
}
