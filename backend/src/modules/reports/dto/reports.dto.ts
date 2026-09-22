import { IsString, IsOptional, IsEnum, MaxLength, MinLength } from 'class-validator';

export const TargetTypeValues = ['story', 'comment', 'user', 'message'] as const;

export type TargetType = typeof TargetTypeValues[number];

export class CreateReportDto {
  @IsString()
  targetId: string;

  @IsEnum(TargetTypeValues, { message: 'Invalid target type' })
  targetType: TargetType;

  @IsString()
  @MaxLength(100, { message: 'Reason must not exceed 100 characters' })
  reason: string;

  @IsString()
  @MaxLength(1000, { message: 'Description must not exceed 1000 characters' })
  description: string;
}

export const ResolutionActionValues = ['dismiss', 'warn', 'restrict', 'ban', 'remove_content'] as const;

export type ResolutionAction = typeof ResolutionActionValues[number];

export class ResolveReportDto {
  @IsEnum(ResolutionActionValues, { message: 'Invalid resolution action' })
  action: ResolutionAction;

  @IsString()
  @MaxLength(500, { message: 'Reason must not exceed 500 characters' })
  reason: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000, { message: 'Notes must not exceed 1000 characters' })
  notes?: string;
}

export class ReportResponseDto {
  id: string;
  reporterId: string;
  targetId: string;
  targetType: string;
  reason: string;
  description: string;
  status: string;
  resolvedBy: string;
  resolvedAt: Date;
  resolution: string;
  createdAt: Date;
  updatedAt: Date;
}
