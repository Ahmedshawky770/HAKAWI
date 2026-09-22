import { Controller, Get, Post, Body, Param, UseGuards, Request, Patch, Query } from '@nestjs/common';
import { ReportsService, REPORT_STATUS, MODERATION_ACTION } from './services/reports.service.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { ResolveReportDto } from './dto/reports.dto.js';
import type { UpdateReportData, ReportStatus } from './services/reports.service.js';

@Controller('moderation')
export class ModerationController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('reports')
  @UseGuards(JwtAuthGuard)
  async findReports(@Query('status') status?: ReportStatus) {
    if (status) {
      return this.reportsService.findByStatus(status);
    }
    return this.reportsService.findOpenReports();
  }

  @Get('reports/:id')
  @UseGuards(JwtAuthGuard)
  async findReport(@Param('id') id: string) {
    return this.reportsService.findById(id);
  }

  @Patch('reports/:id')
  @UseGuards(JwtAuthGuard)
  async updateReport(@Param('id') id: string, @Body() updateDto: ResolveReportDto) {
    const updateData: Partial<UpdateReportData> = {
      status: 'resolved',
      resolution: updateDto.action,
      resolvedAt: new Date(),
    };
    return this.reportsService.update(id, updateData);
  }

  @Get('stats')
  @UseGuards(JwtAuthGuard)
  async getStats() {
    const openReports = await this.reportsService.findOpenReports();
    return {
      openReports: openReports.length,
      totalReports: openReports.length,
    };
  }
}
