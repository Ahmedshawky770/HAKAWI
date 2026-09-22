import { Controller, Get, Post, Delete, Body, Param, UseGuards, Request } from '@nestjs/common';
import type { AuthRequest } from '../../common/types/auth-request.interface.js';
import { UserRestrictionsService, RESTRICTION_TYPE } from './services/user-restrictions.service.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { CreateUserRestrictionDto } from './dto/user-restrictions.dto.js';

@Controller('moderation')
export class UserRestrictionsController {
  constructor(private readonly restrictionsService: UserRestrictionsService) {}

  @Post('restrictions')
  @UseGuards(JwtAuthGuard)
  async create(@Request() req: AuthRequest, @Body() createRestrictionDto: CreateUserRestrictionDto) {
    return this.restrictionsService.create({ 
      ...createRestrictionDto, 
      userId: req.user.sub, 
      createdBy: req.user.sub,
      expiresAt: createRestrictionDto.expiresAt ? new Date(createRestrictionDto.expiresAt) : null,
    });
  }

  @Get('restrictions')
  @UseGuards(JwtAuthGuard)
  async findByUserId(@Request() req: AuthRequest) {
    return this.restrictionsService.findByUserId(req.user.sub);
  }

  @Delete('restrictions/:id')
  @UseGuards(JwtAuthGuard)
  async delete(@Param('id') id: string) {
    await this.restrictionsService.delete(id);
    return { success: true };
  }
}
