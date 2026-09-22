import { Module } from '@nestjs/common';
import { AuthModule } from './modules/auth/auth.module.js';
import { UsersModule } from './modules/users/users.module.js';
import { StoriesModule } from './modules/stories/stories.module.js';
import { BooksModule } from './modules/books/books.module.js';
import { NotificationsModule } from './modules/notifications/notifications.module.js';
import { PaymentsModule } from './modules/payments/payments.module.js';
import { ContestsModule } from './modules/contests/contests.module.js';
import { ConversationsModule } from './modules/conversations/conversations.module.js';
import { MessagesModule } from './modules/messages/messages.module.js';
import { ReportsModule } from './modules/reports/reports.module.js';
import { ModerationLogsModule } from './modules/moderation-logs/moderation-logs.module.js';
import { StoryCategoriesModule } from './modules/story-categories/story-categories.module.js';
import { StoryTagsModule } from './modules/story-tags/story-tags.module.js';
import { BookSalesModule } from './modules/book-sales/book-sales.module.js';
import { BookRentalsModule } from './modules/book-rentals/book-rentals.module.js';
import { BookReviewsModule } from './modules/book-reviews/book-reviews.module.js';
import { RentalExtensionsModule } from './modules/rental-extensions/rental-extensions.module.js';
import { UserLibrariesModule } from './modules/user-libraries/user-libraries.module.js';
import { TransactionsModule } from './modules/transactions/transactions.module.js';
import { WithdrawalsModule } from './modules/withdrawals/withdrawals.module.js';
import { RefundsModule } from './modules/refunds/refunds.module.js';
import { ContestSubmissionsModule } from './modules/contest-submissions/contest-submissions.module.js';
import { ContestVotesModule } from './modules/contest-votes/contest-votes.module.js';
import { ContestBadgesModule } from './modules/contest-badges/contest-badges.module.js';
import { PrizeTransactionsModule } from './modules/prize-transactions/prize-transactions.module.js';
import { NotificationPreferencesModule } from './modules/notification-preferences/notification-preferences.module.js';
import { MessageReadReceiptsModule } from './modules/message-read-receipts/message-read-receipts.module.js';
import { UserRestrictionsModule } from './modules/user-restrictions/user-restrictions.module.js';
import { DatabaseModule } from './db/database.module.js';
import { CommonModule } from './common/common.module.js';

@Module({
  imports: [
    DatabaseModule,
    CommonModule,
    AuthModule,
    UsersModule,
    StoriesModule,
    BooksModule,
    NotificationsModule,
    PaymentsModule,
    ContestsModule,
    ConversationsModule,
    MessagesModule,
    ReportsModule,
    ModerationLogsModule,
    StoryCategoriesModule,
    StoryTagsModule,
    BookSalesModule,
    BookRentalsModule,
    BookReviewsModule,
    RentalExtensionsModule,
    UserLibrariesModule,
    TransactionsModule,
    WithdrawalsModule,
    RefundsModule,
    ContestSubmissionsModule,
    ContestVotesModule,
    ContestBadgesModule,
    PrizeTransactionsModule,
    NotificationPreferencesModule,
    MessageReadReceiptsModule,
    UserRestrictionsModule,
  ],
})
export class AppModule {}
