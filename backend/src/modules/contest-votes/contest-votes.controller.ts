import { Controller, Get, Post, Body, Param, UseGuards, Request } from '@nestjs/common';
import type { AuthRequest } from '../../common/types/auth-request.interface.js';
import { ContestVotesService } from './services/contest-votes.service.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { CastVoteDto } from './dto/contest-votes.dto.js';

@Controller('contests')
export class ContestVotesController {
  constructor(private readonly votesService: ContestVotesService) {}

  @Get(':id/votes')
  async findByContestId(@Param('id') contestId: string) {
    return this.votesService.findBySubmissionId(contestId);
  }

  @Post(':id/vote')
  @UseGuards(JwtAuthGuard)
  async vote(@Param('id') contestId: string, @Request() req: AuthRequest, @Body() castVoteDto: CastVoteDto) {
    return this.votesService.vote(req.user.sub, { ...castVoteDto, contestId, userId: req.user.sub });
  }
}
