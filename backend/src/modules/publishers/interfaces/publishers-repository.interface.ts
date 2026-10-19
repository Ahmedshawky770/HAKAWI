import type { PublisherApplication, NewPublisherApplication, PublisherWriter, NewPublisherWriter } from '../../../db/schema/publisher.schema.ts';

export const PUBLISHERS_REPOSITORY = 'PUBLISHERS_REPOSITORY';

export interface IPublishersRepository {
  // Publisher Applications
  createApplication(data: NewPublisherApplication): Promise<PublisherApplication>;
  findApplicationByUserId(userId: string): Promise<PublisherApplication | null>;
  findApplicationById(id: string): Promise<PublisherApplication | null>;
  findApplications(status?: string, page?: number, limit?: number): Promise<{ applications: PublisherApplication[]; total: number }>;
  updateApplication(id: string, data: Partial<NewPublisherApplication>): Promise<PublisherApplication>;
  countApplicationsByStatus(status: string): Promise<number>;

  // Publisher Writers
  createWriterLink(data: NewPublisherWriter): Promise<PublisherWriter>;
  findWriterLink(publisherId: string, writerId: string): Promise<PublisherWriter | null>;
  findWritersByPublisher(publisherId: string): Promise<PublisherWriter[]>;
  findPublishersByWriter(writerId: string): Promise<PublisherWriter[]>;
  updateWriterLink(publisherId: string, writerId: string, data: Partial<NewPublisherWriter>): Promise<PublisherWriter>;
  deleteWriterLink(publisherId: string, writerId: string): Promise<void>;
}