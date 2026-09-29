import { Injectable, Inject } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

import { WinstonLoggerService } from '../../../common/services/winston-logger.service.ts';
import type { NotificationCreatedEvent } from '../../../common/events/social.events.ts';
import type { ContestCreatedEvent, WinnerSelectedEvent, PrizeDistributedEvent } from '../../../common/events/contests.events.ts';
import type { INotificationsRepository } from '../interfaces/notifications-repository.interface.ts';
import { NOTIFICATIONS_REPOSITORY } from '../interfaces/notifications-repository.interface.ts';

@Injectable()
export class NotificationsEventHandler {
  constructor(
    @Inject(NOTIFICATIONS_REPOSITORY) private readonly notificationsRepository: INotificationsRepository,
    @Inject(WinstonLoggerService) private readonly logger: WinstonLoggerService,
  ) {}

  @OnEvent('notification.created')
  async handleNotificationCreated(event: NotificationCreatedEvent): Promise<void> {
    this.logger.info(`Notification ${event.notificationId} created for user ${event.userId} of type ${event.type}`, 'NotificationsEventHandler');
  }

  @OnEvent('contest.created')
  async handleContestCreated(event: ContestCreatedEvent): Promise<void> {
    this.logger.info(`Contest ${event.contestId} created by user ${event.createdBy}`, 'NotificationsEventHandler');
    await this.notificationsRepository.create({
      userId: event.createdBy,
      type: 'contest.created',
      title: 'Contest Created',
      message: 'Your contest has been created successfully.',
      data: JSON.stringify({ contestId: event.contestId }),
    });
  }

  @OnEvent('winner.selected')
  async handleWinnerSelected(event: WinnerSelectedEvent): Promise<void> {
    this.logger.info(`Winner selected for contest ${event.contestId}: user ${event.winnerId}`, 'NotificationsEventHandler');
    await this.notificationsRepository.create({
      userId: event.winnerId,
      type: 'winner.selected',
      title: 'Congratulations! You won a contest',
      message: 'You have been selected as the winner of a contest.',
      data: JSON.stringify({ contestId: event.contestId, submissionId: event.submissionId }),
    });
  }

  @OnEvent('prize.distributed')
  async handlePrizeDistributed(event: PrizeDistributedEvent): Promise<void> {
    this.logger.info(`Prize distributed for contest ${event.contestId} to winner ${event.winnerId}`, 'NotificationsEventHandler');
    await this.notificationsRepository.create({
      userId: event.winnerId,
      type: 'prize.distributed',
      title: 'Prize Distributed',
      message: 'Your prize has been distributed.',
      data: JSON.stringify({ contestId: event.contestId, prizeId: event.prizeId }),
    });
  }
}
