import type { Server } from 'http';
import { createHash } from 'crypto';

import { EventEmitter2 } from '@nestjs/event-emitter';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { ValidationPipe } from '@nestjs/common';
import type { ArgumentMetadata, INestApplication } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import request from 'supertest';

import { AppModule } from '../../app.module.ts';
import { AccountType, AdminRole } from '../../common/constants/roles.ts';
import { EncryptionService } from '../../common/utils/encryption.util.ts';
import { WinstonLoggerService } from '../../common/services/winston-logger.service.ts';
import { ValkeyService } from '../../common/services/valkey.service.ts';
import { UsersEventHandler } from '../../modules/users/events/users.event-handler.ts';
import { SanityService } from '../../modules/stories/sanity/sanity.service.ts';
import { USERS_REPOSITORY } from '../../modules/users/interfaces/users-repository.interface.ts';
import { UsersRepository } from '../../modules/users/repositories/users.repository.ts';
import { db } from '../../db/index.ts';
import { currentTestDatabase } from './test-database-scope.ts';
import { cleanValkey } from './test-isolation.util.ts';

export const TEST_PASSWORD = 'SecurePass123!';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthResponseBody {
  user: {
    id: string;
    email: string;
    name: string;
    username: string;
    accountType: string;
  };
  tokens: AuthTokens;
}

export interface StoryResponseBody {
  id: string;
  title: string;
  slug: string;
  content: string | null;
  status: string;
  viewCount: number;
  authorId: string;
  categoryId: string | null;
  publishedAt: string | null;
}

export interface CategoryResponseBody {
  id: string;
  name: string;
  slug: string;
}

export interface UserIdentity {
  id: string;
  email: string;
  username: string;
  name: string;
  accountType: string;
}

export interface TestUser extends UserIdentity {
  accessToken: string;
  refreshToken: string;
}

export interface RegisterUserOptions {
  prefix?: string;
  name?: string;
  password?: string;
}

export interface CreateStoryOptions {
  title?: string;
  slug?: string;
  content?: string;
  categoryId?: string;
  excerpt?: string;
}

export interface TestContextOverrides {
  eventHandlers?: Record<string, () => Promise<void>>;
}

export interface TestContext {
  readonly app: INestApplication;
  readonly httpServer: Server;
  readonly namespace: string;
  readonly valkeyService: ValkeyService;
  readonly dbName: string;
  uniqueEmail(prefix?: string): string;
  uniqueUsername(prefix?: string): string;
  uniqueSlug(prefix?: string): string;
  registerUser(options?: RegisterUserOptions): Promise<TestUser>;
  login(email: string, password?: string): Promise<AuthTokens>;
  registerAndLogin(options?: RegisterUserOptions): Promise<TestUser>;
  promoteToAdmin(userId: string, adminRole?: AdminRole): Promise<void>;
  createCategory(accessToken: string, options?: { name?: string; slug?: string }): Promise<CategoryResponseBody>;
  createStory(accessToken: string, options?: CreateStoryOptions): Promise<StoryResponseBody>;
  countRows(table: CountableTable): Promise<number>;
  close(): Promise<void>;
}

interface CountRow extends Record<string, unknown> {
  count: string;
}

export type CountableTable = 'stories' | 'users' | 'categories';

const COUNTABLE_TABLES: readonly CountableTable[] = ['stories', 'users', 'categories'];

function quoteTableName(table: CountableTable): string {
  if (!COUNTABLE_TABLES.includes(table)) {
    throw new Error(`Refusing to count unknown table "${table}"`);
  }
  return `"${table}"`;
}

function sanitiseUsername(value: string): string {
  return value.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 16);
}

export function createTestValidationPipe(): ValidationPipe {
  return new (class extends ValidationPipe {
    protected override toValidate(metadata: ArgumentMetadata): boolean {
      if (typeof metadata.metatype !== 'function') {
        return false;
      }
      return super.toValidate(metadata);
    }
  })({
    whitelist: true,
    transform: true,
    forbidNonWhitelisted: true,
    transformOptions: { enableImplicitConversion: true },
  });
}

