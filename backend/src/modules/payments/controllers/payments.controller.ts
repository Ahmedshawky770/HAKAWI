import { Controller, Get, Post, Body, Param } from '@nestjs/common';
import { Public } from '../../common/decorators/roles.decorator.js';
import { PaymentsService } from '../services/payments.service.js';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Public()
  @Get()
  findAll() {
    return this.paymentsService.findAll();
  }

  @Public()
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.paymentsService.findOne(id);
  }

  @Post()
  create(@Body() data: unknown) {
    return this.paymentsService.create(data);
  }
}
