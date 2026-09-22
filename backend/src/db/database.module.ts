import { Module } from '@nestjs/common';
import { db } from './index.js';
import { users } from './schema/users.schema.js';
import { stories } from './schema/stories.schema.js';
import { books } from './schema/books.schema.js';
import { notifications } from './schema/notifications.schema.js';
import { payments } from './schema/payments.schema.js';
import { contests } from './schema/contests.schema.js';
import { conversations } from './schema/conversations.schema.js';
import { messages } from './schema/messages.schema.js';
import { reports } from './schema/reports.schema.js';
import { moderationLogs } from './schema/moderation-logs.schema.js';
import { storyCategories } from './schema/story-categories.schema.js';
import { storyTags } from './schema/story-tags.schema.js';
import { storyViews } from './schema/story-views.schema.js';
import { bookSales } from './schema/book-sales.schema.js';
import { bookRentals } from './schema/book-rentals.schema.js';
import { bookReviews } from './schema/book-reviews.schema.js';
import { rentalExtensions } from './schema/rental-extensions.schema.js';
import { userLibraries } from './schema/user-libraries.schema.js';
import { transactions } from './schema/transactions.schema.js';
import { withdrawals } from './schema/withdrawals.schema.js';
import { refunds } from './schema/refunds.schema.js';
import { contestSubmissions } from './schema/contest-submissions.schema.js';
import { contestVotes } from './schema/contest-votes.schema.js';
import { contestBadges } from './schema/contest-badges.schema.js';
import { prizeTransactions } from './schema/prize-transactions.schema.js';
import { notificationPreferences } from './schema/notification-preferences.schema.js';
import { messageReadReceipts } from './schema/message-read-receipts.schema.js';
import { userRestrictions } from './schema/user-restrictions.schema.js';

@Module({
  providers: [
    { provide: 'DATABASE', useValue: db },
    { provide: 'USERS_SCHEMA', useValue: users },
    { provide: 'STORIES_SCHEMA', useValue: stories },
    { provide: 'BOOKS_SCHEMA', useValue: books },
    { provide: 'NOTIFICATIONS_SCHEMA', useValue: notifications },
    { provide: 'PAYMENTS_SCHEMA', useValue: payments },
    { provide: 'CONTESTS_SCHEMA', useValue: contests },
    { provide: 'CONVERSATIONS_SCHEMA', useValue: conversations },
    { provide: 'MESSAGES_SCHEMA', useValue: messages },
    { provide: 'REPORTS_SCHEMA', useValue: reports },
    { provide: 'MODERATION_LOGS_SCHEMA', useValue: moderationLogs },
    { provide: 'STORY_CATEGORIES_SCHEMA', useValue: storyCategories },
    { provide: 'STORY_TAGS_SCHEMA', useValue: storyTags },
    { provide: 'STORY_VIEWS_SCHEMA', useValue: storyViews },
    { provide: 'BOOK_SALES_SCHEMA', useValue: bookSales },
    { provide: 'BOOK_RENTALS_SCHEMA', useValue: bookRentals },
    { provide: 'BOOK_REVIEWS_SCHEMA', useValue: bookReviews },
    { provide: 'RENTAL_EXTENSIONS_SCHEMA', useValue: rentalExtensions },
    { provide: 'USER_LIBRARIES_SCHEMA', useValue: userLibraries },
    { provide: 'TRANSACTIONS_SCHEMA', useValue: transactions },
    { provide: 'WITHDRAWALS_SCHEMA', useValue: withdrawals },
    { provide: 'REFUNDS_SCHEMA', useValue: refunds },
    { provide: 'CONTEST_SUBMISSIONS_SCHEMA', useValue: contestSubmissions },
    { provide: 'CONTEST_VOTES_SCHEMA', useValue: contestVotes },
    { provide: 'CONTEST_BADGES_SCHEMA', useValue: contestBadges },
    { provide: 'PRIZE_TRANSACTIONS_SCHEMA', useValue: prizeTransactions },
    { provide: 'NOTIFICATION_PREFERENCES_SCHEMA', useValue: notificationPreferences },
    { provide: 'MESSAGE_READ_RECEIPTS_SCHEMA', useValue: messageReadReceipts },
    { provide: 'USER_RESTRICTIONS_SCHEMA', useValue: userRestrictions },
  ],
  exports: [
    'DATABASE',
    'USERS_SCHEMA',
    'STORIES_SCHEMA',
    'BOOKS_SCHEMA',
    'NOTIFICATIONS_SCHEMA',
    'PAYMENTS_SCHEMA',
    'CONTESTS_SCHEMA',
    'CONVERSATIONS_SCHEMA',
    'MESSAGES_SCHEMA',
    'REPORTS_SCHEMA',
    'MODERATION_LOGS_SCHEMA',
    'STORY_CATEGORIES_SCHEMA',
    'STORY_TAGS_SCHEMA',
    'STORY_VIEWS_SCHEMA',
    'BOOK_SALES_SCHEMA',
    'BOOK_RENTALS_SCHEMA',
    'BOOK_REVIEWS_SCHEMA',
    'RENTAL_EXTENSIONS_SCHEMA',
    'USER_LIBRARIES_SCHEMA',
    'TRANSACTIONS_SCHEMA',
    'WITHDRAWALS_SCHEMA',
    'REFUNDS_SCHEMA',
    'CONTEST_SUBMISSIONS_SCHEMA',
    'CONTEST_VOTES_SCHEMA',
    'CONTEST_BADGES_SCHEMA',
    'PRIZE_TRANSACTIONS_SCHEMA',
    'NOTIFICATION_PREFERENCES_SCHEMA',
    'MESSAGE_READ_RECEIPTS_SCHEMA',
    'USER_RESTRICTIONS_SCHEMA',
  ],
})
export class DatabaseModule {}
