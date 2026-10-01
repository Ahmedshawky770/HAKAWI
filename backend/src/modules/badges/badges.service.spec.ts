import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { NotFoundException } from '@nestjs/common';

import { WinstonLoggerService } from '../../common/services/winston-logger.service.ts';
import type { NotificationsService } from '../notifications/notifications.service.ts';

import { BADGE_NOTIFICATION_TYPE, BadgesService } from './badges.service.ts';

type ChainBuilder = {
  then: (onfulfilled: (value: unknown) => unknown) => Promise<unknown>;
  from: Mock<(table: unknown) => ChainBuilder>;
  innerJoin: Mock<(table: unknown, clause: unknown) => ChainBuilder>;
  values: Mock<(values: Record<string, unknown>) => ChainBuilder>;
  where: Mock<(clause: unknown) => ChainBuilder>;
  orderBy: Mock<(clause: unknown) => ChainBuilder>;
  limit: Mock<(count: number) => ChainBuilder>;
  offset: Mock<(count: number) => ChainBuilder>;
  returning: Mock<() => ChainBuilder>;
};

type MockLogger = { info: Mock; log: Mock; error: Mock; warn: Mock; debug: Mock; verbose: Mock };

const db = vi.hoisted(() => ({
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
}));

vi.mock('../../db/index.ts', () => ({ db, default: db }));

const NOW = new Date('2026-01-01T00:00:00.000Z');
const USER_ID = '123e4567-e89b-12d3-a456-426614174000';
const BADGE_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

function makeChain(result: unknown): ChainBuilder {
  const chain: ChainBuilder = {
    then: (onfulfilled) => Promise.resolve(result).then(onfulfilled),
    from: vi.fn(() => chain),
    innerJoin: vi.fn(() => chain),
    values: vi.fn(() => chain),
    where: vi.fn(() => chain),
    orderBy: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    offset: vi.fn(() => chain),
    returning: vi.fn(() => chain),
  };
  return chain;
}

function badgeRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: BADGE_ID,
    name: 'Contest Champion',
    description: 'Won a writing contest',
    icon: 'trophy',
    criteria: 'contest-champion',
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function userBadgeRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { id: 'ub-1', userId: USER_ID, badgeId: BADGE_ID, awardedAt: NOW, awardedBy: null, ...overrides };
}

type MockNotificationsService = { create: Mock<(input: Record<string, unknown>) => Promise<unknown>> };

