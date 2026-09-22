import { Controller, Get, Post, Body, Param, UseGuards, Request, Query } from '@nestjs/common';
import type { Request as ExpressRequest } from 'express';
import { ModerationLogsService } from './services/moderation-logs.service.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';

@Controller('moderation')
export class ModerationLogsController {
  constructor(private readonly logsService: ModerationLogsService) {}

  @Get('logs')
  @UseGuards(JwtAuthGuard)
  async findRecent(@Request() req: ExpressRequest, @Query('limit') limit?: string) {
    return this.logsService.findRecent(limit ? parseInt(limit) : 50);
  }

  @Get('logs/:id')
  @UseGuards(JwtAuthGuard)
  async findById(@Param('id') id: string) {
    return this.logsService.findById(id);
  }
}
