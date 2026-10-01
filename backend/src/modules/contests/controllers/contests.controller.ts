import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  Inject,
  HttpCode,
  HttpStatus,
  Request,
  ParseUUIDPipe,
} from '@nestjs/common';
import type { Request as ExpressRequest } from 'express';

import { Public } from '../../../common/decorators/roles.decorator.ts';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard.ts';
import { ContestsService } from '../contests.service.ts';
import {
  CreateContestDto,
  UpdateContestDto,
  ContestsQueryDto,
  SubmitStoryDto,
  CastVoteDto,
  SelectWinnerDto,
  DistributePrizeDto,
} from '../dto/contests.dto.ts';
import type { CreateContestInput } from '../types.ts';

@Controller('contests')
export class ContestsController {
  constructor(@Inject(ContestsService) private readonly contestsService: ContestsService) {}

  @Public()
  @Get()
  async findAll(@Query() query: ContestsQueryDto) {
    return this.contestsService.findAll(query);
  }

  /**
   * Static `publisher/...` segments are declared before `@Get(':id')` on purpose.
   *
   * Express matches routes in declaration order, and `:id` is a single segment, so a static route
   * with a *different* number of segments (`publisher/stats`) happens to survive even when it is
   * declared last. That is an accident of arity, not a guarantee: the day someone adds a
   * single-segment static route such as `@Get('featured')`, or reads `publisher/stats` and
   * concludes the ordering does not matter, the id route swallows it. Declaring the literal
   * segments first is the convention that makes the intent checkable, and it costs nothing when the
   * two orders happen to agree.
   */
  @UseGuards(JwtAuthGuard)
  @Get('publisher/stats')
  async getPublisherStats(@Request() req: ExpressRequest & { user: { sub: string } }) {
    return this.contestsService.getPublisherStats(req.user.sub);
  }

  @UseGuards(JwtAuthGuard)
  @Get('publisher/:id/submissions')
  async getPublisherSubmissionsOverview(
    @Param('id') contestId: string,
    @Request() req: ExpressRequest & { user: { sub: string } },
  ) {
    return this.contestsService.getPublisherSubmissionsOverview(contestId, req.user.sub);
  }

  @UseGuards(JwtAuthGuard)
  @Get('publisher/:id/votes')
  async getPublisherVotesOverview(
    @Param('id') contestId: string,
    @Request() req: ExpressRequest & { user: { sub: string } },
  ) {
    return this.contestsService.getPublisherVotesOverview(contestId, req.user.sub);
  }

  @Public()
  @Get(':id')
  async findById(@Param('id') id: string) {
    return this.contestsService.findById(id);
  }

  @UseGuards(JwtAuthGuard)
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateContestDto, @Request() req: ExpressRequest & { user: { sub: string } }) {
    return this.contestsService.create(req.user.sub, {
      title: dto.title,
      description: dto.description,
      categoryId: dto.categoryId,
      startDate: dto.startDate,
      endDate: dto.endDate,
      submissionDeadline: dto.submissionDeadline,
    });
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateContestDto,
    @Request() req: ExpressRequest & { user: { sub: string } },
  ) {
    return this.contestsService.update(id, dto, req.user.sub);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/start')
  @HttpCode(HttpStatus.OK)
  async start(@Param('id') id: string, @Request() req: ExpressRequest & { user: { sub: string } }) {
    return this.contestsService.start(id, req.user.sub);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  async cancel(@Param('id') id: string, @Request() req: ExpressRequest & { user: { sub: string } }) {
    return this.contestsService.cancel(id, req.user.sub);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/complete')
  async complete(@Param('id') id: string, @Request() req: ExpressRequest & { user: { sub: string } }) {
    return this.contestsService.complete(id, req.user.sub);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/submissions')
  @HttpCode(HttpStatus.CREATED)
  async submitStory(
    @Param('id') contestId: string,
    @Body() dto: SubmitStoryDto,
    @Request() req: ExpressRequest & { user: { sub: string } },
  ) {
    return this.contestsService.submitStory(contestId, req.user.sub, dto.storyId, req.user.sub);
  }

  @Public()
  @Get(':id/submissions')
  async getSubmissions(@Param('id') contestId: string, @Query('page') page?: string, @Query('limit') limit?: string) {
    return this.contestsService.getSubmissions(contestId, Number(page) || 1, Number(limit) || 20);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/votes')
  @HttpCode(HttpStatus.CREATED)
  async castVote(
    @Param('id') contestId: string,
    @Body() dto: CastVoteDto,
    @Request() req: ExpressRequest & { user: { sub: string } },
  ) {
    return this.contestsService.castVote(contestId, dto.submissionId, req.user.sub);
  }

  @Public()
  @Get(':id/votes')
  async getVotes(
    @Param('id') contestId: string,
    @Query('submissionId') submissionId?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.contestsService.getVotes(contestId, submissionId, Number(page) || 1, Number(limit) || 20);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/winner')
  async selectWinner(@Param('id') contestId: string, @Body() dto: SelectWinnerDto) {
    return this.contestsService.selectWinner(contestId, dto.submissionId, dto.winnerId);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/submissions/:submissionId/approve')
  @HttpCode(HttpStatus.OK)
  async approveSubmission(
    @Param('id') contestId: string,
    @Param('submissionId', ParseUUIDPipe) submissionId: string,
    @Request() req: ExpressRequest & { user: { sub: string } },
  ) {
    return this.contestsService.approveSubmission(submissionId, contestId, req.user.sub);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/submissions/:submissionId/reject')
  @HttpCode(HttpStatus.OK)
  async rejectSubmission(
    @Param('id') contestId: string,
    @Param('submissionId', ParseUUIDPipe) submissionId: string,
    @Request() req: ExpressRequest & { user: { sub: string } },
  ) {
    return this.contestsService.rejectSubmission(submissionId, contestId, req.user.sub);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/prizes')
  @HttpCode(HttpStatus.CREATED)
  async distributePrize(@Param('id') contestId: string, @Body() dto: DistributePrizeDto) {
    return this.contestsService.distributePrize(
      contestId,
      dto.submissionId,
      dto.winnerId,
      dto.prizeType,
      dto.prizeDescription,
    );
  }

  @Public()
  @Get(':id/prizes')
  async getPrizes(@Param('id') contestId: string) {
    return this.contestsService.getPrizes(contestId);
  }
}
