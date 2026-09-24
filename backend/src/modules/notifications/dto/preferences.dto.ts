import { IsBoolean, IsOptional } from 'class-validator';

export class NotificationPreferencesDto {
  @IsOptional()
  @IsBoolean()
  emailEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  pushEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  storyReactions?: boolean;

  @IsOptional()
  @IsBoolean()
  comments?: boolean;

  @IsOptional()
  @IsBoolean()
  follows?: boolean;

  @IsOptional()
  @IsBoolean()
  mentions?: boolean;

  @IsOptional()
  @IsBoolean()
  system?: boolean;
}

export class NotificationPreferencesResponseDto {
  emailEnabled: boolean;
  pushEnabled: boolean;
  storyReactions: boolean;
  comments: boolean;
  follows: boolean;
  mentions: boolean;
  system: boolean;
}
