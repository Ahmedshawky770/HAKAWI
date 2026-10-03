import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  Inject,
  HttpCode,
  HttpStatus,
  Request,
  Headers,
  Req,
  ForbiddenException,
} from '@nestjs/common';

import { Public } from '../../../common/decorators/roles.decorator.ts';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard.ts';
import { AdminRole } from '../../../common/constants/roles.ts';
import { PaymentsService } from '../payments.service.ts';
import { CreatePaymentDto, UpdatePaymentStatusDto, CreateRefundDto, PaymentsQueryDto } from '../dto/payments.dto.ts';

@Controller('payments')
export class PaymentsController {
  constructor(@Inject(PaymentsService) private readonly paymentsService: PaymentsService) {}

  @UseGuards(JwtAuthGuard)
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createPayment(@Body() dto: CreatePaymentDto, @Request() req: Request & { user: { sub: string } }) {
    // WHY `initializeGateway: true`: this route is part of the published API contract, and a payment
    // left in `pending` with no `paymobOrderId` and no checkout URL can never be paid — no webhook
    // can match an order that was never registered upstream. Initialising here is what makes the
    // response (which carries the iframe and accept URLs) usable. The alternative — deleting the
    // route and leaving payment creation to the purchase flow — would contradict
    // `docs/api-contract/openapi/rest-api-spec.md`.
    //
    // The owner is always the authenticated caller; `CreatePaymentDto` has no `userId` field, so a
    // body cannot name somebody else's account (and the global `forbidNonWhitelisted` pipe would
    // reject such a request outright rather than silently ignore it).
    return this.paymentsService.createPayment(
      {
        userId: req.user.sub,
        amount: dto.amount,
        currency: dto.currency,
        paymentMethod: dto.paymentMethod,
        description: dto.description ?? null,
      },
      { initializeGateway: true },
    );
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  async findById(@Param('id') id: string, @Request() req: { user: { sub: string; adminRole?: string } }) {
    const payment = await this.paymentsService.findById(id);

    const isOwner = payment.userId === req.user.sub;
    const isAdmin =
      req.user.adminRole === AdminRole.SUPER_ADMIN ||
      req.user.adminRole === AdminRole.MODERATOR ||
      req.user.adminRole === AdminRole.FINANCE;

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
  async updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdatePaymentStatusDto,
    @Request() req: { user: { sub: string; adminRole?: string } },
  ) {
    const isAdmin =
      req.user.adminRole === AdminRole.SUPER_ADMIN ||
      req.user.adminRole === AdminRole.MODERATOR ||
      req.user.adminRole === AdminRole.FINANCE;

    if (!isAdmin) {
      throw new ForbiddenException('Only admins can update payment status');
    }

    return this.paymentsService.updateStatus(id, dto.status);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/refund')
  @HttpCode(HttpStatus.CREATED)
  async createRefund(
    @Param('id') id: string,
    @Body() dto: CreateRefundDto,
    @Request() req: { user: { sub: string; adminRole?: string } },
  ) {
    const payment = await this.paymentsService.findById(id);

    const isOwner = payment.userId === req.user.sub;
    const isAdmin =
      req.user.adminRole === AdminRole.SUPER_ADMIN ||
      req.user.adminRole === AdminRole.MODERATOR ||
      req.user.adminRole === AdminRole.FINANCE;

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
  async handlePaymobWebhook(
    @Req() req: Request & { rawBody?: string },
    @Headers('x-paymob-signature') signature?: string,
  ) {
    return this.paymentsService.handlePaymobWebhook(req.rawBody ?? '', signature);
  }
}
