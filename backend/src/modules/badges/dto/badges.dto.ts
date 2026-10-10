import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

import { BADGE_METRICS, BADGE_TRIGGER_EVENTS } from '../badge-rules.config.ts';

export class ListBadgesQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(50, { message: 'Badge key must not exceed 50 characters' })
  key?: string;
}

export class AwardBadgeDto {
  @IsString()
  @MaxLength(255, { message: 'Badge key must not exceed 255 characters' })
  badgeKey: string;
}

export const BADGE_TRIGGER_EVENT_NAMES = BADGE_TRIGGER_EVENTS;

export const BADGE_METRIC_NAMES = BADGE_METRICS;

export class BadgeFilterDto {
  @IsOptional()
  @IsIn(BADGE_METRIC_NAMES, { message: 'Metric is not a known badge metric' })
  metric?: (typeof BADGE_METRIC_NAMES)[number];
}
