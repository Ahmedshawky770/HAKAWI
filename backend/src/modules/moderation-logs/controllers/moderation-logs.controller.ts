import { Controller, Get, Post, Body, Param } from '@nestjs/common';
import { Public } from '../../common/decorators/roles.decorator.js';
import { ModerationLogsService } from '../services/moderation-logs.service.js';

@Controller('moderation-logs')
export class ModerationLogsController {
  constructor(private readonly moderationLogsService: ModerationLogsService) {}

  @Public()
  @Get()
  findAll() {
    return this.moderationLogsService.findAll();
  }

  @Public()
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.moderationLogsService.findOne(id);
  }

  @Post()
  create(@Body() data: unknown) {
    return this.moderationLogsService.create(data);
  }
}
