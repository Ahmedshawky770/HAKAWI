import { Controller, Get, Post, Body, Param } from '@nestjs/common';
import { Public } from '../../common/decorators/roles.decorator.js';
import { ContestBadgesService } from '../services/contest-badges.service.js';

@Controller('contest-badges')
export class ContestBadgesController {
  constructor(private readonly contestBadgesService: ContestBadgesService) {}

  @Public()
  @Get()
  findAll() {
    return this.contestBadgesService.findAll();
  }

  @Public()
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.contestBadgesService.findOne(id);
  }

  @Post()
  create(@Body() data: unknown) {
    return this.contestBadgesService.create(data);
  }
}
