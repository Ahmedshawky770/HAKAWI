import { Controller, Get, Param, Patch, UseGuards, Request, Body, Post } from '@nestjs/common';
import type { Request as ExpressRequest } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { UpdateUserDto, VerifyResponseDto } from './dto/users.dto.js';
import { UsersService } from './users.service.js';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get(':id')
  async findById(@Param('id') id: string) {
    return this.usersService.findById(id);
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() updateUserDto: UpdateUserDto) {
    return this.usersService.update(id, updateUserDto);
  }

  @Get(':id/stats')
  async getStats(@Param('id') id: string) {
    return this.usersService.getStats(id);
  }

  @Post(':id/verify')
  async verify(@Param('id') id: string): Promise<VerifyResponseDto> {
    return this.usersService.verify(id);
  }
}
