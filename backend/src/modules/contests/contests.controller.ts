import { Controller, Get, Post, Body, Param, Query, UseGuards, Request, Patch, Delete } from '@nestjs/common';
import type { AuthRequest } from '../../common/types/auth-request.interface.js';
import { ContestsService, CONTEST_STATUS, PRIZE_TYPE } from './services/contests.service.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { CreateContestDto, UpdateContestDto, ContestFiltersDto } from './dto/contests.dto.js';

@Controller('contests')
export class ContestsController {
  constructor(private readonly contestsService: ContestsService) {}

  @Get()
  async findPublished(@Query() filters: ContestFiltersDto) {
    return this.contestsService.findPublished(filters);
  }

  @Get(':id')
  async findById(@Param('id') id: string) {
    return this.contestsService.findById(id);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  async create(@Request() req: AuthRequest, @Body() createContestDto: CreateContestDto) {
    return this.contestsService.create(req.user.sub, createContestDto);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  async update(@Param('id') id: string, @Request() req: AuthRequest, @Body() updateContestDto: UpdateContestDto) {
    return this.contestsService.update(id, req.user.sub, updateContestDto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  async delete(@Param('id') id: string, @Request() req: AuthRequest) {
    return this.contestsService.delete(id, req.user.sub);
  }

  @Post(':id/start')
  @UseGuards(JwtAuthGuard)
  async start(@Param('id') id: string, @Request() req: AuthRequest) {
    return this.contestsService.start(id, req.user.sub);
  }

  @Post(':id/end')
  @UseGuards(JwtAuthGuard)
  async end(@Param('id') id: string, @Request() req: AuthRequest) {
    return this.contestsService.end(id, req.user.sub);
  }
}
