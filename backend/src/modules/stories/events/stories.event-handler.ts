import { Injectable, Inject } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

import { WinstonLoggerService } from '../../../common/services/winston-logger.service.ts';
import type { StoryCreatedEvent, StoryUpdatedEvent, StoryPublishedEvent, StoryArchivedEvent, StoryDeletedEvent } from '../../../common/events/stories.events.ts';
import type { IStoriesRepository } from '../interfaces/stories-repository.interface.ts';
import { STORIES_REPOSITORY } from '../interfaces/stories-repository.interface.ts';

@Injectable()
export class StoriesEventHandler {
  constructor(
    @Inject(STORIES_REPOSITORY) private readonly storiesRepository: IStoriesRepository,
    @Inject(WinstonLoggerService) private readonly logger: WinstonLoggerService,
  ) {}

  @OnEvent('story.created')
  async handleStoryCreated(event: StoryCreatedEvent): Promise<void> {
    this.logger.info(`Handling story created event: ${event.storyId}`, 'StoriesEventHandler');
  }

  @OnEvent('story.updated')
  async handleStoryUpdated(event: StoryUpdatedEvent): Promise<void> {
    this.logger.info(`Handling story updated event: ${event.storyId}`, 'StoriesEventHandler');
  }

  @OnEvent('story.published')
  async handleStoryPublished(event: StoryPublishedEvent): Promise<void> {
    this.logger.info(`Handling story published event: ${event.storyId}`, 'StoriesEventHandler');
  }

  @OnEvent('story.archived')
  async handleStoryArchived(event: StoryArchivedEvent): Promise<void> {
    this.logger.info(`Handling story archived event: ${event.storyId}`, 'StoriesEventHandler');
  }

  @OnEvent('story.deleted')
  async handleStoryDeleted(event: StoryDeletedEvent): Promise<void> {
    this.logger.info(`Handling story deleted event: ${event.storyId}`, 'StoriesEventHandler');
  }
}
