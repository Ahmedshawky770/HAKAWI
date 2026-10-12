import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
  Inject,
  BadRequestException,
} from '@nestjs/common';

import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.ts';
import { RolesGuard } from '../../common/guards/roles.guard.ts';
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

/**
 * WHY `RolesGuard` IS IN `@UseGuards` AND NOT ONLY IMPLIED.
 *
 * `@RequireAdminRole()` is `SetMetadata` and nothing else — it writes a key, it enforces nothing
 * (`common/decorators/roles.decorator.ts`). The guard that reads that key is `RolesGuard`, and until
 * this line carried it, the metadata was decorative: every route here answered a merely AUTHENTICATED
 * caller. `POST /admin/waf/unblock-ip` therefore let any reader lift a WAF block placed on their own
 * IP, and `POST /admin/waf/block-ip` let any reader block a target of their choosing — a
 * self-inflicted denial of service against any account or address.
 *
 * WHY THE GUARDS ARE LISTED RATHER THAN `@Secured()`. `@Secured` composes
 * `JwtAuthGuard, RestrictionGuard, RolesGuard, PermissionsGuard`
 * (`common/decorators/secured.decorator.ts`) — three of them this controller does not need.
 * `RestrictionGuard` costs a Valkey `EXISTS` per request to answer a question about account state
 * that no WAF action asks, and `PermissionsGuard` evaluates the `PERMISSIONS_KEY` metadata this
 * controller never sets (it returns `true` immediately when it finds none, so it would be pure
 * overhead). The narrowest pair is the same one `common/events/dlq.controller.ts` and
 * `common/observability/metrics.controller.ts` use, and both of those are the working precedent:
 * the guard order is the contract — `JwtAuthGuard` populates `request.user`, which `RolesGuard`
 * reads, so swapping the two would turn every admin check into a 403 rather than into an error.
 */
@Controller('admin/waf')
@UseGuards(JwtAuthGuard, RolesGuard)
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