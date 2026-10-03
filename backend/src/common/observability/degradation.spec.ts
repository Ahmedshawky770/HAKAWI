import { describe, it, expect, vi } from 'vitest';

import { DegradationTracker } from './degradation.ts';
import type { DegradationSink } from './degradation.ts';

type RecordingSink = {
  [Level in keyof DegradationSink]: ReturnType<typeof vi.fn<DegradationSink[Level]>>;
};

function sink(): RecordingSink {
  return { warn: vi.fn<DegradationSink['warn']>(), info: vi.fn<DegradationSink['info']>() };
}

describe('DegradationTracker', () => {
  it('starts healthy with a null correlation handle', () => {
    const tracker = new DegradationTracker(
      sink(),
      () => 'fixed-id',
      () => 1_000,
    );

    expect(tracker.isDegraded).toBe(false);
    expect(tracker.snapshot()).toEqual({
      degraded: false,
      degradationId: null,
      degradedSinceMs: null,
      degradedEvents: 0,
      degradationCount: 0,
    });
  });

  it('warns loudly on the first degradation, naming the impact', () => {
    const logger = sink();
    const tracker = new DegradationTracker(
      logger,
      () => 'fixed-id',
      () => 1_000,
    );

    tracker.enter('WafMiddleware', 'ping threw', 'no IP is blocked', new Error('boom'));

    expect(logger.warn).toHaveBeenCalledTimes(1);
    const message = String(logger.warn.mock.calls[0]?.[0]);
    expect(message).toContain('WafMiddleware');
    expect(message).toContain('DEGRADED');
    expect(message).toContain('degradationId=fixed-id');
    expect(message).toContain('no IP is blocked');
    expect(message).toContain('Alert on this line');
    expect(message).toContain('cause=ping threw');
    expect(message).toContain('error=Error: boom');
    expect(logger.warn.mock.calls[0]?.[1]).toBe('WafMiddleware');
  });

  it('warns once per episode, not once per event', () => {
    // A repeated WARN per probe would bury the single line an alert watches for.
    const logger = sink();
    const tracker = new DegradationTracker(
      logger,
      () => 'fixed-id',
      () => 1_000,
    );

    tracker.enter('WafMiddleware', 'ping threw', 'impact');
    tracker.enter('WafMiddleware', 'ping threw', 'impact');
    tracker.countEvent();
    tracker.countEvent();

    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(tracker.snapshot().degradedEvents).toBe(2);
  });

  it('keeps the same correlation id for the whole episode so one grep finds it all', () => {
    const ids: string[] = [];
    let counter = 0;
    const tracker = new DegradationTracker(
      sink(),
      () => `id-${(counter += 1)}`,
      () => 1_000,
    );

    tracker.enter('WafMiddleware', 'a', 'impact');
    ids.push(tracker.snapshot().degradationId ?? '');
    tracker.enter('WafMiddleware', 'b', 'impact');
    ids.push(tracker.snapshot().degradationId ?? '');

    expect(ids).toEqual(['id-1', 'id-1']);
  });

  it('records the time the episode started', () => {
    let clock = 5_000;
    const tracker = new DegradationTracker(
      sink(),
      () => 'fixed-id',
      () => clock,
    );

    tracker.enter('WafMiddleware', 'a', 'impact');
    clock = 9_000;

    expect(tracker.snapshot().degradedSinceMs).toBe(5_000);
  });

  it('closes the episode with one INFO that states the downtime', () => {
    const logger = sink();
    let clock = 1_000;
    const tracker = new DegradationTracker(
      logger,
      () => 'fixed-id',
      () => clock,
    );
    tracker.enter('WafMiddleware', 'a', 'impact');
    tracker.countEvent();
    clock = 61_000;

    tracker.leave('WafMiddleware', 'shared Valkey counters');

    expect(logger.info).toHaveBeenCalledTimes(1);
    const message = String(logger.info.mock.calls[0]?.[0]);
    expect(message).toContain('recovered to shared Valkey counters');
    expect(message).toContain('degradationId=fixed-id');
    expect(message).toContain('downtimeMs=60000');
    expect(tracker.isDegraded).toBe(false);
  });

  it('counts episodes, so an outage that already recovered is still visible afterwards', () => {
    const tracker = new DegradationTracker(
      sink(),
      () => 'fixed-id',
      () => 1_000,
    );

    tracker.enter('WafMiddleware', 'a', 'impact');
    tracker.leave('WafMiddleware', 'x');
    tracker.enter('WafMiddleware', 'b', 'impact');

    expect(tracker.snapshot().degradationCount).toBe(2);
  });

  it('is a no-op when leaving while already healthy', () => {
    const logger = sink();
    const tracker = new DegradationTracker(
      logger,
      () => 'fixed-id',
      () => 1_000,
    );

    tracker.leave('WafMiddleware', 'x');

    expect(logger.info).not.toHaveBeenCalled();
  });

  it('starts a new episode with a fresh correlation id after a recovery', () => {
    const logger = sink();
    const ids: string[] = [];
    let counter = 0;
    const tracker = new DegradationTracker(
      logger,
      () => `id-${(counter += 1)}`,
      () => 1_000,
    );

    tracker.enter('WafMiddleware', 'a', 'impact');
    ids.push(tracker.snapshot().degradationId ?? '');
    tracker.leave('WafMiddleware', 'x');
    tracker.enter('WafMiddleware', 'b', 'impact');
    ids.push(tracker.snapshot().degradationId ?? '');

    expect(ids).toEqual(['id-1', 'id-2']);
  });

  it('omits the error suffix when there is no error', () => {
    const logger = sink();
    const tracker = new DegradationTracker(
      logger,
      () => 'fixed-id',
      () => 1_000,
    );

    tracker.enter('WafMiddleware', 'ping returned CLUSTERDOWN', 'impact');

    expect(String(logger.warn.mock.calls[0]?.[0])).not.toContain('error=');
  });
});
