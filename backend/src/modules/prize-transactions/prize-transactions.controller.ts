import { Controller, Get, UseGuards, Request, Param } from '@nestjs/common';
import type { AuthRequest } from '../../common/types/auth-request.interface.js';
import { PrizeTransactionsService } from './services/prize-transactions.service.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';

@Controller('prize-transactions')
export class PrizeTransactionsController {
  constructor(private readonly prizeTransactionsService: PrizeTransactionsService) {}

  @Get('contest/:contestId')
  @UseGuards(JwtAuthGuard)
  async findByContestId(@Param('contestId') contestId: string) {
    return this.prizeTransactionsService.findByContestId(contestId);
  }

  @Get('user')
  @UseGuards(JwtAuthGuard)
  async findByUserId(@Request() req: AuthRequest) {
    return this.prizeTransactionsService.findByUserId(req.user.sub);
  }
}
