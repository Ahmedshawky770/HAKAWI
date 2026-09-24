export const NOTIFICATIONS_REPOSITORY = Symbol('NOTIFICATIONS_REPOSITORY');

export type Notification = {
  id: string;
  userId: string;
  type: string;
  title: string;
  message: string;
  data: string | null;
  isRead: boolean;
  readAt: Date | null;
  createdAt: Date;
};

export type CreateNotificationInput = {
  userId: string;
  type: string;
  title: string;
  message: string;
  data?: string;
};

export interface INotificationsRepository {
  findById(id: string): Promise<Notification | null>;
  findByUser(userId: string, page: number, limit: number): Promise<{ notifications: Notification[]; total: number }>;
  findUnread(userId: string): Promise<Notification[]>;
  create(data: CreateNotificationInput): Promise<Notification>;
  markAsRead(id: string): Promise<Notification>;
  markAllAsRead(userId: string): Promise<void>;
  delete(id: string): Promise<void>;
  countUnread(userId: string): Promise<number>;
  findPreferences(userId: string): Promise<NotificationPreferencesResponseDto>;
  upsertPreferences(userId: string, data: UpsertNotificationPreferencesInput): Promise<NotificationPreferencesResponseDto>;
}

export type NotificationPreferencesResponseDto = {
  emailEnabled: boolean;
  pushEnabled: boolean;
  storyReactions: boolean;
  comments: boolean;
  follows: boolean;
  mentions: boolean;
  system: boolean;
};

export type UpsertNotificationPreferencesInput = {
  emailEnabled: boolean;
  pushEnabled: boolean;
  storyReactions: boolean;
  comments: boolean;
  follows: boolean;
  mentions: boolean;
  system: boolean;
};
