import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards, Inject, HttpCode, HttpStatus, Request } from '@nestjs/common';

import { Public } from '../../../common/decorators/roles.decorator.ts';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard.ts';
import { StoriesService } from '../stories.service.ts';
import { CreateStoryDto, UpdateStoryDto, StoriesQueryDto } from '../dto/stories.dto.ts';
import type { CreateStoryInput } from '../types.ts';

@Controller('stories')
export class StoriesController {
  constructor(@Inject(StoriesService) private readonly storiesService: StoriesService) {}

  @Public()
  @Get()
  async findAll(@Query() query: StoriesQueryDto) {
    return this.storiesService.findAll(query);
  }

  @Public()
  @Get(':id')
  async findById(@Param('id') id: string) {
    return this.storiesService.findById(id);
  }

  @Public()
  @Get('slug/:slug')
  async findBySlug(@Param('slug') slug: string) {
    return this.storiesService.findBySlug(slug);
  }

  @UseGuards(JwtAuthGuard)
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateStoryDto, @Request() req: Request & { user: { sub: string } }) {
    return this.storiesService.create(req.user.sub, dto as CreateStoryInput);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateStoryDto) {
    return this.storiesService.update(id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/publish')
  async publish(@Param('id') id: string) {
    return this.storiesService.publish(id);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/archive')
  async archive(@Param('id') id: string) {
    return this.storiesService.archive(id);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param('id') id: string) {
    await this.storiesService.delete(id);
  }
}
