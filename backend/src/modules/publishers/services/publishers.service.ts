import { Injectable, NotFoundException, ConflictException, ForbiddenException, Inject, Optional } from '@nestjs/common';

import { EventValidatorService } from '../../../common/events/event-validator.service.ts';
import { WinstonLoggerService } from '../../../common/services/winston-logger.service.ts';
import { TransactionalEmailService } from '../../../common/email/transactional-email.service.ts';
import { USERS_REPOSITORY } from '../../../common/users/users-repository.interface.ts';
import type { IUsersRepository } from '../../../common/users/users-repository.interface.ts';
import { AccountType } from '../../../common/constants/roles.ts';
import type { IPublishersRepository } from '../interfaces/publishers-repository.interface.ts';
import { PUBLISHERS_REPOSITORY } from '../interfaces/publishers-repository.interface.ts';
import type { PublisherApplication, PublisherWriter, NewPublisherApplication, NewPublisherWriter } from '../../../db/schema/publisher.schema.ts';
import { CreatePublisherApplicationDto, ReviewPublisherApplicationDto, CreatePublisherWriterDto, UpdatePublisherWriterDto } from '../dto/publishers.dto.ts';
import { PUBLISHER_APPLICATION_STATUSES } from '../../../db/schema/publisher.schema.ts';

@Injectable()
export class PublishersService {
  constructor(
    @Inject(PUBLISHERS_REPOSITORY) private readonly publishersRepository: IPublishersRepository,
    @Inject(EventValidatorService) private readonly eventBus: EventValidatorService,
    @Inject(WinstonLoggerService) private readonly logger: WinstonLoggerService,
    @Optional() @Inject(TransactionalEmailService) private readonly emailService?: TransactionalEmailService,
    @Optional() @Inject(USERS_REPOSITORY) private readonly usersRepository?: IUsersRepository,
  ) {}

  // Publisher Applications

  async submitApplication(userId: string, dto: CreatePublisherApplicationDto): Promise<PublisherApplication> {
    const existing = await this.publishersRepository.findApplicationByUserId(userId);
    if (existing) {
      throw new ConflictException('You already have a publisher application');
    }

    const data: NewPublisherApplication = {
      userId,
      companyName: dto.companyName,
      companyWebsite: dto.companyWebsite ?? null,
      companyAddress: dto.companyAddress ?? null,
      taxId: dto.taxId ?? null,
      contactName: dto.contactName,
      contactEmail: dto.contactEmail,
      contactPhone: dto.contactPhone ?? null,
      description: dto.description,
      status: 'pending',
    };

    const application = await this.publishersRepository.createApplication(data);

    if (this.emailService) {
      const user = this.usersRepository ? await this.usersRepository.findById(userId) : null;
      const to = application.contactEmail || user?.email;
      if (to) {
        void this.emailService.send({
          to,
          subject: 'Publisher application received',
          text: `Your publisher application for ${application.companyName} has been received and is pending review.`,
        });
      }
    }

    await this.eventBus.emit('publisher.application.submitted', {
      applicationId: application.id,
      userId,
      companyName: application.companyName,
    });

    this.logger.info(`Publisher application submitted: ${application.id} by user ${userId}`, 'PublishersService');

    return application;
  }

  async getMyApplication(userId: string): Promise<PublisherApplication | null> {
    return this.publishersRepository.findApplicationByUserId(userId);
  }

  async getApplicationById(id: string): Promise<PublisherApplication> {
    const application = await this.publishersRepository.findApplicationById(id);
    if (!application) {
      throw new NotFoundException('Publisher application not found');
    }
    return application;
  }

  async listApplications(status?: string, page = 1, limit = 20): Promise<{ applications: PublisherApplication[]; total: number }> {
    return this.publishersRepository.findApplications(status, page, limit);
  }

