import { Controller, Get, Post, Body, Param, UseGuards, Request } from '@nestjs/common';
import type { AuthRequest } from '../../common/types/auth-request.interface.js';
import { TransactionsService } from './services/transactions.service.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';

@Controller('transactions')
export class TransactionsController {
  constructor(private readonly transactionsService: TransactionsService) {}

  @Get('payment/:paymentId')
  @UseGuards(JwtAuthGuard)
  async findByPaymentId(@Param('paymentId') paymentId: string) {
    return this.transactionsService.findByPaymentId(paymentId);
  }

  @Get('history')
  @UseGuards(JwtAuthGuard)
  async findByUserId(@Request() req: AuthRequest) {
    return this.transactionsService.findByUserId(req.user.sub);
  }
}