function expectStatus(response: { status: number; body: unknown }, operation: string): void {
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`${operation} returned ${response.status}: ${JSON.stringify(response.body).slice(0, 500)}`);
  }
}

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return */
export async function createTestContext(overrides: TestContextOverrides = {}): Promise<TestContext> {
  const namespace = createHash('sha1').update(currentTestDatabase.databaseName).digest('hex').slice(0, 8);
  let sequence = 0;
  const valkeyService = new ValkeyService();
  await valkeyService.onModuleInit();
  await cleanValkey(valkeyService);

  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
    providers: [
      { provide: 'REFLECTOR', useValue: new Reflector() },
      WinstonLoggerService,
      ValkeyService,
      EventEmitter2,
      UsersRepository,
      { provide: USERS_REPOSITORY, useExisting: UsersRepository },
    ],
  })
    .overrideProvider(UsersEventHandler)
    .useValue({
      handleUserRegistered: () => Promise.resolve(),
      handleUserUpdated: () => Promise.resolve(),
      ...overrides.eventHandlers,
    })
    .overrideProvider(EncryptionService)
    .useValue({
      encrypt: (plaintext: string) => plaintext,
      decrypt: (ciphertext: string) => ciphertext,
    })
    .overrideProvider(SanityService)
    .useValue({
      isEnabled: () => false,
      syncStoryToSanity: () => ({ success: true }),
      deleteStoryFromSanity: () => ({ success: true }),
      syncAllStories: () => [],
    })
    .compile();

  const app = moduleRef.createNestApplication();
  app.useGlobalPipes(createTestValidationPipe());
  await app.init();
  const httpServer = app.getHttpServer() as Server;

  const nextToken = (): string => {
    sequence += 1;
    return `${namespace}${sequence.toString(36)}`;
  };

  const uniqueEmail = (prefix = 'user'): string => `${prefix}-${nextToken()}@example.com`;
  const uniqueUsername = (prefix = 'user'): string => `${sanitiseUsername(prefix)}_${nextToken()}`;
  const uniqueSlug = (prefix = 'story'): string => `${prefix}-${nextToken()}`;

  const login = async (email: string, password: string = TEST_PASSWORD): Promise<AuthTokens> => {
    const response = await request(httpServer).post('/auth/login').send({ email, password });
    expectStatus(response, 'POST /auth/login');
    return (response.body as AuthResponseBody).tokens;
  };

  const registerUser = async (options: RegisterUserOptions = {}): Promise<TestUser> => {
    const prefix = options.prefix ?? 'user';
    const email = uniqueEmail(prefix);
    const username = uniqueUsername(prefix);
    const name = options.name ?? `Test ${prefix}`;

    const response = await request(httpServer)
      .post('/auth/register')
      .send({ email, username, name, password: options.password ?? TEST_PASSWORD });

    expectStatus(response, `POST /auth/register (${email})`);
    const body = response.body as AuthResponseBody;
    return {
      ...body.user,
      accessToken: body.tokens.accessToken,
      refreshToken: body.tokens.refreshToken,
    };
  };

  const registerAndLogin = async (options: RegisterUserOptions = {}): Promise<TestUser> => {
    const user = await registerUser(options);
    const tokens = await login(user.email, options.password ?? TEST_PASSWORD);
    return { ...user, accessToken: tokens.accessToken, refreshToken: tokens.refreshToken };
  };

  const promoteToAdmin = async (userId: string, adminRole: AdminRole = AdminRole.SUPER_ADMIN): Promise<void> => {
    await db.execute(sql`
      UPDATE users
      SET account_type = ${AccountType.ADMIN}, admin_role = ${adminRole}
      WHERE id = ${userId}
    `);
  };

  const createCategory = async (
    accessToken: string,
    options: { name?: string; slug?: string } = {},
  ): Promise<CategoryResponseBody> => {
    const response = await request(httpServer)
      .post('/categories')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        name: options.name ?? `Category ${nextToken()}`,
        slug: options.slug ?? uniqueSlug('category'),
      });
    expectStatus(response, 'POST /categories');
    return response.body as CategoryResponseBody;
  };

  const createStory = async (accessToken: string, options: CreateStoryOptions = {}): Promise<StoryResponseBody> => {
    const response = await request(httpServer)
      .post('/stories')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        title: options.title ?? `Story ${nextToken()}`,
        slug: options.slug ?? uniqueSlug('story'),
        content: options.content ?? '<p>Test story content</p>',
        ...(options.categoryId === undefined ? {} : { categoryId: options.categoryId }),
        ...(options.excerpt === undefined ? {} : { excerpt: options.excerpt }),
      });
    expectStatus(response, `POST /stories (${options.slug ?? 'generated slug'})`);
    return response.body as StoryResponseBody;
  };

  const countRows = async (table: CountableTable): Promise<number> => {
    const result = await db.execute<CountRow>(sql.raw(`SELECT count(*)::text AS count FROM ${quoteTableName(table)}`));
    const row = result.rows[0];
    return row === undefined ? 0 : Number(row.count);
  };

  const close = async (): Promise<void> => {
    await app.close();
    await cleanValkey(valkeyService);
    await valkeyService.onModuleDestroy();
  };

  return {
    app,
    httpServer,
    namespace,
    valkeyService,
    dbName: currentTestDatabase.databaseName,
    uniqueEmail,
    uniqueUsername,
    uniqueSlug,
    registerUser,
    login,
    registerAndLogin,
    promoteToAdmin,
    createCategory,
    createStory,
    countRows,
    close,
  };
}
