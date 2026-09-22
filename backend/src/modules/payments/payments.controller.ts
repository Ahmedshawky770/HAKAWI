import { Controller, Get, Post, Body, Param, UseGuards, Request } from '@nestjs/common';
import type { AuthRequest } from '../../common/types/auth-request.interface.js';
import { PaymentsService } from './services/payments.service.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { CreatePaymentDto, RefundPaymentDto } from './dto/payments.dto.js';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  async create(@Request() req: AuthRequest, @Body() createPaymentDto: CreatePaymentDto) {
    return this.paymentsService.create(req.user.sub, createPaymentDto);
  }

  @Get('history')
  @UseGuards(JwtAuthGuard)
  async getHistory(@Request() req: AuthRequest) {
    return this.paymentsService.findByUserId(req.user.sub);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  async findById(@Param('id') id: string, @Request() req: AuthRequest) {
    return this.paymentsService.findById(id, req.user.sub);
  }

  @Post(':id/refund')
  @UseGuards(JwtAuthGuard)
  async refund(@Param('id') id: string, @Request() req: AuthRequest, @Body() refundDto: RefundPaymentDto) {
    return this.paymentsService.refund(id, req.user.sub, refundDto);
  }
}
