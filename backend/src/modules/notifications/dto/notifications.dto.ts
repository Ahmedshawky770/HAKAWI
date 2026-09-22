import { IsString, IsBoolean, IsObject, IsOptional } from 'class-validator';

export class NotificationResponseDto {
  id: string;
  userId: string;
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  readAt: Date;
  actorId: string;
  entityId: string;
  data: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export class UpdateNotificationPreferencesDto {
  @IsOptional()
  @IsBoolean()
  emailEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  pushEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  inAppEnabled?: boolean;

  @IsOptional()
  @IsObject()
  types?: Record<string, unknown>;
}

export class NotificationPreferencesResponseDto {
  id: string;
  userId: string;
  emailEnabled: boolean;
  pushEnabled: boolean;
  inAppEnabled: boolean;
  types: Record<string, unknown>;
  createdAt: Date;
}
