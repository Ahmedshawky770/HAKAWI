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
  ReviewSubmissionDto,
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

  @Public()
  @Get(':id')
  async findById(@Param('id') id: string) {
    return this.contestsService.findById(id);
  }

  @UseGuards(JwtAuthGuard)
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateContestDto, @Request() req: ExpressRequest & { user: { sub: string } }) {
    return this.contestsService.create(req.user.sub, dto as unknown as CreateContestInput);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateContestDto) {
    return this.contestsService.update(id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/start')
  async start(@Param('id') id: string) {
    return this.contestsService.start(id);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/cancel')
  async cancel(@Param('id') id: string) {
    return this.contestsService.cancel(id);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/complete')
  async complete(@Param('id') id: string) {
    return this.contestsService.complete(id);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/submissions')
  @HttpCode(HttpStatus.CREATED)
  async submitStory(@Param('id') contestId: string, @Body() dto: SubmitStoryDto, @Request() req: ExpressRequest & { user: { sub: string } }) {
    return this.contestsService.submitStory(contestId, req.user.sub, dto.storyId);
  }

  @Public()
  @Get(':id/submissions')
  async getSubmissions(@Param('id') contestId: string, @Query('page') page?: string, @Query('limit') limit?: string) {
    return this.contestsService.getSubmissions(contestId, Number(page) || 1, Number(limit) || 20);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/votes')
  @HttpCode(HttpStatus.CREATED)
  async castVote(@Param('id') contestId: string, @Body() dto: CastVoteDto, @Request() req: ExpressRequest & { user: { sub: string } }) {
    return this.contestsService.castVote(contestId, dto.submissionId, req.user.sub);
  }

  @Public()
  @Get(':id/votes')
  async getVotes(@Param('id') contestId: string, @Query('submissionId') submissionId?: string, @Query('page') page?: string, @Query('limit') limit?: string) {
    return this.contestsService.getVotes(contestId, submissionId, Number(page) || 1, Number(limit) || 20);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/winner')
  async selectWinner(@Param('id') contestId: string, @Body() dto: SelectWinnerDto) {
    return this.contestsService.selectWinner(contestId, dto.submissionId, dto.winnerId);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/submissions/:submissionId/approve')
  async approveSubmission(@Param('id') contestId: string, @Param('submissionId', ParseUUIDPipe) submissionId: string) {
    return this.contestsService.approveSubmission(submissionId, contestId);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/submissions/:submissionId/reject')
  async rejectSubmission(@Param('id') contestId: string, @Param('submissionId', ParseUUIDPipe) submissionId: string) {
    return this.contestsService.rejectSubmission(submissionId, contestId);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/prizes')
  @HttpCode(HttpStatus.CREATED)
  async distributePrize(@Param('id') contestId: string, @Body() dto: DistributePrizeDto) {
    return this.contestsService.distributePrize(contestId, dto.submissionId, dto.winnerId, dto.prizeType, dto.prizeDescription);
  }

  @Public()
  @Get(':id/prizes')
  async getPrizes(@Param('id') contestId: string) {
    return this.contestsService.getPrizes(contestId);
  }
}
