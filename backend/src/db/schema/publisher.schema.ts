import { pgTable, uuid, varchar, text, timestamp, index, unique, boolean, integer, date } from 'drizzle-orm/pg-core';

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
    registrantName: varchar('registrant_name', { length: 255 }),
    registrantPhone: varchar('registrant_phone', { length: 32 }),
    registrantRole: varchar('registrant_role', { length: 50 }),
    tradingName: varchar('trading_name', { length: 255 }),
    nameEn: varchar('name_en', { length: 255 }),
    entityType: varchar('entity_type', { length: 50 }),
    province: varchar('province', { length: 100 }),
    city: varchar('city', { length: 100 }),
    logoUrl: varchar('logo_url', { length: 500 }),
    website: varchar('website', { length: 500 }),
    socialLinks: text('social_links'),
    crIssuer: varchar('cr_issuer', { length: 255 }),
    crExpiry: date('cr_expiry', { mode: 'date' }),
    activityType: varchar('activity_type', { length: 100 }),
    vatRegistered: boolean('vat_registered'),
    isbnPrefix: varchar('isbn_prefix', { length: 50 }),
    legalRepName: varchar('legal_rep_name', { length: 255 }),
    legalRepNationalId: varchar('legal_rep_national_id', { length: 20 }),
    legalRepTitle: varchar('legal_rep_title', { length: 100 }),
    legalRepPhone: varchar('legal_rep_phone', { length: 32 }),
    officialEmail: varchar('official_email', { length: 255 }),
    phone: varchar('phone', { length: 32 }),
    whatsapp: varchar('whatsapp', { length: 32 }),
    supportEmail: varchar('support_email', { length: 255 }),
    bio: text('bio'),
    publishingFields: text('publishing_fields'),
    foundedYear: integer('founded_year'),
    titleCount: integer('title_count'),
    crImageUrl: varchar('cr_image_url', { length: 500 }),
    taxCardImageUrl: varchar('tax_card_image_url', { length: 500 }),
    idCardFrontUrl: varchar('id_card_front_url', { length: 500 }),
    idCardBackUrl: varchar('id_card_back_url', { length: 500 }),
    authorizationLetterUrl: varchar('authorization_letter_url', { length: 500 }),
    delegateIdCardUrl: varchar('delegate_id_card_url', { length: 500 }),
    depositCertificateUrl: varchar('deposit_certificate_url', { length: 500 }),
    bankAccountName: varchar('bank_account_name', { length: 255 }),
    bankName: varchar('bank_name', { length: 255 }),
    iban: varchar('iban', { length: 34 }),
    swiftCode: varchar('swift_code', { length: 20 }),
    termsAccepted: boolean('terms_accepted').notNull().default(false),
    privacyAccepted: boolean('privacy_accepted').notNull().default(false),
    dataAccuracyAccepted: boolean('data_accuracy_accepted').notNull().default(false),
    copyrightAccepted: boolean('copyright_accepted').notNull().default(false),
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