import { Controller, Post, Delete, Get, Param, Body, Query, UseGuards, Inject, Request } from '@nestjs/common';
import type { Request as ExpressRequest } from 'express';

import { Public } from '../../../common/decorators/roles.decorator.ts';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard.ts';

import { CommentReactionsService } from './comment-reactions.service.ts';
import { CreateCommentReactionDto } from './dto/comment-reactions.dto.ts';

@Controller('comments')
export class CommentReactionsController {
  constructor(@Inject(CommentReactionsService) private readonly commentReactionsService: CommentReactionsService) {}

  @UseGuards(JwtAuthGuard)
  @Post(':commentId/reactions')
  async addReaction(@Param('commentId') commentId: string, @Body() dto: CreateCommentReactionDto, @Request() req: ExpressRequest & { user: { sub: string } }) {
    return this.commentReactionsService.addReaction(req.user.sub, commentId, dto.type);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':commentId/reactions')
  async removeReaction(@Param('commentId') commentId: string, @Request() req: ExpressRequest & { user: { sub: string } }) {
    await this.commentReactionsService.removeReaction(req.user.sub, commentId);
    return { message: 'Comment reaction removed' };
  }

  @Public()
  @Get(':commentId/reactions')
  async getReactions(@Param('commentId') commentId: string, @Query('page') page?: string, @Query('limit') limit?: string) {
    return this.commentReactionsService.getReactions(commentId, Number(page) || 1, Number(limit) || 20);
  }
}
