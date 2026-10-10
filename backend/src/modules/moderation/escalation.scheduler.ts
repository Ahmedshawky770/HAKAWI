import { Injectable, Inject, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';

import { WinstonLoggerService } from '../../common/services/winston-logger.service.ts';
import { ModerationService } from './moderation.service.ts';

export const DEFAULT_ESCALATION_SWEEP_INTERVAL_MS = 15 * 60 * 1000;

export function escalationSweepIntervalMs(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.MODERATION_ESCALATION_SWEEP_INTERVAL_MS;
  if (raw === undefined) {
    return DEFAULT_ESCALATION_SWEEP_INTERVAL_MS;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 1_000) {
    return DEFAULT_ESCALATION_SWEEP_INTERVAL_MS;
  }
  return parsed;
}

export function escalationSweepEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const raw = env.MODERATION_ESCALATION_SWEEP_ENABLED;
  if (raw === undefined) {
    return env.NODE_ENV !== 'test';
  }
  return raw === 'true' || raw === '1';
}

/**
 * Drives the stale-report escalation sweep. `ModerationService.autoEscalateReports`
 * is the escalation control the roadmap describes; without a timer it never runs.
 * The interval handle is unref'd so it can never hold the process open.
 */
@Injectable()
export class EscalationScheduler implements OnModuleInit, OnModuleDestroy {
  private timer: ReturnType<typeof setInterval> | null = null;
  /**
   * True from the moment a sweep starts until it settles.
   *
   * `setInterval` does not wait. A sweep that takes longer than the interval — a large
   * backlog, a slow database — would otherwise start again while the previous one is still
   * holding its rows, so two sweeps would read the same open reports and race each other's
   * writes. The UPDATE is now a compare-and-set, so the loser writes nothing rather than
   * corrupting anything, but it still doubles the query load and re-reads the whole backlog.
   * Skipping the overlapping tick is the cheaper of the two correct answers.
   */
  private sweepInFlight = false;

  constructor(
    @Inject(ModerationService) private readonly moderationService: ModerationService,
    @Inject(WinstonLoggerService) private readonly logger: WinstonLoggerService,
  ) {}

  onModuleInit(): void {
    if (!escalationSweepEnabled()) {
      return;
    }
    const intervalMs = escalationSweepIntervalMs();
    this.timer = setInterval(() => {
      void this.runSweep();
    }, intervalMs);
    this.timer.unref?.();
    this.logger.info(`Escalation sweep scheduled every ${intervalMs}ms`, 'EscalationScheduler');
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** Runs the sweep unless the previous one is still in flight. Returns 0 for a skipped tick. */
  async runSweep(): Promise<number> {
    if (this.sweepInFlight) {
      this.logger.debug('Escalation sweep still in flight, skipping this tick', 'EscalationScheduler');
      return 0;
    }

    this.sweepInFlight = true;
    try {
      const escalated = await this.moderationService.autoEscalateReports();
      if (escalated > 0) {
        this.logger.warn(`Escalation sweep escalated ${escalated} stale reports`, 'EscalationScheduler');
      }
      return escalated;
    } catch (error) {
      this.logger.error(
        `Escalation sweep failed: ${error instanceof Error ? error.message : String(error)}`,
        undefined,
        'EscalationScheduler',
      );
      return 0;
    } finally {
      this.sweepInFlight = false;
    }
  }
}
