import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  index,
  integer,
} from 'drizzle-orm/pg-core';
import { createId } from '@paralleldrive/cuid2';

export const bookSales = pgTable(
  'book_sales',
  {
    id: uuid('id').default(createId()).primaryKey(),
    bookId: uuid('book_id').notNull(),
    sellerId: uuid('seller_id').notNull(),
    buyerId: uuid('buyer_id').notNull(),
    salePrice: integer('sale_price').notNull(),
    currency: varchar('currency', { length: 3 }).notNull().default('EGP'),
    saleType: varchar('sale_type', { length: 20 }).notNull().default('digital'),
    purchasedAt: timestamp('purchased_at').defaultNow().notNull(),
  },
  (table) => ({
    bookIdIdx: index('book_sales_book_id_idx').on(table.bookId),
    buyerIdIdx: index('book_sales_buyer_id_idx').on(table.buyerId),
    sellerIdIdx: index('book_sales_seller_id_idx').on(table.sellerId),
  })
);

export type BookSale = typeof bookSales.$inferSelect;
export type NewBookSale = typeof bookSales.$inferInsert;
