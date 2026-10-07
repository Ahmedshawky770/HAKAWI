import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length, IsOptional } from 'class-validator';

export class MfaSetupResponseDto {
  @ApiProperty({ description: 'Base32-encoded TOTP secret' })
  @IsString()
  secret: string;

  @ApiProperty({ description: 'otpauth:// URL for QR code' })
  @IsString()
  otpauthUrl: string;

  @ApiProperty({ description: 'Base64-encoded QR code image (data URL)' })
  @IsString()
  qrCodeDataUrl: string;

  @ApiProperty({ description: 'One-time backup codes', type: [String] })
  @IsString({ each: true })
  backupCodes: string[];
}

export class MfaVerifyDto {
  @ApiProperty({ description: '6-digit TOTP code or backup code' })
  @IsString()
  @Length(6, 8)
  token: string;
}

export class MfaVerifyResponseDto {
  @ApiProperty({ description: 'Whether verification succeeded' })
  verified: boolean;

  @ApiProperty({ description: 'Whether a backup code was used', required: false })
  backupCodeUsed?: boolean;
}

export class MfaDisableDto {
  @ApiProperty({ description: 'Current password for confirmation', required: false })
  @IsString()
  @IsOptional()
  password?: string;
}

export class MfaStatusDto {
  @ApiProperty({ description: 'Whether MFA is enabled' })
  enabled: boolean;

  @ApiProperty({ description: 'Whether MFA is enforced for this account (admin)' })
  enforced: boolean;

  @ApiProperty({ description: 'Number of remaining backup codes', required: false })
  backupCodesRemaining?: number;

  @ApiProperty({ description: 'When MFA was enabled', required: false })
  enforcedAt?: Date | null;
}

export class MfaBackupCodesResponseDto {
  @ApiProperty({ description: 'New backup codes', type: [String] })
  @IsString({ each: true })
  backupCodes: string[];
}