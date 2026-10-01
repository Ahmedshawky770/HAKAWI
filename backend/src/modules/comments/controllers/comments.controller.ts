import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Inject,
  Request,
  ParseUUIDPipe,
} from '@nestjs/common';

import { Public } from '../../../common/decorators/roles.decorator.ts';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard.ts';
import { OwnershipGuard } from '../../../common/guards/ownership.guard.ts';
import { CommentsService } from '../comments.service.ts';
import { CreateCommentDto, UpdateCommentDto } from '../dto/comments.dto.ts';

@Controller('comments')
export class CommentsController {
  constructor(@Inject(CommentsService) private readonly commentsService: CommentsService) {}

  @Public()
  @Get('story/:storyId')
  async findByStory(
    @Param('storyId', ParseUUIDPipe) storyId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.commentsService.findByStory(storyId, Number(page) || 1, Number(limit) || 20);
  }

  @Public()
  @Get(':id/replies')
  async findReplies(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
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

  /**
   * `OwnershipGuard` is listed after `JwtAuthGuard` because it depends on it: the guard reads
   * `request.user.sub`, which only `JwtAuthGuard` populates, and without it the guard answers 403
   * `Access denied` for every caller. Nest runs the two in array order.
   *
   * The IDOR this closes: `CommentsService.update`/`delete` did check `comment.authorId`, but only
   * *after* loading the row and inside the handler, so the pre-handler layer — which is the layer a
   * reviewer reads when asking "can user X touch comment Y?" — enforced nothing. The check now
   * happens before the service is called, against the module's own `CommentOwnershipResolver`.
   */
  @UseGuards(JwtAuthGuard, OwnershipGuard)
  @Patch(':id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCommentDto,
    @Request() req: { user: { sub: string } },
  ) {
    return this.commentsService.update(id, req.user.sub, dto);
  }

  /**
   * Same reasoning as `update`: the author check moves in front of the handler. A 403 here no longer
   * distinguishes "not your comment" from "no such comment", which is the intended answer to an
   * existence probe.
   */
  @UseGuards(JwtAuthGuard, OwnershipGuard)
  @Delete(':id')
  async delete(@Param('id', ParseUUIDPipe) id: string, @Request() req: { user: { sub: string } }) {
    await this.commentsService.delete(id, req.user.sub);
    return { message: 'Comment deleted' };
  }
}
