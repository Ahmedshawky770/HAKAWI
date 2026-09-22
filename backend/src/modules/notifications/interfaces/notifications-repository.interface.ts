export interface INotificationsRepository {
  findById(id: string): Promise<Notification | null>;
  findByUserId(userId: string): Promise<Notification[]>;
  markAsRead(id: string): Promise<void>;
  markAllAsRead(userId: string): Promise<void>;
  delete(id: string): Promise<void>;
  deleteAll(userId: string): Promise<void>;
  getUnreadCount(userId: string): Promise<number>;
  findByUserAndType(userId: string, type: string): Promise<Notification[]>;
  create(data: CreateNotificationData): Promise<Notification>;
}

export type NotificationType = 'story_published' | 'follow' | 'comment' | 'contest_update' | 'payment' | 'system' | 'moderation';

export interface Notification {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  isRead: boolean;
  readAt: Date | null;
  actorId: string | null;
  entityId: string | null;
  data: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateNotificationData {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  isRead: boolean;
  actorId?: string | null;
  entityId?: string | null;
  data?: Record<string, unknown> | null;
}

export const NOTIFICATIONS_REPOSITORY = 'NOTIFICATIONS_REPOSITORY';
