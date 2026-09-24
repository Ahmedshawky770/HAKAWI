import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards, Inject, Request, ParseUUIDPipe } from '@nestjs/common';

import { Public } from '../../../common/decorators/roles.decorator.ts';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard.ts';
import { CommentsService } from '../comments.service.ts';
import { CreateCommentDto, UpdateCommentDto } from '../dto/comments.dto.ts';

@Controller('comments')
export class CommentsController {
  constructor(@Inject(CommentsService) private readonly commentsService: CommentsService) {}

  @Public()
  @Get('story/:storyId')
  async findByStory(@Param('storyId', ParseUUIDPipe) storyId: string, @Query('page') page?: string, @Query('limit') limit?: string) {
    return this.commentsService.findByStory(storyId, Number(page) || 1, Number(limit) || 20);
  }

  @Public()
  @Get(':id/replies')
  async findReplies(@Param('id', ParseUUIDPipe) id: string, @Query('page') page?: string, @Query('limit') limit?: string) {
    return this.commentsService.findReplies(id, Number(page) || 1, Number(limit) || 20);
  }

  @UseGuards(JwtAuthGuard)
  @Post()
  async create(@Body() dto: CreateCommentDto, @Request() req: { user: { sub: string } }) {
    return this.commentsService.create({
      ...dto,
      authorId: req.user.sub,
    });
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id')
  async update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCommentDto, @Request() req: { user: { sub: string } }) {
    return this.commentsService.update(id, req.user.sub, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  async delete(@Param('id', ParseUUIDPipe) id: string, @Request() req: { user: { sub: string } }) {
    await this.commentsService.delete(id, req.user.sub);
    return { message: 'Comment deleted' };
  }
}
