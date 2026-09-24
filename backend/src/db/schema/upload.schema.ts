import { pgTable, uuid, varchar, text, timestamp, integer, boolean, index } from 'drizzle-orm/pg-core';

import { users, stories } from './index.ts';

export const uploads = pgTable(
  'uploads',
  {
    id: uuid('id').$defaultFn(() => crypto.randomUUID()).primaryKey(),
    filename: varchar('filename', { length: 255 }).notNull(),
    originalName: varchar('original_name', { length: 255 }).notNull(),
    mimetype: varchar('mimetype', { length: 100 }).notNull(),
    size: integer('size').notNull(),
    url: text('url').notNull(),
    cdnUrl: text('cdn_url'),
    uploadedById: uuid('uploaded_by_id').references(() => users.id),
    storyId: uuid('story_id').references(() => stories.id),
    deletedAt: timestamp('deleted_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    filenameIdx: index('uploads_filename_idx').on(table.filename),
    uploadedByIdx: index('uploads_uploaded_by_id_idx').on(table.uploadedById),
    storyIdx: index('uploads_story_id_idx').on(table.storyId),
  })
);

export type Upload = typeof uploads.$inferSelect;
export type NewUpload = typeof uploads.$inferInsert;
