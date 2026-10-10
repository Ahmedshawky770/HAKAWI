import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest';

import { WinstonLoggerService } from '../../common/services/winston-logger.service.ts';
import { ModerationService } from './moderation.service.ts';

import {
  DEFAULT_ESCALATION_SWEEP_INTERVAL_MS,
  EscalationScheduler,
  escalationSweepEnabled,
  escalationSweepIntervalMs,
} from './escalation.scheduler.ts';

type MockLogger = {
  info: Mock;
  log: Mock;
  error: Mock;
  warn: Mock;
  debug: Mock;
  verbose: Mock;
};

describe('escalationSweepIntervalMs', () => {
  it('should default to fifteen minutes', () => {
    expect(escalationSweepIntervalMs({})).toBe(DEFAULT_ESCALATION_SWEEP_INTERVAL_MS);
  });

  it('should read a configured interval', () => {
    expect(escalationSweepIntervalMs({ MODERATION_ESCALATION_SWEEP_INTERVAL_MS: '60000' })).toBe(60_000);
  });

  it.each(['not-a-number', '0', '10', ''])('should fall back for the unusable value %s', (raw) => {
    expect(escalationSweepIntervalMs({ MODERATION_ESCALATION_SWEEP_INTERVAL_MS: raw })).toBe(
      DEFAULT_ESCALATION_SWEEP_INTERVAL_MS,
    );
  });
});

describe('escalationSweepEnabled', () => {
  it('should be off in the test environment', () => {
    expect(escalationSweepEnabled({ NODE_ENV: 'test' })).toBe(false);
  });

  it('should be on outside tests', () => {
    expect(escalationSweepEnabled({ NODE_ENV: 'production' })).toBe(true);
  });

  it('should honour an explicit true', () => {
    expect(escalationSweepEnabled({ MODERATION_ESCALATION_SWEEP_ENABLED: 'true' })).toBe(true);
    expect(escalationSweepEnabled({ MODERATION_ESCALATION_SWEEP_ENABLED: '1' })).toBe(true);
  });

  it('should honour an explicit false', () => {
    expect(escalationSweepEnabled({ MODERATION_ESCALATION_SWEEP_ENABLED: 'false' })).toBe(false);
    expect(escalationSweepEnabled({ MODERATION_ESCALATION_SWEEP_ENABLED: '0' })).toBe(false);
  });
});

describe('EscalationScheduler', () => {
  let scheduler: EscalationScheduler;
  let moderationService: { autoEscalateReports: Mock<() => Promise<number>> };
  let logger: MockLogger;

  beforeEach(() => {
    vi.useFakeTimers();
    logger = { info: vi.fn(), log: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn(), verbose: vi.fn() };
    moderationService = { autoEscalateReports: vi.fn<() => Promise<number>>().mockResolvedValue(0) };
    scheduler = new EscalationScheduler(
      moderationService as unknown as ModerationService,
      logger as unknown as WinstonLoggerService,
    );
  });

  afterEach(() => {
    scheduler.onModuleDestroy();
    vi.useRealTimers();
  });

  it('should run the escalation sweep on the configured interval', async () => {
    vi.stubEnv('MODERATION_ESCALATION_SWEEP_ENABLED', 'true');
    vi.stubEnv('MODERATION_ESCALATION_SWEEP_INTERVAL_MS', '1000');
    scheduler.onModuleInit();

    await vi.advanceTimersByTimeAsync(1000);

    expect(moderationService.autoEscalateReports).toHaveBeenCalledTimes(1);
    vi.unstubAllEnvs();
  });

  it('should not arm a timer while the sweep is disabled', async () => {
    vi.stubEnv('MODERATION_ESCALATION_SWEEP_ENABLED', 'false');
    scheduler.onModuleInit();

    await vi.advanceTimersByTimeAsync(60 * 60 * 1000);

    expect(moderationService.autoEscalateReports).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });

  it('should stop the timer on module destroy', async () => {
    vi.stubEnv('MODERATION_ESCALATION_SWEEP_ENABLED', 'true');
    vi.stubEnv('MODERATION_ESCALATION_SWEEP_INTERVAL_MS', '1000');
    scheduler.onModuleInit();
    scheduler.onModuleDestroy();

    await vi.advanceTimersByTimeAsync(5000);

    expect(moderationService.autoEscalateReports).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });

  it('should report how many reports the sweep escalated', async () => {
    moderationService.autoEscalateReports.mockResolvedValueOnce(3);

    await expect(scheduler.runSweep()).resolves.toBe(3);
    expect(logger.warn).toHaveBeenCalledWith('Escalation sweep escalated 3 stale reports', 'EscalationScheduler');
  });

  it('should stay quiet when nothing needed escalating', async () => {
    await expect(scheduler.runSweep()).resolves.toBe(0);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('should swallow a sweep failure and log it', async () => {
    moderationService.autoEscalateReports.mockRejectedValueOnce(new Error('connection terminated'));

    await expect(scheduler.runSweep()).resolves.toBe(0);
    expect(logger.error).toHaveBeenCalledWith(
      'Escalation sweep failed: connection terminated',
      undefined,
      'EscalationScheduler',
    );
  });

  it('should skip a tick that lands while the previous sweep is still running', async () => {
    let releaseSweep: (() => void) | undefined;
    moderationService.autoEscalateReports.mockImplementationOnce(
      () =>
        new Promise<number>((resolve) => {
          releaseSweep = () => resolve(0);
        }),
    );

    const first = scheduler.runSweep();
    const second = await scheduler.runSweep();

    // The second tick is dropped rather than starting a sweep over the same backlog.
    expect(second).toBe(0);
    expect(moderationService.autoEscalateReports).toHaveBeenCalledTimes(1);

    releaseSweep?.();
    await expect(first).resolves.toBe(0);
  });

  it('should resume sweeping once the in-flight sweep has settled', async () => {
    let releaseSweep: (() => void) | undefined;
    moderationService.autoEscalateReports.mockImplementationOnce(
      () =>
        new Promise<number>((resolve) => {
          releaseSweep = () => resolve(0);
        }),
    );

    const first = scheduler.runSweep();
    await scheduler.runSweep();
    releaseSweep?.();
    await first;

    await expect(scheduler.runSweep()).resolves.toBe(0);
    expect(moderationService.autoEscalateReports).toHaveBeenCalledTimes(2);
  });

  it('should release the guard even when the sweep fails', async () => {
    moderationService.autoEscalateReports.mockRejectedValueOnce(new Error('connection terminated'));

    await expect(scheduler.runSweep()).resolves.toBe(0);
    await expect(scheduler.runSweep()).resolves.toBe(0);

    expect(moderationService.autoEscalateReports).toHaveBeenCalledTimes(2);
  });

  it('should not overlap sweeps on the configured interval', async () => {
    vi.stubEnv('MODERATION_ESCALATION_SWEEP_ENABLED', 'true');
    vi.stubEnv('MODERATION_ESCALATION_SWEEP_INTERVAL_MS', '1000');

    let inFlight = 0;
    let maxInFlight = 0;
    moderationService.autoEscalateReports.mockImplementation(async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await Promise.resolve();
      inFlight -= 1;
      return 0;
    });

    scheduler.onModuleInit();
    await vi.advanceTimersByTimeAsync(10_000);
    scheduler.onModuleDestroy();

    expect(maxInFlight).toBe(1);
    expect(moderationService.autoEscalateReports).toHaveBeenCalled();
    vi.unstubAllEnvs();
  });
});
