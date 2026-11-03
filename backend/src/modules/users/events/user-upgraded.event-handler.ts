import { Injectable, Inject, Optional } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

import { WinstonLoggerService } from '../../../common/services/winston-logger.service.ts';
import { USERS_REPOSITORY } from '../../../common/users/users-repository.interface.ts';
import type { IUsersRepository } from '../../../common/users/users-repository.interface.ts';
import { t, normalizeLocale } from '../../../common/i18n/i18n.ts';
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
    @Optional() @Inject(USERS_REPOSITORY) private readonly usersRepository?: IUsersRepository,
    @Optional() @Inject(NotificationsService) private readonly notificationsService?: NotificationsService,
  ) {}

  @OnEvent('user.upgraded')
  async handleUserUpgraded(event: UserUpgradedEvent): Promise<void> {
    const { userId, oldType, newType } = event;

    // Structured audit log
    this.logger.info(`User account upgraded: ${userId} (${oldType} -> ${newType})`, 'UserUpgradedEventHandler');

    if (this.notificationsService) {
      const user = this.usersRepository ? await this.usersRepository.findById(userId) : null;
      const locale = normalizeLocale(user?.preferredLocale);
      const upgradeKey =
        newType === 'rising_star'
          ? 'upgrade.rising_star'
          : newType === 'professional'
            ? 'upgrade.professional'
            : newType === 'publisher'
              ? 'upgrade.publisher'
              : 'upgrade.default';
      await this.notificationsService.create({
        userId,
        type: 'system',
        title: t('user.upgraded.title', locale),
        message: t(upgradeKey, locale),
        data: JSON.stringify({ oldType, newType }),
      });
    }
  }
}
