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
import { RequireMfa } from '../../../common/decorators/roles.decorator.ts';
import { RequireAdminRole } from '../../../common/decorators/roles.decorator.ts';
import { RequirePermissions } from '../../../common/decorators/roles.decorator.ts';
import { Secured } from '../../../common/decorators/secured.decorator.ts';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard.ts';
import { RestrictionGuard } from '../../../common/guards/restriction.guard.ts';
import { AdminRole } from '../../../common/constants/roles.ts';
import { Permission } from '../../../common/permissions/permissions.ts';
import { AccountType } from '../../../common/constants/roles.ts';
import { PaymentsService } from '../payments.service.ts';
import { CreatePaymentDto, UpdatePaymentStatusDto, CreateRefundDto, PaymentsQueryDto } from '../dto/payments.dto.ts';

@Controller('payments')
export class PaymentsController {
  constructor(@Inject(PaymentsService) private readonly paymentsService: PaymentsService) {}

  @Secured(AccountType.ADMIN)
  @RequireAdminRole(AdminRole.FINANCIAL_OFFICER, AdminRole.SUPER_ADMIN)
  @RequirePermissions(Permission.FINANCIAL_READ_ALL)
  @Get('admin')
  async findAllAdmin(@Query() query: PaymentsQueryDto) {
    return this.paymentsService.findAll({ status: query.status, page: query.page, limit: query.limit });
  }

  @Secured(AccountType.ADMIN)
  @RequireAdminRole(AdminRole.FINANCIAL_OFFICER, AdminRole.SUPER_ADMIN)
  @RequirePermissions(Permission.FINANCIAL_READ_ALL)
  @Get('admin/stats')
  async getAdminStats() {
    return this.paymentsService.getAdminStats();
  }

  @Secured()
  @UseGuards(RestrictionGuard)
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createPayment(@Body() dto: CreatePaymentDto, @Request() req: Request & { user: { sub: string } }) {
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

  @Secured()
  @Get(':id')
  async findById(@Param('id') id: string, @Request() req: { user: { sub: string; adminRole?: string } }) {
    const payment = await this.paymentsService.findById(id);

    const isOwner = payment.userId === req.user.sub;
    const isFinanceAdmin = req.user.adminRole === AdminRole.FINANCIAL_OFFICER || req.user.adminRole === AdminRole.SUPER_ADMIN;

    if (!isOwner && !isFinanceAdmin) {
      throw new ForbiddenException('You can only view your own payments');
    }

    return payment;
  }

  @Secured()
  @Get()
  async findAll(@Query() query: PaymentsQueryDto, @Request() req: Request & { user: { sub: string } }) {
    return this.paymentsService.findAll({ ...query, userId: req.user.sub });
  }

  @Secured(AccountType.ADMIN)
  @RequireAdminRole(AdminRole.FINANCIAL_OFFICER, AdminRole.SUPER_ADMIN)
  @RequirePermissions(Permission.FINANCIAL_MANAGE_ALL)
  @RequireMfa()
  @Patch(':id/status')
  async updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdatePaymentStatusDto,
    @Request() req: { user: { sub: string } },
  ) {
    return this.paymentsService.updateStatus(id, dto.status);
  }

  @Secured(AccountType.ADMIN)
  @RequireAdminRole(AdminRole.FINANCIAL_OFFICER, AdminRole.SUPER_ADMIN)
  @RequirePermissions(Permission.FINANCIAL_MANAGE_ALL)
  @RequireMfa()
  @Post(':id/refund')
  @HttpCode(HttpStatus.CREATED)
  async createRefund(
    @Param('id') id: string,
    @Body() dto: CreateRefundDto,
    @Request() req: { user: { sub: string; adminRole?: string } },
  ) {
    const payment = await this.paymentsService.findById(id);

    const isOwner = payment.userId === req.user.sub;
    const isFinanceAdmin = req.user.adminRole === AdminRole.FINANCIAL_OFFICER || req.user.adminRole === AdminRole.SUPER_ADMIN;

    if (!isOwner && !isFinanceAdmin) {
      throw new ForbiddenException('You can only request refunds for your own payments');
    }

    return this.paymentsService.createRefund(id, dto.amount, dto.reason);
  }

  @Secured()
  @Get(':id/refunds')
  async getRefunds(@Param('id') id: string, @Request() req: { user: { sub: string; adminRole?: string } }) {
    const payment = await this.paymentsService.findById(id);

    const isOwner = payment.userId === req.user.sub;
    const isFinanceAdmin = req.user.adminRole === AdminRole.FINANCIAL_OFFICER || req.user.adminRole === AdminRole.SUPER_ADMIN;

    if (!isOwner && !isFinanceAdmin) {
      throw new ForbiddenException('You can only view refunds for your own payments');
    }

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
