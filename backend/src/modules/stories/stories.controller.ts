import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards, Request } from '@nestjs/common';
import type { AuthRequest } from '../../common/types/auth-request.interface.js';
import { StoriesService, STORY_STATUS } from './services/stories.service.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { CreateStoryDto, UpdateStoryDto, StoryFiltersDto } from './dto/stories.dto.js';

@Controller('stories')
export class StoriesController {
  constructor(private readonly storiesService: StoriesService) {}

  @Get()
  async findPublished(@Query() filters: StoryFiltersDto) {
    return this.storiesService.findPublished(filters);
  }

  @Get(':id')
  async findById(@Param('id') id: string) {
    return this.storiesService.findById(id);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  async create(@Request() req: AuthRequest, @Body() createStoryDto: CreateStoryDto) {
    return this.storiesService.create(req.user.sub, createStoryDto);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  async update(@Param('id') id: string, @Request() req: AuthRequest, @Body() updateStoryDto: UpdateStoryDto) {
    return this.storiesService.update(id, req.user.sub, updateStoryDto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  async delete(@Param('id') id: string, @Request() req: AuthRequest) {
    return this.storiesService.delete(id, req.user.sub);
  }

  @Post(':id/publish')
  @UseGuards(JwtAuthGuard)
  async publish(@Param('id') id: string, @Request() req: AuthRequest) {
    return this.storiesService.publish(id, req.user.sub);
  }

  @Post(':id/approve')
  @UseGuards(JwtAuthGuard)
  async approve(@Param('id') id: string) {
    return this.storiesService.approve(id);
  }

  @Post(':id/reject')
  @UseGuards(JwtAuthGuard)
  async reject(@Param('id') id: string, @Body() body: { reason?: string }) {
    return this.storiesService.reject(id, body.reason ?? '');
  }
}
