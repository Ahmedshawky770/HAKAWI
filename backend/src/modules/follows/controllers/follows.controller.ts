import { Controller, Get, Post, Delete, Body, Param, Query, UseGuards, Inject, Request, ParseUUIDPipe } from '@nestjs/common';

import { Public } from '../../../common/decorators/roles.decorator.ts';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard.ts';
import { FollowsService } from '../follows.service.ts';
import { FollowUserDto } from '../dto/follows.dto.ts';

@Controller('follows')
export class FollowsController {
  constructor(@Inject(FollowsService) private readonly followsService: FollowsService) {}

  @UseGuards(JwtAuthGuard)
  @Post()
  async follow(@Body() dto: FollowUserDto, @Request() req: { user: { sub: string } }) {
    return this.followsService.follow(req.user.sub, dto.followingId);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':followingId')
  async unfollow(@Param('followingId', ParseUUIDPipe) followingId: string, @Request() req: { user: { sub: string } }) {
    await this.followsService.unfollow(req.user.sub, followingId);
    return { message: 'Unfollowed successfully' };
  }

  @Public()
  @Get('user/:userId/followers')
  async getFollowers(@Param('userId', ParseUUIDPipe) userId: string, @Query('page') page?: string, @Query('limit') limit?: string) {
    const result = await this.followsService.getFollowers(userId, Number(page) || 1, Number(limit) || 20);
    return { followers: result.follows, total: result.total };
  }

  @Public()
  @Get('user/:userId/following')
  async getFollowing(@Param('userId', ParseUUIDPipe) userId: string, @Query('page') page?: string, @Query('limit') limit?: string) {
    const result = await this.followsService.getFollowing(userId, Number(page) || 1, Number(limit) || 20);
    return { following: result.follows, total: result.total };
  }

  @Public()
  @Get('user/:userId/stats')
  async getStats(@Param('userId', ParseUUIDPipe) userId: string, @Request() req: { user?: { sub: string } }) {
    const currentUserId = req.user?.sub;
    return this.followsService.getStats(userId, currentUserId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('check/:followingId')
  async checkFollowing(@Param('followingId', ParseUUIDPipe) followingId: string, @Request() req: { user: { sub: string } }) {
    const isFollowing = await this.followsService.isFollowing(req.user.sub, followingId);
    return { isFollowing };
  }
}
