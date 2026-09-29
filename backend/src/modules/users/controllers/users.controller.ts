import { Controller, Get, Param, Patch, UseGuards, Body, Inject, Request, ParseUUIDPipe, ForbiddenException } from '@nestjs/common';

import { Public } from '../../../common/decorators/roles.decorator.ts';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard.ts';
import { AdminRole } from '../../../common/constants/roles.ts';
import { UpdateUserDto } from '../dto/users.dto.ts';
import { UsersService } from '../users.service.ts';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(@Inject(UsersService) private readonly usersService: UsersService) {}

  @Public()
  @Get(':id/stats')
  async getUserStats(@Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.getUserStats(id);
  }

  @Get('me')
  async findMe(@Request() req: { user: { sub: string } }) {
    return this.usersService.findById(req.user.sub);
  }

  @Patch('me')
  async updateMe(@Request() req: { user: { sub: string } }, @Body() updateUserDto: UpdateUserDto) {
    return this.usersService.update(req.user.sub, updateUserDto);
  }

  @Public()
  @Get(':id')
  async findById(@Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.findPublicProfile(id);
  }

  @Patch(':id')
  async update(@Param('id', ParseUUIDPipe) id: string, @Body() updateUserDto: UpdateUserDto, @Request() req: { user: { sub: string; adminRole?: string } }) {
    const isOwn = req.user.sub === id;
    const isAdmin = req.user.adminRole === AdminRole.SUPER_ADMIN || req.user.adminRole === AdminRole.MODERATOR;

    if (!isOwn && !isAdmin) {
      throw new ForbiddenException('You can only update your own profile');
    }

    return this.usersService.update(id, updateUserDto);
  }
}