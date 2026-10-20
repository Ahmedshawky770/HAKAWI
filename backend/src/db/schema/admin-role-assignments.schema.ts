import { pgTable, uuid, varchar, text, timestamp, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { users } from './users.schema.ts';

export const adminRoleAssignments = pgTable(
  'admin_role_assignments',
  {
    id: uuid('id')
      .$defaultFn(() => crypto.randomUUID())
      .primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    adminRole: varchar('admin_role', { length: 20 }).notNull(),
    assignedBy: uuid('assigned_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    reason: text('reason'),
    assignedAt: timestamp('assigned_at', { withTimezone: true }).defaultNow().notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    revokedBy: uuid('revoked_by').references(() => users.id, { onDelete: 'set null' }),
    revokeReason: text('revoke_reason'),
    environment: varchar('environment', { length: 20 }).notNull().default(sql`current_setting('app.environment', true)`),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
  },
  (table) => ({
    userIdIdx: index('admin_role_assignments_user_id_idx').on(table.userId),
    assignedByIdx: index('admin_role_assignments_assigned_by_idx').on(table.assignedBy),
    assignedAtIdx: index('admin_role_assignments_assigned_at_idx').on(table.assignedAt),
    activeIdx: index('admin_role_assignments_active_idx')
      .on(table.userId, table.adminRole)
      .where(sql`${table.revokedAt} IS NULL`),
  }),
);

export type AdminRoleAssignment = typeof adminRoleAssignments.$inferSelect;
export type NewAdminRoleAssignment = typeof adminRoleAssignments.$inferInsert;