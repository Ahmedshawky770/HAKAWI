import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  boolean,
  index,
} from 'drizzle-orm/pg-core';

export const users = pgTable(
  'users',
  {
    id: uuid('id').$defaultFn(() => crypto.randomUUID()).primaryKey(),
    googleId: varchar('google_id', { length: 255 }),
    facebookId: varchar('facebook_id', { length: 255 }),
    twitterId: varchar('twitter_id', { length: 255 }),
    githubId: varchar('github_id', { length: 255 }),
    appleId: varchar('apple_id', { length: 255 }),
    tiktokId: varchar('tiktok_id', { length: 255 }),
    username: varchar('username', { length: 50 }).notNull(),
    email: varchar('email', { length: 255 }).notNull(),
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
    emailVerified: boolean('email_verified').default(false),
    emailVerificationToken: varchar('email_verification_token', { length: 255 }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    googleIdUnique: index('users_google_id_idx').on(table.googleId),
    facebookIdUnique: index('users_facebook_id_idx').on(table.facebookId),
    twitterIdUnique: index('users_twitter_id_idx').on(table.twitterId),
    githubIdUnique: index('users_github_id_idx').on(table.githubId),
    appleIdUnique: index('users_apple_id_idx').on(table.appleId),
    tiktokIdUnique: index('users_tiktok_id_idx').on(table.tiktokId),
    usernameUnique: index('users_username_idx').on(table.username),
    emailUnique: index('users_email_idx').on(table.email),
    accountTypeIdx: index('users_account_type_idx').on(table.accountType),
    emailVerificationTokenIdx: index('users_email_verification_token_idx').on(table.emailVerificationToken),
  })
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
