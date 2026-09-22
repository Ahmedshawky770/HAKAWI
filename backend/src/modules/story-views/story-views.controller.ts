import { Controller, Get, Param, UseGuards, Request } from '@nestjs/common';
import { StoryViewsService } from './services/story-views.service.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';

@Controller('story-views')
export class StoryViewsController {
  constructor(private readonly viewsService: StoryViewsService) {}

  @Get('story/:storyId')
  async findByStoryId(@Param('storyId') storyId: string) {
    return this.viewsService.findByStoryId(storyId);
  }

  @Get('story/:storyId/count')
  async countByStoryId(@Param('storyId') storyId: string) {
    const count = await this.viewsService.countByStoryId(storyId);
    return { count };
  }
}
