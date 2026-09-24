import { Module } from '@nestjs/common';

import { db } from './index.ts';
import { users } from './schema/users.schema.ts';
import { categories, tags, stories, storyTags } from './schema/stories.schema.ts';
import { follows, reactions, comments, commentReactions, notifications, conversations, messages } from './schema/social.schema.ts';
import { uploads } from './schema/upload.schema.ts';
import { reports, moderationActions, userRestrictions } from './schema/moderation.schema.ts';

@Module({
  providers: [
    { provide: 'DATABASE', useValue: db },
    { provide: 'USERS_SCHEMA', useValue: users },
    { provide: 'CATEGORIES_SCHEMA', useValue: categories },
    { provide: 'TAGS_SCHEMA', useValue: tags },
    { provide: 'STORIES_SCHEMA', useValue: stories },
    { provide: 'STORY_TAGS_SCHEMA', useValue: storyTags },
    { provide: 'FOLLOWS_SCHEMA', useValue: follows },
    { provide: 'REACTIONS_SCHEMA', useValue: reactions },
    { provide: 'COMMENTS_SCHEMA', useValue: comments },
    { provide: 'COMMENT_REACTIONS_SCHEMA', useValue: commentReactions },
    { provide: 'NOTIFICATIONS_SCHEMA', useValue: notifications },
    { provide: 'CONVERSATIONS_SCHEMA', useValue: conversations },
    { provide: 'MESSAGES_SCHEMA', useValue: messages },
    { provide: 'UPLOADS_SCHEMA', useValue: uploads },
    { provide: 'REPORTS_SCHEMA', useValue: reports },
    { provide: 'MODERATION_ACTIONS_SCHEMA', useValue: moderationActions },
    { provide: 'USER_RESTRICTIONS_SCHEMA', useValue: userRestrictions },
  ],
  exports: [
    'DATABASE',
    'USERS_SCHEMA',
    'CATEGORIES_SCHEMA',
    'TAGS_SCHEMA',
    'STORIES_SCHEMA',
    'STORY_TAGS_SCHEMA',
    'FOLLOWS_SCHEMA',
    'REACTIONS_SCHEMA',
    'COMMENTS_SCHEMA',
    'COMMENT_REACTIONS_SCHEMA',
    'NOTIFICATIONS_SCHEMA',
    'CONVERSATIONS_SCHEMA',
    'MESSAGES_SCHEMA',
    'UPLOADS_SCHEMA',
    'REPORTS_SCHEMA',
    'MODERATION_ACTIONS_SCHEMA',
    'USER_RESTRICTIONS_SCHEMA',
  ],
})
export class DatabaseModule {}
