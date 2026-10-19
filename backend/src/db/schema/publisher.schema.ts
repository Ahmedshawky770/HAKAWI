import { pgTable, uuid, varchar, text, timestamp, index, unique, boolean, integer } from 'drizzle-orm/pg-core';

import { users } from './index.ts';

export const PUBLISHER_APPLICATION_STATUSES = ['pending', 'approved', 'rejected'] as const;

export type PublisherApplicationStatus = (typeof PUBLISHER_APPLICATION_STATUSES)[number];

export const publisherApplications = pgTable(
  'publisher_applications',
  {
    id: uuid('id')
      .$defaultFn(() => crypto.randomUUID())
      .primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    companyName: varchar('company_name', { length: 255 }).notNull(),
    companyWebsite: varchar('company_website', { length: 500 }),
    companyAddress: text('company_address'),
    taxId: varchar('tax_id', { length: 100 }),
    contactName: varchar('contact_name', { length: 255 }).notNull(),
    contactEmail: varchar('contact_email', { length: 255 }).notNull(),
    contactPhone: varchar('contact_phone', { length: 32 }),
    description: text('description').notNull(),
    status: varchar('status', { length: 20, enum: PUBLISHER_APPLICATION_STATUSES }).notNull().default('pending'),
    reviewedBy: uuid('reviewed_by').references(() => users.id),
    reviewedAt: timestamp('reviewed_at'),
    rejectionReason: text('rejection_reason'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    userIdIdx: index('publisher_applications_user_id_idx').on(table.userId),
    statusIdx: index('publisher_applications_status_idx').on(table.status),
    reviewedByIdx: index('publisher_applications_reviewed_by_idx').on(table.reviewedBy),
    userIdUnique: unique('publisher_applications_user_id_unique').on(table.userId),
  }),
);

export const publisherWriters = pgTable(
  'publisher_writers',
  {
    id: uuid('id')
      .$defaultFn(() => crypto.randomUUID())
      .primaryKey(),
    publisherId: uuid('publisher_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    writerId: uuid('writer_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    commissionRate: integer('commission_rate').notNull().default(15),
    status: varchar('status', { length: 20 }).notNull().default('active'),
    notes: text('notes'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    publisherIdIdx: index('publisher_writers_publisher_id_idx').on(table.publisherId),
    writerIdIdx: index('publisher_writers_writer_id_idx').on(table.writerId),
    publisherWriterUnique: unique('publisher_writers_publisher_writer_unique').on(table.publisherId, table.writerId),
  }),
);

export type PublisherApplication = typeof publisherApplications.$inferSelect;
export type NewPublisherApplication = typeof publisherApplications.$inferInsert;
export type PublisherWriter = typeof publisherWriters.$inferSelect;
export type NewPublisherWriter = typeof publisherWriters.$inferInsert;