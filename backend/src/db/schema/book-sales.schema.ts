import { pgTable, uuid, varchar, text, timestamp, boolean, index } from 'drizzle-orm/pg-core';
import { createId } from '@paralleldrive/cuid2';

export const bookSales = pgTable(
  'book_sales',
  {
    id: uuid('id').default(createId()).primaryKey(),
    bookId: uuid('book_id').notNull(),
    sellerId: uuid('seller_id').notNull(),
    buyerId: uuid('buyer_id').notNull(),
    salePrice: varchar('sale_price', { length: 20 }).notNull(),
    currency: varchar('currency', { length: 3 }).notNull().default('USD'),
    saleType: varchar('sale_type', { length: 20 }).notNull(),
    purchasedAt: timestamp('purchased_at').defaultNow().notNull(),
  },
  (table) => ({
    bookIdIdx: index('book_sales_book_id_idx').on(table.bookId),
    sellerIdIdx: index('book_sales_seller_id_idx').on(table.sellerId),
    buyerIdIdx: index('book_sales_buyer_id_idx').on(table.buyerId),
    purchasedAtIdx: index('book_sales_purchased_at_idx').on(table.purchasedAt),
  })
);

export type BookSale = typeof bookSales.$inferSelect;
export type NewBookSale = typeof bookSales.$inferInsert;
