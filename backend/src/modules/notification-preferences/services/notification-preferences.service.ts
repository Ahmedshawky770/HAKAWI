import { Injectable, Logger, NotFoundException, Inject } from '@nestjs/common';
import type { INotificationPreferencesRepository, CreateNotificationPreferencesData, UpdateNotificationPreferencesData } from '../interfaces/notification-preferences-repository.interface.js';
import { NOTIFICATION_PREFERENCES_REPOSITORY } from '../interfaces/notification-preferences-repository.interface.js';
import { NotificationPreferencesRepository } from '../repositories/notification-preferences.repository.js';

@Injectable()
export class NotificationPreferencesService {
  private readonly logger = new Logger(NotificationPreferencesService.name);

  constructor(
    @Inject(NOTIFICATION_PREFERENCES_REPOSITORY) private readonly prefsRepository: NotificationPreferencesRepository,
  ) {}

  async findByUserId(userId: string): Promise<CreateNotificationPreferencesData> {
    let prefs = await this.prefsRepository.findByUserId(userId);
    if (!prefs) {
      prefs = await this.prefsRepository.create({
        userId,
        emailEnabled: true,
        pushEnabled: true,
        inAppEnabled: true,
        types: null,
      });
    }
    return prefs;
  }

  async update(userId: string, data: Partial<UpdateNotificationPreferencesData>): Promise<CreateNotificationPreferencesData> {
    const prefs = await this.prefsRepository.findByUserId(userId);
    if (!prefs) {
      throw new NotFoundException('Notification preferences not found');
    }
    return this.prefsRepository.update(prefs.id, data);
  }
}
