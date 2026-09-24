import { Controller, Get, Post, Delete, Body, Param, Query, UseGuards, Inject, Request, ParseUUIDPipe } from '@nestjs/common';
import type { Request as ExpressRequest } from 'express';

import { Public } from '../../../common/decorators/roles.decorator.ts';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard.ts';
import { ReactionsService } from '../reactions.service.ts';
import { CreateReactionDto } from '../dto/reactions.dto.ts';

@Controller('reactions')
export class ReactionsController {
  constructor(@Inject(ReactionsService) private readonly reactionsService: ReactionsService) {}

  @UseGuards(JwtAuthGuard)
  @Post('stories/:storyId')
  async addReaction(@Param('storyId', ParseUUIDPipe) storyId: string, @Body() dto: CreateReactionDto, @Request() req: ExpressRequest & { user: { sub: string } }) {
    return this.reactionsService.addReaction(req.user.sub, storyId, dto.type);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('stories/:storyId')
  async removeReaction(@Param('storyId', ParseUUIDPipe) storyId: string, @Request() req: ExpressRequest & { user: { sub: string } }) {
    await this.reactionsService.removeReaction(req.user.sub, storyId);
    return { message: 'Reaction removed' };
  }

  @Public()
  @Get('stories/:storyId')
  async getReactions(@Param('storyId', ParseUUIDPipe) storyId: string, @Query('page') page?: string, @Query('limit') limit?: string) {
    return this.reactionsService.getReactions(storyId, Number(page) || 1, Number(limit) || 20);
  }

  @Public()
  @Get('stories/:storyId/counts')
  async getReactionCounts(@Param('storyId', ParseUUIDPipe) storyId: string) {
    return this.reactionsService.getReactionCounts(storyId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('stories/:storyId/me')
  async getUserReaction(@Param('storyId', ParseUUIDPipe) storyId: string, @Request() req: ExpressRequest & { user: { sub: string } }) {
    return this.reactionsService.getUserReaction(req.user.sub, storyId);
  }
}
