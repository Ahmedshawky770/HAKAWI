import { Controller, Get, Post, Body, Param } from '@nestjs/common';
import { Public } from '../../common/decorators/roles.decorator.js';
import { RefundsService } from '../services/refunds.service.js';

@Controller('refunds')
export class RefundsController {
  constructor(private readonly refundsService: RefundsService) {}

  @Public()
  @Get()
  findAll() {
    return this.refundsService.findAll();
  }

  @Public()
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.refundsService.findOne(id);
  }

  @Post()
  create(@Body() data: unknown) {
    return this.refundsService.create(data);
  }
}
