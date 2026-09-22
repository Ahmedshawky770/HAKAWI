import { Controller, Get, Post, Body, Param } from '@nestjs/common';
import { Public } from '../../common/decorators/roles.decorator.js';
import { ContestsService } from '../services/contests.service.js';

@Controller('contests')
export class ContestsController {
  constructor(private readonly contestsService: ContestsService) {}

  @Public()
  @Get()
  findAll() {
    return this.contestsService.findAll();
  }

  @Public()
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.contestsService.findOne(id);
  }

  @Post()
  create(@Body() data: unknown) {
    return this.contestsService.create(data);
  }
}
