import { Controller, Get, UseGuards, Request, Param } from '@nestjs/common';
import { RefundsService } from './services/refunds.service.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';

@Controller('refunds')
export class RefundsController {
  constructor(private readonly refundsService: RefundsService) {}

  @Get('payment/:paymentId')
  @UseGuards(JwtAuthGuard)
  async findByPaymentId(@Param('paymentId') paymentId: string) {
    return this.refundsService.findByPaymentId(paymentId);
  }
}
