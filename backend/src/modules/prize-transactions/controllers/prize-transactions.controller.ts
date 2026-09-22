import { Controller, Get, Post, Body, Param } from '@nestjs/common';
import { Public } from '../../common/decorators/roles.decorator.js';
import { PrizeTransactionsService } from '../services/prize-transactions.service.js';

@Controller('prize-transactions')
export class PrizeTransactionsController {
  constructor(private readonly prizeTransactionsService: PrizeTransactionsService) {}

  @Public()
  @Get()
  findAll() {
    return this.prizeTransactionsService.findAll();
  }

  @Public()
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.prizeTransactionsService.findOne(id);
  }

  @Post()
  create(@Body() data: unknown) {
    return this.prizeTransactionsService.create(data);
  }
}
