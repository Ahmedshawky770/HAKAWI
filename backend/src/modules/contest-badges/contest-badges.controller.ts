import { Controller, Get, Param, UseGuards, Request } from '@nestjs/common';
import { ContestBadgesService } from './services/contest-badges.service.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';

@Controller('contest-badges')
export class ContestBadgesController {
  constructor(private readonly badgesService: ContestBadgesService) {}

  @Get('contest/:contestId')
  @UseGuards(JwtAuthGuard)
  async findByContestId(@Param('contestId') contestId: string) {
    return this.badgesService.findByContestId(contestId);
  }

  @Get('winner/:winnerId')
  @UseGuards(JwtAuthGuard)
  async findByWinnerId(@Param('winnerId') winnerId: string) {
    return this.badgesService.findByWinnerId(winnerId);
  }
}
