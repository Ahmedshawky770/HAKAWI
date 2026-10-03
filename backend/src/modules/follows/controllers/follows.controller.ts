import {
  Controller,
  Get,
  Post,
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
import { FollowsService } from '../follows.service.ts';
import { FollowUserDto, FollowersQueryDto } from '../dto/follows.dto.ts';

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
  async getFollowers(@Param('userId', ParseUUIDPipe) userId: string, @Query() query: FollowersQueryDto) {
    const currentPage = query.page ?? 1;
    const currentLimit = query.limit ?? 20;
    const result = await this.followsService.getFollowers(userId, currentPage, currentLimit);
    return { followers: result.follows, total: result.total, page: result.page, limit: result.limit };
  }

  @Public()
  @Get('user/:userId/following')
  async getFollowing(@Param('userId', ParseUUIDPipe) userId: string, @Query() query: FollowersQueryDto) {
    const currentPage = query.page ?? 1;
    const currentLimit = query.limit ?? 20;
    const result = await this.followsService.getFollowing(userId, currentPage, currentLimit);
    return { following: result.follows, total: result.total, page: result.page, limit: result.limit };
  }

  /**
   * WHY THIS IS NO LONGER `@Public()`.
   *
   * It was, and `isFollowing` was therefore dead: `JwtAuthGuard` is not global — `CommonModule`
   * registers only `ThrottlerGuard` as an `APP_GUARD` — and `@Public()` makes it return before it ever
   * assigns `request.user`. So `req.user` was always `undefined`, `currentUserId` was `undefined`, and
   * `FollowsService.getStats` took its `Promise.resolve(false)` branch. The field was permanently
   * `false` for every caller, authenticated or not.
   *
   * The counts themselves stay public in substance: an anonymous caller now gets a 401 instead of a
   * response containing a permanently-false `isFollowing`, and a caller who wants the counts without a
   * token has `GET /follows/user/:userId/followers` and `/following`, which are genuinely `@Public()`.
   */
  @UseGuards(JwtAuthGuard)
  @Get('user/:userId/stats')
  async getStats(@Param('userId', ParseUUIDPipe) userId: string, @Request() req: { user: { sub: string } }) {
    return this.followsService.getStats(userId, req.user.sub);
  }

  @UseGuards(JwtAuthGuard)
  @Get('check/:followingId')
  async checkFollowing(
    @Param('followingId', ParseUUIDPipe) followingId: string,
    @Request() req: { user: { sub: string } },
  ) {
    const isFollowing = await this.followsService.isFollowing(req.user.sub, followingId);
    return { isFollowing };
  }
}
