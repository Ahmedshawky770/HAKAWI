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

  /**
   * Direct messages. Present because a `message` notification had no preference to consult at all until
   * migration 0023 added the column, so a user could not silence one.
   */
  @IsOptional()
  @IsBoolean()
  messages?: boolean;

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
  messages: boolean;
  system: boolean;
}
