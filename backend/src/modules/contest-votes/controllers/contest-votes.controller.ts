import { Controller, Get, Post, Body, Param } from '@nestjs/common';
import { Public } from '../../common/decorators/roles.decorator.js';
import { ContestVotesService } from '../services/contest-votes.service.js';

@Controller('contest-votes')
export class ContestVotesController {
  constructor(private readonly contestVotesService: ContestVotesService) {}

  @Public()
  @Get()
  findAll() {
    return this.contestVotesService.findAll();
  }

  @Public()
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.contestVotesService.findOne(id);
  }

  @Post()
  create(@Body() data: unknown) {
    return this.contestVotesService.create(data);
  }
}
