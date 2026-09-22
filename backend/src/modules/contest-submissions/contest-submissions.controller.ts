import { Controller, Get, Post, Body, Param, UseGuards, Request } from '@nestjs/common';
import type { AuthRequest } from '../../common/types/auth-request.interface.js';
import { ContestSubmissionsService, SUBMISSION_STATUS } from './services/contest-submissions.service.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { CreateContestSubmissionDto } from './dto/contest-submissions.dto.js';

@Controller('contests')
export class ContestSubmissionsController {
  constructor(private readonly submissionsService: ContestSubmissionsService) {}

  @Get(':id/submissions')
  async findByContestId(@Param('id') contestId: string) {
    return this.submissionsService.findByContestId(contestId);
  }

  @Post(':id/submit')
  @UseGuards(JwtAuthGuard)
  async create(@Param('id') contestId: string, @Request() req: AuthRequest, @Body() createSubmissionDto: CreateContestSubmissionDto) {
    return this.submissionsService.create(req.user.sub, { ...createSubmissionDto, contestId, authorId: req.user.sub, status: 'pending' });
  }
}
