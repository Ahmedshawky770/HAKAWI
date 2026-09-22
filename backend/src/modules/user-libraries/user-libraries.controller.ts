import { Controller, Get, Post, Body, Param, UseGuards, Request } from '@nestjs/common';
import type { AuthRequest } from '../../common/types/auth-request.interface.js';
import { UserLibrariesService } from './services/user-libraries.service.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';

@Controller('library')
export class UserLibrariesController {
  constructor(private readonly userLibrariesService: UserLibrariesService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  async findByUserId(@Request() req: AuthRequest) {
    return this.userLibrariesService.findByUserId(req.user.sub);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  async create(@Request() req: AuthRequest, @Body() body: { bookId: string; accessType: string }) {
    return this.userLibrariesService.create(req.user.sub, body.bookId, body.accessType);
  }
}
