import { Injectable, Inject, NotFoundException, ConflictException } from '@nestjs/common';
import { eq, and, desc, count } from 'drizzle-orm';

import { db } from '../../../db/index.ts';
import { publisherApplications, publisherWriters, type PublisherApplication, type NewPublisherApplication, type PublisherWriter, type NewPublisherWriter, PUBLISHER_APPLICATION_STATUSES } from '../../../db/schema/publisher.schema.ts';
import { IPublishersRepository, PUBLISHERS_REPOSITORY } from '../interfaces/publishers-repository.interface.ts';

@Injectable()
export class PublishersRepository implements IPublishersRepository {
  async createApplication(data: NewPublisherApplication): Promise<PublisherApplication> {
    const existing = await this.findApplicationByUserId(data.userId);
    if (existing) {
      throw new ConflictException('User already has a publisher application');
    }

    const [application] = await db.insert(publisherApplications).values(data).returning();
    if (!application) {
      throw new NotFoundException('Failed to create publisher application');
    }
    return application;
  }

  async findApplicationByUserId(userId: string): Promise<PublisherApplication | null> {
    const [application] = await db
      .select()
      .from(publisherApplications)
      .where(eq(publisherApplications.userId, userId))
      .limit(1);
    return application ?? null;
  }

  async findApplicationById(id: string): Promise<PublisherApplication | null> {
    const [application] = await db
      .select()
      .from(publisherApplications)
      .where(eq(publisherApplications.id, id))
      .limit(1);
    return application ?? null;
  }

  async findApplications(status?: string, page = 1, limit = 20): Promise<{ applications: PublisherApplication[]; total: number }> {
    const conditions = status ? [eq(publisherApplications.status, status as typeof PUBLISHER_APPLICATION_STATUSES[number])] : [];

    const [applications, totalResult] = await Promise.all([
      db
        .select()
        .from(publisherApplications)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(publisherApplications.createdAt))
        .limit(limit)
        .offset((page - 1) * limit),
      db
        .select({ total: count() })
        .from(publisherApplications)
        .where(conditions.length > 0 ? and(...conditions) : undefined),
    ]);

    return {
      applications,
      total: Number(totalResult[0]?.total ?? 0),
    };
  }

  async updateApplication(id: string, data: Partial<NewPublisherApplication>): Promise<PublisherApplication> {
    const [application] = await db
      .update(publisherApplications)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(publisherApplications.id, id))
      .returning();

    if (!application) {
      throw new NotFoundException('Publisher application not found');
    }
    return application;
  }

  async countApplicationsByStatus(status: string): Promise<number> {
    const [result] = await db
      .select({ total: count() })
      .from(publisherApplications)
      .where(eq(publisherApplications.status, status as typeof PUBLISHER_APPLICATION_STATUSES[number]));
    return Number(result?.total ?? 0);
  }

  async createWriterLink(data: NewPublisherWriter): Promise<PublisherWriter> {
    const existing = await this.findWriterLink(data.publisherId, data.writerId);
    if (existing) {
      throw new ConflictException('Writer is already linked to this publisher');
    }

    const [link] = await db.insert(publisherWriters).values(data).returning();
    if (!link) {
      throw new NotFoundException('Failed to create publisher-writer link');
    }
    return link;
  }

  async findWriterLink(publisherId: string, writerId: string): Promise<PublisherWriter | null> {
    const [link] = await db
      .select()
      .from(publisherWriters)
      .where(and(eq(publisherWriters.publisherId, publisherId), eq(publisherWriters.writerId, writerId)))
      .limit(1);
    return link ?? null;
  }

  async findWritersByPublisher(publisherId: string): Promise<PublisherWriter[]> {
    return db
      .select()
      .from(publisherWriters)
      .where(eq(publisherWriters.publisherId, publisherId))
      .orderBy(desc(publisherWriters.createdAt));
  }

  async findPublishersByWriter(writerId: string): Promise<PublisherWriter[]> {
    return db
      .select()
      .from(publisherWriters)
      .where(eq(publisherWriters.writerId, writerId))
      .orderBy(desc(publisherWriters.createdAt));
  }

  async updateWriterLink(publisherId: string, writerId: string, data: Partial<NewPublisherWriter>): Promise<PublisherWriter> {
    const [link] = await db
      .update(publisherWriters)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(publisherWriters.publisherId, publisherId), eq(publisherWriters.writerId, writerId)))
      .returning();

    if (!link) {
      throw new NotFoundException('Publisher-writer link not found');
    }
    return link;
  }

  async deleteWriterLink(publisherId: string, writerId: string): Promise<void> {
    await db
      .delete(publisherWriters)
      .where(and(eq(publisherWriters.publisherId, publisherId), eq(publisherWriters.writerId, writerId)));
  }
}