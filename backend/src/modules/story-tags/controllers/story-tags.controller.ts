import { Controller, Get, Post, Body, Param } from '@nestjs/common';
import { Public } from '../../common/decorators/roles.decorator.js';
import { StoryTagsService } from '../services/story-tags.service.js';

@Controller('story-tags')
export class StoryTagsController {
  constructor(private readonly storyTagsService: StoryTagsService) {}

  @Public()
  @Get()
  findAll() {
    return this.storyTagsService.findAll();
  }

  @Public()
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.storyTagsService.findOne(id);
  }

  @Post()
  create(@Body() data: unknown) {
    return this.storyTagsService.create(data);
  }
}
