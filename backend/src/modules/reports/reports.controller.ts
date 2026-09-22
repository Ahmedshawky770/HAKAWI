import { Controller, Get, Post, Body, Param, UseGuards, Request, Query } from '@nestjs/common';
import type { AuthRequest } from '../../common/types/auth-request.interface.js';
import { ReportsService, REPORT_STATUS } from './services/reports.service.js';
import type { ReportStatus } from './services/reports.service.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { CreateReportDto, ResolveReportDto } from './dto/reports.dto.js';

@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  async create(@Request() req: AuthRequest, @Body() createReportDto: CreateReportDto) {
    return this.reportsService.create(req.user.sub, createReportDto);
  }

  @Get('my-reports')
  @UseGuards(JwtAuthGuard)
  async findMyReports(@Request() req: AuthRequest) {
    return this.reportsService.findByReporterId(req.user.sub);
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  async findAll(@Query('status') status?: ReportStatus) {
    if (status) {
      return this.reportsService.findByStatus(status);
    }
    return this.reportsService.findOpenReports();
  }

  @Get(':id')
  async findById(@Param('id') id: string) {
    return this.reportsService.findById(id);
  }
}
