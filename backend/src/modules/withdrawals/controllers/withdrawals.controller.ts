import { Controller, Get, Post, Body, Param } from '@nestjs/common';
import { Public } from '../../common/decorators/roles.decorator.js';
import { WithdrawalsService } from '../services/withdrawals.service.js';

@Controller('withdrawals')
export class WithdrawalsController {
  constructor(private readonly withdrawalsService: WithdrawalsService) {}

  @Public()
  @Get()
  findAll() {
    return this.withdrawalsService.findAll();
  }

  @Public()
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.withdrawalsService.findOne(id);
  }

  @Post()
  create(@Body() data: unknown) {
    return this.withdrawalsService.create(data);
  }
}
