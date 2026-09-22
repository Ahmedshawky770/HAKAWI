import { Injectable, Logger } from '@nestjs/common';
import { eq, and, desc } from 'drizzle-orm';
import { contestBadges } from '../../../db/schema/contest-badges.schema.js';
import { db } from '../../../db/index.js';
import type {
  IContestBadgesRepository,
  ContestBadge,
  CreateContestBadgeData,
} from '../interfaces/contest-badges-repository.interface.js';

@Injectable()
export class ContestBadgesRepository implements IContestBadgesRepository {
  private readonly logger = new Logger(ContestBadgesRepository.name);

  async findById(id: string): Promise<ContestBadge | null> {
    this.logger.debug(`Finding contest badge by id: ${id}`);
    const [badge] = await db
      .select()
      .from(contestBadges)
      .where(eq(contestBadges.id, id))
      .limit(1);
    return badge ?? null;
  }

  async findByContestId(contestId: string): Promise<ContestBadge[]> {
    this.logger.debug(`Finding contest badges by contest: ${contestId}`);
    return db
      .select()
      .from(contestBadges)
      .where(eq(contestBadges.contestId, contestId))
      .orderBy(desc(contestBadges.awardedAt));
  }

  async findByWinnerId(winnerId: string): Promise<ContestBadge[]> {
    this.logger.debug(`Finding contest badges by winner: ${winnerId}`);
    return db
      .select()
      .from(contestBadges)
      .where(eq(contestBadges.winnerId, winnerId))
      .orderBy(desc(contestBadges.awardedAt));
  }

  async create(data: CreateContestBadgeData): Promise<ContestBadge> {
    this.logger.log(`Creating contest badge for winner: ${data.winnerId}`);
    const [badge] = await db.insert(contestBadges).values(data).returning();
    return badge;
  }
}
