import { Injectable, Inject, Optional } from '@nestjs/common';

import { WinstonLoggerService } from '../../../common/services/winston-logger.service.ts';
import type { INotificationsRepository } from '../interfaces/notifications-repository.interface.ts';
import { NOTIFICATIONS_REPOSITORY } from '../interfaces/notifications-repository.interface.ts';
import { USERS_REPOSITORY } from '../../../common/users/users-repository.interface.ts';
import type { IUsersRepository } from '../../../common/users/users-repository.interface.ts';

import type { EmailTransporter } from './transporter.interface.ts';

@Injectable()
export class NotificationsEmailService {
  private readonly from: string;

  constructor(
    @Inject(WinstonLoggerService) private readonly logger: WinstonLoggerService,
    @Inject(NOTIFICATIONS_REPOSITORY) private readonly notificationsRepository: INotificationsRepository,
    @Inject(USERS_REPOSITORY) private readonly usersRepository: IUsersRepository,
    @Optional() private readonly transporter?: EmailTransporter,
  ) {
    this.from = process.env.EMAIL_FROM || 'noreply@hakawi.com';
  }

  async sendNotificationEmail(userId: string, type: string, title: string, message: string): Promise<boolean> {
    try {
      const preferences = await this.notificationsRepository.findPreferences(userId);
      if (!preferences.emailEnabled) {
        return false;
      }

      const typePreferenceMap: Record<string, keyof typeof preferences> = {
        story_reaction: 'storyReactions',
        comment: 'comments',
        follow: 'follows',
        mention: 'mentions',
        system: 'system',
      };

      const preferenceKey = typePreferenceMap[type];
      if (preferenceKey && !preferences[preferenceKey]) {
        return false;
      }

      if (!this.transporter) {
        this.logger.warn(
          `No email transporter configured. Skipping email for notification type: ${type}`,
          'NotificationsEmailService',
        );
        return false;
      }

      const user = await this.usersRepository.findById(userId);
      if (!user) {
        this.logger.warn(`User not found for notification email: ${userId}`, 'NotificationsEmailService');
        return false;
      }

      const to = user.email;

      await this.transporter.sendMail({
        from: this.from,
        to,
        subject: title,
        text: message,
        html: `<p>${message.replace(/\n/g, '<br>')}</p>`,
      });

      this.logger.info(`Notification email sent to ${to} for type: ${type}`, 'NotificationsEmailService');
      return true;
    } catch (error) {
      this.logger.error(
        `Failed to send notification email: ${(error as Error).message}`,
        (error as Error).stack,
        'NotificationsEmailService',
      );
      return false;
    }
  }
}
