import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards, Inject, HttpCode, HttpStatus, Request } from '@nestjs/common';

import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard.ts';
import { PaymentsService } from '../payments.service.ts';
import { CreatePaymentDto, UpdatePaymentStatusDto, CreateRefundDto, PaymentsQueryDto } from '../dto/payments.dto.ts';
import type { CreatePaymentInput } from '../interfaces/payments-repository.interface.ts';

@Controller('payments')
export class PaymentsController {
  constructor(@Inject(PaymentsService) private readonly paymentsService: PaymentsService) {}

  @UseGuards(JwtAuthGuard)
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createPayment(@Body() dto: CreatePaymentDto, @Request() req: Request & { user: { sub: string } }) {
    return this.paymentsService.createPayment({ ...dto, userId: req.user.sub } as CreatePaymentInput);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  async findById(@Param('id') id: string) {
    return this.paymentsService.findById(id);
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  async findAll(@Query() query: PaymentsQueryDto, @Request() req: Request & { user: { sub: string } }) {
    return this.paymentsService.findAll({ ...query, userId: req.user.sub });
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id/status')
  async updateStatus(@Param('id') id: string, @Body() dto: UpdatePaymentStatusDto) {
    return this.paymentsService.updateStatus(id, dto.status);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/refund')
  @HttpCode(HttpStatus.CREATED)
  async createRefund(@Param('id') id: string, @Body() dto: CreateRefundDto) {
    return this.paymentsService.createRefund(id, dto.amount, dto.reason);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id/refunds')
  async getRefunds(@Param('id') id: string) {
    return this.paymentsService.getRefunds(id);
  }
}
