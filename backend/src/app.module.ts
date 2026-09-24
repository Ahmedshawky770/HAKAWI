import { Module } from '@nestjs/common';

import { AuthModule } from './modules/auth/auth.module.ts';
import { UsersModule } from './modules/users/users.module.ts';
import { StoriesModule } from './modules/stories/stories.module.ts';
import { CategoriesModule } from './modules/categories/categories.module.ts';
import { TagsModule } from './modules/tags/tags.module.ts';
import { SearchModule } from './modules/search/search.module.ts';
import { FollowsModule } from './modules/follows/follows.module.ts';
import { ReactionsModule } from './modules/reactions/reactions.module.ts';
import { CommentsModule } from './modules/comments/comments.module.ts';
import { NotificationsModule } from './modules/notifications/notifications.module.ts';
import { MessagesModule } from './modules/messages/messages.module.ts';
import { DatabaseModule } from './db/database.module.ts';
import { CommonModule } from './common/common.module.ts';
import { UploadModule } from './modules/upload/upload.module.ts';
import { ModerationModule } from './modules/moderation/moderation.module.ts';
import { BooksModule } from './modules/books/books.module.ts';
import { PaymentsModule } from './modules/payments/payments.module.ts';
import { RentalsModule } from './modules/rentals/rentals.module.ts';
import { LibraryModule } from './modules/library/library.module.ts';
import { ContestsModule } from './modules/contests/contests.module.ts';

@Module({
  imports: [
    DatabaseModule,
    CommonModule,
    AuthModule,
    UsersModule,
    StoriesModule,
    CategoriesModule,
    TagsModule,
    SearchModule,
    FollowsModule,
    ReactionsModule,
    CommentsModule,
    NotificationsModule,
    MessagesModule,
    UploadModule,
    ModerationModule,
    BooksModule,
    PaymentsModule,
    RentalsModule,
    LibraryModule,
    ContestsModule,
  ],
})
export class AppModule {}
