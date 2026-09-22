import { symbol } from '../../common/utils/symbol.util.js';
import type { Notification } from '../../../db/schema/notifications.schema.js';
import type { NewNotification } from '../../../db/schema/notifications.schema.js';

export const NOTIFICATIONS_REPOSITORY = symbol('NOTIFICATIONS_REPOSITORY');

export type NotificationType = 'system' | 'message' | 'contest' | 'payment' | 'review' | 'follow';

export type CreateNotificationData = NewNotification;

export { Notification };

export interface INotificationsRepository {
  findById(id: string): Promise<Notification | null>;
  findByUserId(userId: string): Promise<Notification[]>;
  markAsRead(id: string): Promise<void>;
  markAllAsRead(userId: string): Promise<void>;
  delete(id: string): Promise<void>;
  deleteAll(userId: string): Promise<void>;
  getUnreadCount(userId: string): Promise<number>;
  findByUserAndType(userId: string, type: NotificationType): Promise<Notification[]>;
  create(data: CreateNotificationData): Promise<Notification>;
}
