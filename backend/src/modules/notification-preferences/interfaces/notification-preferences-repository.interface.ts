export interface INotificationPreferencesRepository {
  findById(id: string): Promise<NotificationPreferences | null>;
  findByUserId(userId: string): Promise<NotificationPreferences | null>;
  create(data: CreateNotificationPreferencesData): Promise<NotificationPreferences>;
  update(id: string, data: Partial<UpdateNotificationPreferencesData>): Promise<NotificationPreferences>;
  upsert(data: CreateNotificationPreferencesData): Promise<NotificationPreferences>;
}

export interface NotificationPreferences {
  id: string;
  userId: string;
  emailEnabled: boolean;
  pushEnabled: boolean;
  inAppEnabled: boolean;
  types: unknown;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateNotificationPreferencesData {
  userId: string;
  emailEnabled: boolean;
  pushEnabled: boolean;
  inAppEnabled: boolean;
  types: unknown | null;
}

export interface UpdateNotificationPreferencesData extends Partial<CreateNotificationPreferencesData> {}

export const NOTIFICATION_PREFERENCES_REPOSITORY = 'NOTIFICATION_PREFERENCES_REPOSITORY';
