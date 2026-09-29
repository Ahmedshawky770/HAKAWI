import { Controller, Get, Post, Patch, Body, Param, Query, UseGuards, Inject, HttpCode, HttpStatus, Request, Headers, Req, ForbiddenException } from '@nestjs/common';

import { Public } from '../../../common/decorators/roles.decorator.ts';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard.ts';
import { AdminRole } from '../../../common/constants/roles.ts';
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
  async findById(@Param('id') id: string, @Request() req: { user: { sub: string; adminRole?: string } }) {
    const payment = await this.paymentsService.findById(id);

    const isOwner = payment.userId === req.user.sub;
    const isAdmin = req.user.adminRole === AdminRole.SUPER_ADMIN || req.user.adminRole === AdminRole.MODERATOR || req.user.adminRole === AdminRole.FINANCE;

    if (!isOwner && !isAdmin) {
      throw new ForbiddenException('You can only view your own payments');
    }

    return payment;
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  async findAll(@Query() query: PaymentsQueryDto, @Request() req: Request & { user: { sub: string } }) {
    return this.paymentsService.findAll({ ...query, userId: req.user.sub });
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id/status')
  async updateStatus(@Param('id') id: string, @Body() dto: UpdatePaymentStatusDto, @Request() req: { user: { sub: string; adminRole?: string } }) {
    const isAdmin = req.user.adminRole === AdminRole.SUPER_ADMIN || req.user.adminRole === AdminRole.MODERATOR || req.user.adminRole === AdminRole.FINANCE;

    if (!isAdmin) {
      throw new ForbiddenException('Only admins can update payment status');
    }

    return this.paymentsService.updateStatus(id, dto.status);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/refund')
  @HttpCode(HttpStatus.CREATED)
  async createRefund(@Param('id') id: string, @Body() dto: CreateRefundDto, @Request() req: { user: { sub: string; adminRole?: string } }) {
    const payment = await this.paymentsService.findById(id);

    const isOwner = payment.userId === req.user.sub;
    const isAdmin = req.user.adminRole === AdminRole.SUPER_ADMIN || req.user.adminRole === AdminRole.MODERATOR || req.user.adminRole === AdminRole.FINANCE;

    if (!isOwner && !isAdmin) {
      throw new ForbiddenException('You can only request refunds for your own payments');
    }

    return this.paymentsService.createRefund(id, dto.amount, dto.reason);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id/refunds')
  async getRefunds(@Param('id') id: string) {
    return this.paymentsService.getRefunds(id);
  }

  @Public()
  @Post('webhooks/paymob')
  @HttpCode(HttpStatus.OK)
  async handlePaymobWebhook(@Req() req: Request & { rawBody?: string }, @Headers('x-paymob-signature') signature?: string) {
    return this.paymentsService.handlePaymobWebhook(req.rawBody ?? '', signature);
  }
}