  async reviewApplication(adminId: string, id: string, dto: ReviewPublisherApplicationDto): Promise<PublisherApplication> {
    const application = await this.getApplicationById(id);

    if (application.status !== 'pending') {
      throw new ConflictException(`Application is already ${application.status}`);
    }

    const newStatus = dto.status;
    const updateData: Partial<NewPublisherApplication> = {
      status: newStatus,
      reviewedBy: adminId,
      reviewedAt: new Date(),
    };

    if (newStatus === 'rejected') {
      if (!dto.rejectionReason) {
        throw new ConflictException('Rejection reason is required when rejecting an application');
      }
      updateData.rejectionReason = dto.rejectionReason;
    }

    const updated = await this.publishersRepository.updateApplication(id, updateData);

    if (newStatus === 'approved') {
      await this.approveApplication(application, adminId);
      if (this.emailService) {
        const user = this.usersRepository ? await this.usersRepository.findById(application.userId) : null;
        const to = user?.email ?? application.contactEmail;
        if (to) {
          void this.emailService.send({
            to,
            subject: 'Publisher application approved',
            text: `Your publisher application for ${application.companyName} has been approved. You can now create and manage contests.`,
          });
        }
      }
    } else if (newStatus === 'rejected') {
      if (this.emailService) {
        const user = this.usersRepository ? await this.usersRepository.findById(application.userId) : null;
        const to = user?.email ?? application.contactEmail;
        if (to) {
          void this.emailService.send({
            to,
            subject: 'Publisher application rejected',
            text: `Your publisher application for ${application.companyName} was not approved.${dto.rejectionReason ? ` Reason: ${dto.rejectionReason}` : ''}`,
          });
        }
      }
    }

    await this.eventBus.emit('publisher.application.reviewed', {
      applicationId: updated.id,
      userId: application.userId,
      status: newStatus,
      reviewedBy: adminId,
    });

    this.logger.info(`Publisher application ${newStatus}: ${id} by admin ${adminId}`, 'PublishersService');

    return updated;
  }

  private async approveApplication(application: PublisherApplication, adminId: string): Promise<void> {
    if (this.usersRepository) {
      await this.usersRepository.update(application.userId, { accountType: AccountType.PUBLISHER });
    }

    await this.eventBus.emit('user.upgraded', {
      userId: application.userId,
      oldType: 'reader',
      newType: AccountType.PUBLISHER,
    });

    this.logger.info(`User upgraded to publisher: ${application.userId} via application ${application.id}`, 'PublishersService');
  }

  // Publisher Writers

  async addWriter(publisherId: string, dto: CreatePublisherWriterDto): Promise<PublisherWriter> {
    const publisher = await this.getApplicationById(publisherId);
    if (publisher.userId !== publisherId) {
      throw new ForbiddenException('Only the publisher can add writers');
    }
    if (publisher.status !== 'approved') {
      throw new ForbiddenException('Publisher application must be approved first');
    }

    const data: NewPublisherWriter = {
      publisherId,
      writerId: dto.writerId,
      commissionRate: dto.commissionRate ?? 15,
      status: 'active',
      notes: dto.notes ?? null,
    };

    const link = await this.publishersRepository.createWriterLink(data);

    await this.eventBus.emit('publisher.writer.added', {
      linkId: link.id,
      publisherId,
      writerId: dto.writerId,
      commissionRate: link.commissionRate,
    });

    this.logger.info(`Writer ${dto.writerId} added to publisher ${publisherId}`, 'PublishersService');

    return link;
  }

  async getMyWriters(publisherId: string): Promise<PublisherWriter[]> {
    return this.publishersRepository.findWritersByPublisher(publisherId);
  }

  async getWriterLink(publisherId: string, writerId: string): Promise<PublisherWriter> {
    const link = await this.publishersRepository.findWriterLink(publisherId, writerId);
    if (!link) {
      throw new NotFoundException('Writer link not found');
    }
    return link;
  }

  async updateWriterLink(publisherId: string, writerId: string, dto: UpdatePublisherWriterDto): Promise<PublisherWriter> {
    await this.getWriterLink(publisherId, writerId);

    const updated = await this.publishersRepository.updateWriterLink(publisherId, writerId, dto as Partial<NewPublisherWriter>);

    await this.eventBus.emit('publisher.writer.updated', {
      publisherId,
      writerId,
      updatedFields: Object.keys(dto),
    });

    return updated;
  }

  async removeWriter(publisherId: string, writerId: string): Promise<void> {
    await this.getWriterLink(publisherId, writerId);

    await this.publishersRepository.deleteWriterLink(publisherId, writerId);

    await this.eventBus.emit('publisher.writer.removed', {
      publisherId,
      writerId,
    });

    this.logger.info(`Writer ${writerId} removed from publisher ${publisherId}`, 'PublishersService');
  }

  async getStats(): Promise<{ pendingApplications: number; approvedApplications: number; rejectedApplications: number }> {
    const [pending, approved, rejected] = await Promise.all([
      this.publishersRepository.countApplicationsByStatus('pending'),
      this.publishersRepository.countApplicationsByStatus('approved'),
      this.publishersRepository.countApplicationsByStatus('rejected'),
    ]);

    return { pendingApplications: pending, approvedApplications: approved, rejectedApplications: rejected };
  }
}