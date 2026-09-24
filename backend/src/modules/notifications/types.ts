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

export type NotificationResponse = {
  id: string;
  userId: string;
  type: string;
  title: string;
  message: string;
  data: Record<string, unknown> | null;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
};

export type NotificationPreferences = {
  id: string;
  userId: string;
  emailEnabled: boolean;
  pushEnabled: boolean;
  storyReactions: boolean;
  comments: boolean;
  follows: boolean;
  mentions: boolean;
  system: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type UpsertNotificationPreferencesInput = Partial<NotificationPreferences>;
