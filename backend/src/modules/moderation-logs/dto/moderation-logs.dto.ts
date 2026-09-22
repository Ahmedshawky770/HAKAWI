import { IsString, IsObject } from 'class-validator';

export class ModerationLogResponseDto {
  id: string;
  moderatorId: string;
  action: string;
  targetId: string;
  targetType: string;
  reason: string;
  metadata: Record<string, unknown>;
  createdAt: Date;
}
