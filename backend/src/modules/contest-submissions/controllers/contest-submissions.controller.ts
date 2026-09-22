import { Controller, Get, Post, Body, Param } from '@nestjs/common';
import { Public } from '../../common/decorators/roles.decorator.js';
import { ContestSubmissionsService } from '../services/contest-submissions.service.js';

@Controller('contest-submissions')
export class ContestSubmissionsController {
  constructor(private readonly contestSubmissionsService: ContestSubmissionsService) {}

  @Public()
  @Get()
  findAll() {
    return this.contestSubmissionsService.findAll();
  }

  @Public()
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.contestSubmissionsService.findOne(id);
  }

  @Post()
  create(@Body() data: unknown) {
    return this.contestSubmissionsService.create(data);
  }
}
