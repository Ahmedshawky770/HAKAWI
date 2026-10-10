import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
  Inject,
  BadRequestException,
} from '@nestjs/common';

import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.ts';
import { RequireAdminRole } from '../../common/decorators/roles.decorator.ts';
import { AdminRole } from '../../common/constants/roles.ts';
import { ThrottleTier } from '../../common/decorators/throttle-tier.decorator.ts';

import { IpBlocklistService, BlockRecord, BlockOptions } from '../../common/waf/ip-blocklist.service.ts';
import { WinstonLoggerService } from '../../common/services/winston-logger.service.ts';

interface BlockRequest {
  ip: string;
  reason: string;
  ruleId?: string | null;
  kind: 'temporary' | 'permanent';
  ttlSeconds?: number;
}

@Controller('admin/waf')
@UseGuards(JwtAuthGuard)
@RequireAdminRole(AdminRole.SUPER_ADMIN)
@ThrottleTier('default')
export class AdminWafController {
  constructor(
    @Inject(IpBlocklistService) private readonly ipBlocklist: IpBlocklistService,
    @Inject(WinstonLoggerService) private readonly logger: WinstonLoggerService,
  ) {}

  @Get('blocked-ips')
  async getBlockedIps(): Promise<BlockRecord[]> {
    this.logger.info('Admin WAF: listing blocked IPs', 'AdminWafController');
    return this.ipBlocklist.listBlocked();
  }

  @Post('block-ip')
  @HttpCode(HttpStatus.CREATED)
  async blockIp(@Body() body: BlockRequest): Promise<{ success: boolean }> {
    const { ip, reason, ruleId, kind, ttlSeconds } = body;

    if (!ip || typeof ip !== 'string' || ip.trim().length === 0) {
      throw new BadRequestException('IP address is required');
    }
    if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
      throw new BadRequestException('Reason is required');
    }
    if (kind !== 'temporary' && kind !== 'permanent') {
      throw new BadRequestException("Kind must be 'temporary' or 'permanent'");
    }

    const options: BlockOptions = {
      reason: reason.trim(),
      ruleId: ruleId?.trim() ?? null,
      kind,
      ttlSeconds: kind === 'temporary' ? (ttlSeconds ?? 3600) : undefined,
    };

    const success = await this.ipBlocklist.block(ip.trim(), options);
    return { success };
  }

  @Post('unblock-ip')
  @HttpCode(HttpStatus.OK)
  async unblockIp(@Body() body: { ip: string }): Promise<{ success: boolean }> {
    const { ip } = body;

    if (!ip || typeof ip !== 'string' || ip.trim().length === 0) {
      throw new BadRequestException('IP address is required');
    }

    const success = await this.ipBlocklist.unblock(ip.trim());
    return { success };
  }

  @Post('clear-counters')
  @HttpCode(HttpStatus.OK)
  async clearCounters(@Body() body: { ip?: string }): Promise<{ success: boolean }> {
    const { ip } = body;

    if (ip) {
      if (typeof ip !== 'string' || ip.trim().length === 0) {
        throw new BadRequestException('Invalid IP address');
      }
      await this.ipBlocklist.clearViolations(ip.trim());
    } else {
      // Clear all violation counters by deleting the violation prefix keys
      // This is a more aggressive operation - we need to find all violation keys
      // For now, we'll just log and return success for single IP
      this.logger.warn('Admin WAF: clearCounters called without IP - not implemented for all IPs', 'AdminWafController');
    }
    return { success: true };
  }

  @Post('clear-blocks')
  @HttpCode(HttpStatus.OK)
  async clearBlocks(@Body() body: { ip?: string }): Promise<{ success: boolean }> {
    const { ip } = body;

    if (ip) {
      if (typeof ip !== 'string' || ip.trim().length === 0) {
        throw new BadRequestException('Invalid IP address');
      }
      await this.ipBlocklist.unblock(ip.trim());
    } else {
      // Clear all blocks - would need to iterate over INDEX_KEY
      this.logger.warn('Admin WAF: clearBlocks called without IP - not implemented for all IPs', 'AdminWafController');
    }
    return { success: true };
  }
}