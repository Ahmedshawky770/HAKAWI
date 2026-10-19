import { Injectable, Inject, Optional } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

import { WinstonLoggerService } from '../../../common/services/winston-logger.service.ts';
import { NotificationsService } from '../../notifications/notifications.service.ts';

export interface UserUpgradedEvent {
  userId: string;
  oldType: string;
  newType: string;
}

const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  reader: 'قارئ',
  rising_star: 'كاتب ناشئ',
  professional: 'كاتب محترف',
  publisher: 'دار نشر',
  admin: 'مدير النظام',
};

const UPGRADE_MESSAGES: Record<string, string> = {
  rising_star: 'أصبح حسابك الآن "كاتب ناشئ". يمكنك الآن كتابة القصص، الوصول للتحليلات الكاملة، والتواصل مع دور النشر.',
  professional: 'تهانينا! أصبح حسابك الآن "كاتب محترف". يمكنك الآن بيع كتبك الخاصة والاستفادة من جميع ميزات الكتّاب المحترفين.',
  publisher: 'تم ترقية حسابك إلى "دار نشر". يمكنك الآن إنشاء وإدارة المسابقات، وبيع كتب الكتّاب الممثلين.',
};

@Injectable()
export class UserUpgradedEventHandler {
  constructor(
    @Inject(WinstonLoggerService) private readonly logger: WinstonLoggerService,
    @Optional() @Inject(NotificationsService) private readonly notificationsService?: NotificationsService,
  ) {}

  @OnEvent('user.upgraded')
  async handleUserUpgraded(event: UserUpgradedEvent): Promise<void> {
    const { userId, oldType, newType } = event;
    const newTypeLabel = ACCOUNT_TYPE_LABELS[newType] ?? newType;
    const oldTypeLabel = ACCOUNT_TYPE_LABELS[oldType] ?? oldType;

    // Structured audit log
    this.logger.info(
      `User account upgraded: ${userId} (${oldTypeLabel} -> ${newTypeLabel})`,
      'UserUpgradedEventHandler',
    );

    // Send notification to user
    if (this.notificationsService) {
      const message = UPGRADE_MESSAGES[newType] ?? `تم ترقية حسابك إلى ${newTypeLabel}.`;
      await this.notificationsService.create({
        userId,
        type: 'system',
        title: 'ترقية الحساب',
        message,
        data: JSON.stringify({ oldType, newType }),
      });
    }
  }
}
