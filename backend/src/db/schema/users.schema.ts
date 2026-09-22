import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  boolean,
  index,
  unique,
} from 'drizzle-orm/pg-core';
import { createId } from '@paralleldrive/cuid2';

export const users = pgTable(
  'users',
  {
    id: uuid('id').default(createId()).primaryKey(),
    googleId: varchar('google_id', { length: 255 }).unique(),
    facebookId: varchar('facebook_id', { length: 255 }).unique(),
    twitterId: varchar('twitter_id', { length: 255 }).unique(),
    githubId: varchar('github_id', { length: 255 }).unique(),
    appleId: varchar('apple_id', { length: 255 }).unique(),
    tiktokId: varchar('tiktok_id', { length: 255 }).unique(),
    username: varchar('username', { length: 50 }).notNull().unique(),
    email: varchar('email', { length: 255 }).notNull().unique(),
    passwordHash: varchar('password_hash', { length: 255 }),
    name: varchar('name', { length: 100 }).notNull(),
    avatar: text('avatar'),
    bio: text('bio'),
    accountType: varchar('account_type', { length: 20 }).notNull().default('reader'),
    adminRole: varchar('admin_role', { length: 20 }),
    isVerified: boolean('is_verified').default(false),
    onboardingCompleted: boolean('onboarding_completed').default(false),
    accessBlocked: boolean('access_blocked').default(false),
    lastLoginAt: timestamp('last_login_at'),
    deletedAt: timestamp('deleted_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    emailIdx: index('users_email_idx').on(table.email),
    usernameIdx: index('users_username_idx').on(table.username),
    accountTypeIdx: index('users_account_type_idx').on(table.accountType),
  })
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
