import { describe, it, expect, beforeEach, vi } from 'vitest';
import { eq } from 'drizzle-orm';

import { users } from '../../../db/schema/users.schema.ts';
import {
  installMockDb,
  callsOf,
  firstArgsOf,
  type MockChain,
  type MockDbControl,
} from '../../../test/helpers/mock-db.ts';

import { UsersRepository } from './users.repository.ts';

const db = vi.hoisted(() => ({
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
}));

vi.mock('../../../db/index.ts', () => ({ db, default: db }));

const logger = vi.hoisted(() => ({
  info: vi.fn(),
  log: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
  verbose: vi.fn(),
}));

vi.mock('../../../common/services/winston-logger.service.ts', () => ({
  WinstonLoggerService: class {
    info = logger.info;
    log = logger.log;
    error = logger.error;
    warn = logger.warn;
    debug = logger.debug;
    verbose = logger.verbose;
  },
}));

const USER_ID = '11111111-1111-4111-8111-111111111111';
const EMAIL = 'noor@example.com';
const USERNAME = 'noor';

describe('UsersRepository', () => {
  let repository: UsersRepository;
  let chains: MockChain[];
  let control: MockDbControl;

  /** The `where` clause the nth query built in this test was given. */
  const whereOf = (index = 0): unknown => firstArgsOf(chains[index]!, 'where')?.[0];

  beforeEach(() => {
    vi.clearAllMocks();
    control = installMockDb(db);
    chains = control.chains();
    repository = new UsersRepository(logger as never);
  });

  describe('findById', () => {
    it('returns the user when one matches', async () => {
      control.queue([{ id: USER_ID, email: EMAIL, username: USERNAME }]);

      await expect(repository.findById(USER_ID)).resolves.toMatchObject({ id: USER_ID, email: EMAIL });
      expect(db.select).toHaveBeenCalledTimes(1);
    });

    it('reads a single row from the users table by primary key', async () => {
      control.queue([{ id: USER_ID }]);

      await repository.findById(USER_ID);

      expect(firstArgsOf(chains[0]!, 'from')).toEqual([users]);
      expect(whereOf()).toEqual(eq(users.id, USER_ID));
      expect(firstArgsOf(chains[0]!, 'limit')).toEqual([1]);
    });

    it('returns null when the select yields no row', async () => {
      control.queue([]);

      await expect(repository.findById(USER_ID)).resolves.toBeNull();
    });

    it('returns null instead of throwing on an invalid-uuid database error', async () => {
      control.queueRejection(Object.assign(new Error('invalid input syntax for uuid'), { code: '22P02' }));

      await expect(repository.findById('not-a-uuid')).resolves.toBeNull();
    });

    it('rethrows any other database error', async () => {
      const failure = Object.assign(new Error('connection terminated'), { code: '08006' });
      control.queueRejection(failure);

      await expect(repository.findById(USER_ID)).rejects.toBe(failure);
    });
  });

  describe('findByEmail', () => {
    it('returns the user when one matches', async () => {
      control.queue([{ id: USER_ID, email: EMAIL }]);

      await expect(repository.findByEmail(EMAIL)).resolves.toMatchObject({ id: USER_ID });
    });

    it('narrows the read to the email column', async () => {
      control.queue([{ id: USER_ID }]);

      await repository.findByEmail(EMAIL);

      expect(whereOf()).toEqual(eq(users.email, EMAIL));
    });

    it('returns null when no user owns that email', async () => {
      control.queue([]);

      await expect(repository.findByEmail(EMAIL)).resolves.toBeNull();
    });

    it('propagates a database error instead of swallowing it', async () => {
      // Only findById translates pg code 22P02 into "no such user"; every other lookup
      // must surface the failure so a broken login is not reported as a missing account.
      const failure = Object.assign(new Error('invalid input syntax for uuid'), { code: '22P02' });
      control.queueRejection(failure);

      await expect(repository.findByEmail(EMAIL)).rejects.toBe(failure);
    });
  });

  describe('findByUsername', () => {
    it('returns the user when one matches', async () => {
      control.queue([{ id: USER_ID, username: USERNAME }]);

      await expect(repository.findByUsername(USERNAME)).resolves.toMatchObject({ id: USER_ID });
    });

    it('narrows the read to the username column', async () => {
      control.queue([{ id: USER_ID }]);

      await repository.findByUsername(USERNAME);

      expect(whereOf()).toEqual(eq(users.username, USERNAME));
    });

    it('returns null when the username is taken by nobody', async () => {
      control.queue([]);

      await expect(repository.findByUsername(USERNAME)).resolves.toBeNull();
    });
  });

  describe('findByGoogleId', () => {
    it('returns the user linked to that Google subject id', async () => {
      control.queue([{ id: USER_ID, googleId: 'google-1' }]);

      await expect(repository.findByGoogleId('google-1')).resolves.toMatchObject({ id: USER_ID });
    });

    it('looks the id up on the google_id column, not the primary key', async () => {
      control.queue([{ id: USER_ID }]);

      await repository.findByGoogleId('google-1');

      expect(whereOf()).toEqual(eq(users.googleId, 'google-1'));
    });

    it('returns null when no account is linked to that Google subject id', async () => {
      control.queue([]);

      await expect(repository.findByGoogleId('google-1')).resolves.toBeNull();
    });
  });

  describe('findByFacebookId', () => {
    it('looks the id up on the facebook_id column', async () => {
      control.queue([{ id: USER_ID, facebookId: 'fb-1' }]);

      await expect(repository.findByFacebookId('fb-1')).resolves.toMatchObject({ id: USER_ID });
      expect(whereOf()).toEqual(eq(users.facebookId, 'fb-1'));
    });

    it('returns null when no account is linked to that Facebook id', async () => {
      control.queue([]);

      await expect(repository.findByFacebookId('fb-1')).resolves.toBeNull();
    });
  });

  describe('findByTwitterId', () => {
    it('looks the id up on the twitter_id column', async () => {
      control.queue([{ id: USER_ID, twitterId: 'tw-1' }]);

      await expect(repository.findByTwitterId('tw-1')).resolves.toMatchObject({ id: USER_ID });
      expect(whereOf()).toEqual(eq(users.twitterId, 'tw-1'));
    });

    it('returns null when no account is linked to that Twitter id', async () => {
      control.queue([]);

      await expect(repository.findByTwitterId('tw-1')).resolves.toBeNull();
    });
  });

  describe('findByGithubId', () => {
    it('looks the id up on the github_id column', async () => {
      control.queue([{ id: USER_ID, githubId: 'gh-1' }]);

      await expect(repository.findByGithubId('gh-1')).resolves.toMatchObject({ id: USER_ID });
      expect(whereOf()).toEqual(eq(users.githubId, 'gh-1'));
    });

    it('returns null when no account is linked to that GitHub id', async () => {
      control.queue([]);

      await expect(repository.findByGithubId('gh-1')).resolves.toBeNull();
    });
  });

  describe('findByAppleId', () => {
    it('looks the id up on the apple_id column', async () => {
      control.queue([{ id: USER_ID, appleId: 'apple-1' }]);

      await expect(repository.findByAppleId('apple-1')).resolves.toMatchObject({ id: USER_ID });
      expect(whereOf()).toEqual(eq(users.appleId, 'apple-1'));
    });

    it('returns null when no account is linked to that Apple id', async () => {
      control.queue([]);

      await expect(repository.findByAppleId('apple-1')).resolves.toBeNull();
    });
  });

  describe('findByTiktokId', () => {
    it('looks the id up on the tiktok_id column', async () => {
      control.queue([{ id: USER_ID, tiktokId: 'tt-1' }]);

      await expect(repository.findByTiktokId('tt-1')).resolves.toMatchObject({ id: USER_ID });
      expect(whereOf()).toEqual(eq(users.tiktokId, 'tt-1'));
    });

    it('returns null when no account is linked to that TikTok id', async () => {
      control.queue([]);

      await expect(repository.findByTiktokId('tt-1')).resolves.toBeNull();
    });
  });

  describe('create', () => {
    it('inserts the row and returns the created user', async () => {
      control.queue([{ id: USER_ID, email: EMAIL, username: USERNAME }]);

      const created = await repository.create({
        email: EMAIL,
        username: USERNAME,
        name: 'Noor',
        passwordHash: null,
        accountType: 'reader',
      });

      expect(created).toMatchObject({ id: USER_ID });
      expect(db.insert).toHaveBeenCalledWith(users);
    });

    it('writes only the supplied fields, leaving provider ids to their database defaults', async () => {
      control.queue([{ id: USER_ID }]);

      await repository.create({
        email: EMAIL,
        username: USERNAME,
        name: 'Noor',
        passwordHash: 'hash',
        accountType: 'author',
        googleId: 'google-1',
      });

      expect(firstArgsOf(chains[0]!, 'values')).toEqual([
        {
          email: EMAIL,
          username: USERNAME,
          name: 'Noor',
          passwordHash: 'hash',
          accountType: 'author',
          googleId: 'google-1',
        },
      ]);
    });

    it('relies on returning() so an unset default comes back as the database computed it', async () => {
      control.queue([{ id: USER_ID, isVerified: false, accountType: 'reader' }]);

      const created = await repository.create({
        email: EMAIL,
        username: USERNAME,
        name: 'Noor',
        passwordHash: null,
        accountType: 'reader',
      });

      expect(created).toMatchObject({ isVerified: false, accountType: 'reader' });
      expect(callsOf(chains[0]!, 'returning')).toHaveLength(1);
    });
  });

  describe('update', () => {
    it('writes the patch, stamps updatedAt, and returns the updated row', async () => {
      control.queue([{ id: USER_ID, name: 'Noor A.' }]);

      const updated = await repository.update(USER_ID, { name: 'Noor A.' });

      expect(updated).toMatchObject({ name: 'Noor A.' });
      const [patch] = firstArgsOf(chains[0]!, 'set') as [Record<string, unknown>];
      expect(patch).toMatchObject({ name: 'Noor A.' });
      expect(patch.updatedAt).toBeInstanceOf(Date);
    });

    it('narrows the write to the requested row', async () => {
      control.queue([{ id: USER_ID }]);

      await repository.update(USER_ID, { onboardingCompleted: true });

      expect(whereOf()).toEqual(eq(users.id, USER_ID));
      expect(callsOf(chains[0]!, 'where')).toHaveLength(1);
      expect(db.update).toHaveBeenCalledWith(users);
    });
  });

  describe('softDelete', () => {
    it('stamps deletedAt instead of removing the row', async () => {
      control.queue([]);

      await repository.softDelete(USER_ID);

      const [patch] = firstArgsOf(chains[0]!, 'set') as [Record<string, unknown>];
      expect(patch.deletedAt).toBeInstanceOf(Date);
      expect(whereOf()).toEqual(eq(users.id, USER_ID));
      expect(db.delete).not.toHaveBeenCalled();
    });
  });
});
