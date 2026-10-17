import { Inject, Injectable } from '@nestjs/common';

import { WinstonLoggerService } from '../../../common/services/winston-logger.service.ts';
import { resolveEmailFromAddress, EMAIL_TRANSPORTER } from '../../../common/email/email-transporter.interface.ts';
import type { INotificationsRepository } from '../interfaces/notifications-repository.interface.ts';
import { NOTIFICATIONS_REPOSITORY } from '../interfaces/notifications-repository.interface.ts';
import { USERS_REPOSITORY } from '../../../common/users/users-repository.interface.ts';
import type { IUsersRepository } from '../../../common/users/users-repository.interface.ts';
import { preferenceForType } from '../preference-family.ts';
import type { EmailTransporter } from '../../../common/email/email-transporter.interface.ts';

/**
 * The user-facing half of the notification email path.
 *
 * WHY THE TRANSPORTER IS NOW INJECTED BY TOKEN INSTEAD OF BY `@Optional()` TYPE. This constructor used
 * to declare `@Optional() private readonly transporter?: EmailTransporter` with no `@Inject` — a TypeScript
 * interface, which is erased at runtime, so Nest resolved the `Object` token, found no provider for it
 * and, because the parameter was optional, quietly supplied `undefined`. The "No email transporter
 * configured" warning below was therefore printed on every notification email in every deployment,
 * configured or not: the transport was wired in `NotificationsModule` and reachable by nobody.
 *
 * It is now an explicit `EMAIL_TRANSPORTER` injection against the single transport `CommonModule`
 * provides, which the auth flows consume too (Principle #9 — one transport, one SMTP configuration).
 */
@Injectable()
export class NotificationsEmailService {
  private readonly from: string;

  constructor(
    @Inject(WinstonLoggerService) private readonly logger: WinstonLoggerService,
    @Inject(NOTIFICATIONS_REPOSITORY) private readonly notificationsRepository: INotificationsRepository,
    @Inject(USERS_REPOSITORY) private readonly usersRepository: IUsersRepository,
    @Inject(EMAIL_TRANSPORTER) private readonly transporter: EmailTransporter,
  ) {
    this.from = resolveEmailFromAddress();
  }

  async sendNotificationEmail(userId: string, type: string, title: string, message: string): Promise<boolean> {
    try {
      const preferences = await this.notificationsRepository.findPreferences(userId);
      if (!preferences.emailEnabled) {
        return false;
      }

      // The SAME resolver `NotificationsService.create` gates the row write with. This used to be a
      // second, private `typePreferenceMap`, which had already drifted from that one — it had no
      // `comment_reply`, so a user who muted replies still received the reply by email even after the
      // in-app notification was correctly suppressed. Two maps that must agree are one defect twice
      // (Principle #9), so there is now one.
      const preferenceKey = preferenceForType(type);
      if (preferenceKey && !preferences[preferenceKey]) {
        return false;
      }

      if (!this.transporter.isConfigured()) {
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
