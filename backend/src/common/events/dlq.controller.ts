import { Controller, Get, Inject, Param, Post, Query, UseGuards } from '@nestjs/common';

import { AdminRole } from '../constants/roles.ts';
import { RequireAdminRole } from '../decorators/roles.decorator.ts';
import { JwtAuthGuard } from '../guards/jwt-auth.guard.ts';
import { RolesGuard } from '../guards/roles.guard.ts';
import { ThrottleTier } from '../decorators/throttle-tier.decorator.ts';
import { WinstonLoggerService } from '../services/winston-logger.service.ts';

import { EventValidatorService } from './event-validator.service.ts';
import { DLQService } from './dlq.service.ts';

/**
 * Operator access to the dead-letter queue.
 *
 *   `GET  /api/v1/events/dlq`           — what is parked, oldest first, bounded.
 *   `POST /api/v1/events/dlq/:id/replay` — re-validate one entry and RE-DELIVER it.
 *
 * WHY THIS EXISTS. A dead-letter queue with no drain is a log table. `EventValidatorService.emit`
 * wrote every schema-validation failure to Valkey, and nothing ever read it back: `retryDLQ` deleted a
 * now-valid entry without re-emitting, and `getDLQStats` had no caller outside its own spec. So a
 * rejected event was recorded and then lost — the roadmap's "Dead Letter Queue ✅" described a store,
 * not a mechanism.
 *
 * WHY SUPER_ADMIN AND NOT A CONTENT ROLE. A payload is a raw application event, and replaying one
 * re-delivers it to every subscriber — including payment and badge handlers. A content moderator has no
 * reason to be able to do that, and the narrow chain is the same one `CacheMetricsController` already
 * uses for the metrics endpoints, so it is a shape the repository has shipped.
 *
 * WHY `JwtAuthGuard` IS LISTED ALONGSIDE `RolesGuard`. `@Secured` also composes `RestrictionGuard`,
 * which reads `ValkeyService`. Keeping the two guards explicit here means a deliberately
 * broader-access operational endpoint does not silently inherit the account-restriction policy —
 * a banned administrator must still be able to drain a queue.
 */
@Controller('events/dlq')
export class DLQController {
  constructor(
    @Inject(EventValidatorService) private readonly validator: EventValidatorService,
    @Inject(DLQService) private readonly dlqService: DLQService,
    @Inject(WinstonLoggerService) private readonly logger: WinstonLoggerService,
  ) {}

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @RequireAdminRole(AdminRole.SUPER_ADMIN)
  async list(@Query('limit') limit?: string): Promise<{
    total: number;
    byEvent: Record<string, number>;
    events: Array<{ id: string; eventName: string; error: string; retryCount: number; timestamp: Date }>;
  }> {
    // `DLQService.list` is unbounded; the cap is applied here so an operator endpoint cannot become
    // the same unbounded-read defect the pagination DTOs exist to prevent.
    const parsed = Number(limit);
    const bounded = Number.isFinite(parsed) && parsed > 0 ? Math.min(Math.trunc(parsed), 500) : 100;

    const [stats, events] = await Promise.all([this.dlqService.getStats(), this.validator.listDeadLettered(bounded)]);

    return { total: stats.total, byEvent: stats.byEvent, events };
  }

  @Post(':id/replay')
  @ThrottleTier('auth')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @RequireAdminRole(AdminRole.SUPER_ADMIN)
  async replay(@Param('id') id: string): Promise<{ replayed: boolean; reason: string; id: string }> {
    if (!id) {
      return { replayed: false, reason: 'not-found', id };
    }

    const outcome = await this.validator.replayDeadLettered(id);

    // A replay that did not deliver is an operational fact worth an audit line: the event is still
    // parked, and the reason says why.
    this.logger.info(
      `DLQ replay of ${id}: ${outcome.replayed ? 'delivered' : `not delivered (${outcome.reason})`}`,
      'DLQController',
    );

    return { ...outcome, id };
  }
}
