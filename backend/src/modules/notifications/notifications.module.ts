import { Module } from '@nestjs/common';

import { DatabaseModule } from '../../db/database.module.ts';
import { CommonModule } from '../../common/common.module.ts';

import { NotificationsService } from './notifications.service.ts';
import { NotificationsController } from './controllers/notifications.controller.ts';
import { NotificationsRepository } from './repositories/notifications.repository.ts';
import { NOTIFICATIONS_REPOSITORY } from './interfaces/notifications-repository.interface.ts';
import { NotificationsEventHandler } from './events/notifications.event-handler.ts';
import { NotificationsEmailService } from './email/notifications-email.service.ts';
import { StoriesModule } from '../stories/stories.module.ts';
import { CommentsModule } from '../comments/comments.module.ts';

@Module({
  // StoriesModule and CommentsModule are imported so `NotificationsEventHandler` can resolve an
  // author through those modules' OWN repository interfaces. It used to read the `stories`,
  // `comments` and `conversations` tables itself through `db`, which coupled this module to three
  // schemas it does not own (Principle #7). `message.sent` needs nothing from MessagesModule: the
  // recipient now travels on the event, because the producer already had it (Principle #9).
  imports: [CommonModule, DatabaseModule, StoriesModule, CommentsModule],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    NotificationsRepository,
    NotificationsEventHandler,
    NotificationsEmailService,
    { provide: NOTIFICATIONS_REPOSITORY, useExisting: NotificationsRepository },
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
