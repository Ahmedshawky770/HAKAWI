import { symbol } from '../utils/symbol.util.js';
import type { NotificationPreferences } from '../../../db/schema/notification-preferences.schema.js';
import type { NewNotificationPreference } from '../../../db/schema/notification-preferences.schema.js';

export const NOTIFICATION_PREFERENCES_REPOSITORY = symbol('NOTIFICATION_PREFERENCES_REPOSITORY');

export type CreateNotificationPreferencesData = NewNotificationPreference;
export type UpdateNotificationPreferencesData = Partial<CreateNotificationPreferencesData>;

export interface INotificationPreferencesRepository {
  findById(id: string): Promise<NotificationPreferences | null>;
  findByUserId(userId: string): Promise<NotificationPreferences | null>;
  create(data: CreateNotificationPreferencesData): Promise<NotificationPreferences>;
  update(id: string, data: Partial<UpdateNotificationPreferencesData>): Promise<NotificationPreferences>;
  upsert(data: CreateNotificationPreferencesData): Promise<NotificationPreferences>;
}
