import { Controller, Get, Post, Body, Param, UseGuards, Request } from '@nestjs/common';
import type { AuthRequest } from '../../common/types/auth-request.interface.js';
import { WithdrawalsService } from './services/withdrawals.service.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { CreateWithdrawalDto } from './dto/withdrawals.dto.js';

@Controller('withdrawals')
export class WithdrawalsController {
  constructor(private readonly withdrawalsService: WithdrawalsService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  async create(@Request() req: AuthRequest, @Body() createWithdrawalDto: CreateWithdrawalDto) {
    return this.withdrawalsService.create(req.user.sub, createWithdrawalDto);
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  async findByUserId(@Request() req: AuthRequest) {
    return this.withdrawalsService.findByUserId(req.user.sub);
  }
}