describe('BadgesService', () => {
  let service: BadgesService;
  let logger: MockLogger;
  let notifications: MockNotificationsService;

  beforeEach(() => {
    db.select.mockReset();
    db.insert.mockReset();
    db.update.mockReset();
    db.delete.mockReset();

    logger = { info: vi.fn(), log: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn(), verbose: vi.fn() };
    notifications = {
      create: vi.fn<(input: Record<string, unknown>) => Promise<unknown>>().mockResolvedValue({ id: 'notification-1' }),
    };

    service = new BadgesService(
      logger as unknown as WinstonLoggerService,
      notifications as unknown as NotificationsService,
    );
  });

  describe('listCatalog', () => {
    it('should expose every rule with its trigger and threshold', async () => {
      const catalog = await service.listCatalog();

      expect(catalog.length).toBeGreaterThan(0);
      for (const entry of catalog) {
        expect(entry.key).toEqual(expect.any(String));
        expect(entry.trigger).toEqual(expect.any(String));
        expect(entry.threshold).toEqual(expect.any(Number));
      }
    });
  });

  describe('findByUser', () => {
    it('should return an empty list for a user with no badges', async () => {
      db.select.mockReturnValue(makeChain([]));

      await expect(service.findByUser(USER_ID)).resolves.toEqual([]);
    });

    it('should map the joined rows to an awarded badge', async () => {
      db.select.mockReturnValue(makeChain([{ userBadge: userBadgeRow(), badge: badgeRow() }]));

      const [awarded] = await service.findByUser(USER_ID);

      expect(awarded).toMatchObject({
        id: 'ub-1',
        badgeId: BADGE_ID,
        badgeKey: 'Contest Champion',
        name: 'Contest Champion',
        icon: 'trophy',
      });
    });
  });

  describe('findByUserAndKey', () => {
    it('should reject a badge key that is not in the catalog', async () => {
      await expect(service.findByUserAndKey(USER_ID, 'not-a-badge')).rejects.toThrow(NotFoundException);
    });

    it('should reject a user who does not hold the badge', async () => {
      db.select.mockReturnValue(makeChain([]));

      await expect(service.findByUserAndKey(USER_ID, 'contest-champion')).rejects.toThrow(NotFoundException);
    });

    it('should return the awarded badge when the user holds it', async () => {
      db.select.mockReturnValue(makeChain([{ userBadge: userBadgeRow(), badge: badgeRow() }]));

      await expect(service.findByUserAndKey(USER_ID, 'contest-champion')).resolves.toMatchObject({
        badgeKey: 'Contest Champion',
      });
    });
  });

  describe('award', () => {
    it('should create the catalog row the first time a badge is won', async () => {
      db.select.mockReturnValueOnce(makeChain([]));
      const badgeChain = makeChain([badgeRow()]);
      db.insert.mockReturnValueOnce(badgeChain);
      db.select.mockReturnValueOnce(makeChain([]));
      const userBadgeChain = makeChain([userBadgeRow()]);
      db.insert.mockReturnValueOnce(userBadgeChain);

      await service.award(USER_ID, 'contest-champion', 'Contest Champion', 'Won a writing contest', 'trophy');

      expect(badgeChain.values).toHaveBeenCalledWith({
        name: 'Contest Champion',
        description: 'Won a writing contest',
        icon: 'trophy',
        criteria: 'contest-champion',
      });
      expect(userBadgeChain.values).toHaveBeenCalledWith({ userId: USER_ID, badgeId: BADGE_ID });
    });

    it('should reuse an existing catalog row', async () => {
      db.select.mockReturnValueOnce(makeChain([badgeRow()]));
      db.select.mockReturnValueOnce(makeChain([]));
      db.insert.mockReturnValue(makeChain([userBadgeRow()]));

      await service.award(USER_ID, 'contest-champion', 'Contest Champion', 'Won a writing contest', 'trophy');

      expect(db.insert).toHaveBeenCalledTimes(1);
    });

    it('should never award the same badge twice', async () => {
      db.select.mockReturnValueOnce(makeChain([badgeRow()]));
      db.select.mockReturnValueOnce(makeChain([{ id: 'ub-existing' }]));

      await expect(
        service.award(USER_ID, 'contest-champion', 'Contest Champion', 'Won a writing contest', 'trophy'),
      ).resolves.toBeNull();
      expect(db.insert).not.toHaveBeenCalled();
    });

    it('should persist a notification row the winner can see', async () => {
      db.select.mockReturnValueOnce(makeChain([badgeRow()]));
      db.select.mockReturnValueOnce(makeChain([]));
      db.insert.mockReturnValue(makeChain([userBadgeRow()]));

      await service.award(USER_ID, 'contest-champion', 'Contest Champion', 'Won a writing contest', 'trophy');

      // Announcing an event with a user_badges id in the notificationId field created no row,
      // so a badge award was invisible to the user it was meant to congratulate.
      expect(notifications.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: USER_ID,
          type: BADGE_NOTIFICATION_TYPE,
          title: 'Badge earned: Contest Champion',
          message: 'Won a writing contest',
        }),
      );
    });

    it('should not announce the award itself as a notification event', async () => {
      db.select.mockReturnValueOnce(makeChain([badgeRow()]));
      db.select.mockReturnValueOnce(makeChain([]));
      db.insert.mockReturnValue(makeChain([userBadgeRow()]));

      await service.award(USER_ID, 'contest-champion', 'Contest Champion', 'Won a writing contest', 'trophy');

      // NotificationsService emits notification.created itself, with the real notification id.
      // Emitting it here too would announce one notification twice.
      expect(notifications.create).toHaveBeenCalledTimes(1);
    });

    it('should keep the award when the notification cannot be written', async () => {
      db.select.mockReturnValueOnce(makeChain([badgeRow()]));
      db.select.mockReturnValueOnce(makeChain([]));
      db.insert.mockReturnValue(makeChain([userBadgeRow()]));
      notifications.create.mockRejectedValueOnce(new Error('notifications is down'));

      await expect(
        service.award(USER_ID, 'contest-champion', 'Contest Champion', 'Won a writing contest', 'trophy'),
      ).resolves.toMatchObject({ badgeId: BADGE_ID });
      expect(logger.error).toHaveBeenCalledWith(
        'Could not record the badge notification for ' + USER_ID + ': notifications is down',
        undefined,
        'BadgesService',
      );
    });

    it('should award without a notification module rather than fail the award', async () => {
      const detached = new BadgesService(logger as unknown as WinstonLoggerService, undefined);
      db.select.mockReturnValueOnce(makeChain([badgeRow()]));
      db.select.mockReturnValueOnce(makeChain([]));
      db.insert.mockReturnValue(makeChain([userBadgeRow()]));

      await expect(
        detached.award(USER_ID, 'contest-champion', 'Contest Champion', 'Won a writing contest', 'trophy'),
      ).resolves.toMatchObject({ badgeId: BADGE_ID });
      expect(logger.warn).toHaveBeenCalledWith(
        'Badge contest-champion awarded to ' + USER_ID + ' but no notifications module is wired in',
        'BadgesService',
      );
    });

    it('should treat a concurrent duplicate award as nothing new rather than a server fault', async () => {
      db.select.mockReturnValueOnce(makeChain([badgeRow()]));
      db.select.mockReturnValueOnce(makeChain([]));
      // `user_badges_unique_idx` is the real guard: both awards pass the existence check and
      // the second insert is what fails.
      db.insert.mockReturnValue(makeChain([]));
      db.insert.mockImplementationOnce(() => {
        throw Object.assign(new Error('duplicate key value violates unique constraint'), { code: '23505' });
      });

      await expect(
        service.award(USER_ID, 'contest-champion', 'Contest Champion', 'Won a writing contest', 'trophy'),
      ).resolves.toBeNull();
      expect(notifications.create).not.toHaveBeenCalled();
    });

    it('should still surface a database failure that is not a duplicate award', async () => {
      db.select.mockReturnValueOnce(makeChain([badgeRow()]));
      db.select.mockReturnValueOnce(makeChain([]));
      db.insert.mockReturnValue(makeChain([]));
      db.insert.mockImplementationOnce(() => {
        throw Object.assign(new Error('connection terminated'), { code: '08006' });
      });

      await expect(
        service.award(USER_ID, 'contest-champion', 'Contest Champion', 'Won a writing contest', 'trophy'),
      ).rejects.toThrow('connection terminated');
    });
  });

  describe('evaluateForUser', () => {
    it('should do nothing for a trigger with no rules', async () => {
      await expect(service.evaluateForUser(USER_ID, 'contest.completed')).resolves.toEqual([]);
      expect(db.select).not.toHaveBeenCalled();
    });

    it('should measure each rule the trigger declares', async () => {
      db.select.mockReturnValue(makeChain([{ total: 0 }]));

      await service.evaluateForUser(USER_ID, 'user.followed');

      expect(db.select).toHaveBeenCalledTimes(2);
    });

    it('should award nothing when no threshold is met', async () => {
      db.select.mockReturnValue(makeChain([{ total: 0 }]));

      await expect(service.evaluateForUser(USER_ID, 'story.published')).resolves.toEqual([]);
      expect(db.insert).not.toHaveBeenCalled();
    });
  });

  describe('awardManual', () => {
    it('should reject an unknown badge key', async () => {
      await expect(service.awardManual(USER_ID, 'not-a-badge')).rejects.toThrow(NotFoundException);
    });

    it('should return the existing award on a repeat award', async () => {
      db.select.mockReturnValueOnce(makeChain([badgeRow()]));
      db.select.mockReturnValueOnce(makeChain([{ id: 'ub-existing' }]));
      db.select.mockReturnValueOnce(makeChain([{ userBadge: userBadgeRow(), badge: badgeRow() }]));

      await expect(service.awardManual(USER_ID, 'contest-champion')).resolves.toMatchObject({
        badgeKey: 'Contest Champion',
      });
    });
  });
});
