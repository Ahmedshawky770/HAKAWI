import { Controller, Get, UseGuards, Request } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { StoryTagsService } from '../story-tags/services/story-tags.service.js';

@Controller('story-tags')
export class StoryTagsController {
  constructor(private readonly tagsService: StoryTagsService) {}

  @Get()
  async findAll() {
    return this.tagsService.findAll();
  }
}
