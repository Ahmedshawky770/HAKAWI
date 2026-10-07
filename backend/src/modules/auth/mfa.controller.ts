import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
  Inject,
  Req,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';

import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.ts';
import { ThrottleTier } from '../../common/decorators/throttle-tier.decorator.ts';
import type { AuthRequest } from '../../common/types/auth-request.interface.ts';

import { MfaService } from './mfa.service.ts';
import { WinstonLoggerService } from '../../common/services/winston-logger.service.ts';
import {
  MfaSetupResponseDto,
  MfaVerifyDto,
  MfaVerifyResponseDto,
  MfaDisableDto,
  MfaStatusDto,
  MfaBackupCodesResponseDto,
} from './dto/mfa.dto.ts';

@ApiTags('MFA')
@Controller('auth/mfa')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
@ThrottleTier('auth')
export class MfaController {
  constructor(
    @Inject(MfaService) private readonly mfaService: MfaService,
    @Inject(WinstonLoggerService) private readonly logger: WinstonLoggerService,
  ) {}

  @Get('status')
  @ApiOperation({ summary: 'Get MFA status for current user' })
  @ApiResponse({ status: 200, type: MfaStatusDto })
  async getStatus(@Req() req: AuthRequest): Promise<MfaStatusDto> {
    const userId = req.user.sub;
    const [enabled, enforced, backupCount] = await Promise.all([
      this.mfaService.isMfaEnabled(userId),
      this.mfaService.shouldEnforceMfa(userId),
      this.mfaService.getBackupCodesCount(userId),
    ]);

    const user = await this.mfaService['usersRepository'].findById(userId);

    return {
      enabled,
      enforced,
      backupCodesRemaining: backupCount,
      enforcedAt: user?.mfaEnforcedAt ?? null,
    };
  }

  @Post('setup')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Initiate MFA setup (returns QR code and backup codes)' })
  @ApiResponse({ status: 200, type: MfaSetupResponseDto })
  @ApiResponse({ status: 400, description: 'MFA already enabled' })
  async initiateSetup(@Req() req: AuthRequest): Promise<MfaSetupResponseDto> {
    return this.mfaService.initiateSetup(req.user.sub);
  }

  @Post('verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Complete MFA setup by verifying first TOTP code' })
  @ApiResponse({ status: 200, type: MfaVerifyResponseDto })
  @ApiResponse({ status: 400, description: 'Invalid or expired code' })
  async verifySetup(
    @Req() req: AuthRequest,
    @Body() dto: MfaVerifyDto,
  ): Promise<MfaVerifyResponseDto> {
    const result = await this.mfaService.completeSetup(req.user.sub, dto.token);
    return { verified: true, backupCodeUsed: false };
  }

  @Post('challenge')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify a TOTP or backup code (for step-up auth)' })
  @ApiResponse({ status: 200, type: MfaVerifyResponseDto })
  async verifyChallenge(
    @Req() req: AuthRequest,
    @Body() dto: MfaVerifyDto,
  ): Promise<MfaVerifyResponseDto> {
    const result = await this.mfaService.verifyToken(req.user.sub, dto.token);
    return result;
  }

  @Post('backup-codes')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Regenerate backup codes (invalidates old ones)' })
  @ApiResponse({ status: 200, type: MfaBackupCodesResponseDto })
  @ApiResponse({ status: 400, description: 'MFA not enabled' })
  async regenerateBackupCodes(@Req() req: AuthRequest): Promise<MfaBackupCodesResponseDto> {
    const backupCodes = await this.mfaService.regenerateBackupCodes(req.user.sub);
    return { backupCodes };
  }

  @Delete()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Disable MFA (requires password confirmation in body)' })
  @ApiResponse({ status: 200, description: 'MFA disabled' })
  @ApiResponse({ status: 400, description: 'MFA not enabled' })
  async disableMfa(
    @Req() req: AuthRequest,
    @Body() dto: MfaDisableDto,
  ): Promise<{ message: string }> {
    await this.mfaService.disableMfa(req.user.sub);
    return { message: 'MFA disabled successfully' };
  }
}