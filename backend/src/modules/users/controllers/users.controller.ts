import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';

import { Public } from '../../../common/decorators/roles.decorator.ts';
import { Secured } from '../../../common/decorators/secured.decorator.ts';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard.ts';
import { RequireAdminRole, RequirePermissions } from '../../../common/decorators/roles.decorator.ts';
import { AccountType, AdminRole } from '../../../common/constants/roles.ts';
import { Permission } from '../../../common/permissions/permissions.ts';
import { CreateUserDto, UpdateUserDto, VerifyUserDto } from '../dto/users.dto.ts';
import { UsersService } from '../users.service.ts';
import { UserVerificationService } from '../services/user-verification.service.ts';
import type { CreateUserInput } from '../types.ts';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(
    @Inject(UsersService) private readonly usersService: UsersService,
    @Inject(UserVerificationService) private readonly verificationService: UserVerificationService,
  ) {}

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

  @Secured()
  @Get('me/verification')
  async getMyVerificationStatus(@Request() req: { user: { sub: string } }) {
    return this.verificationService.status(req.user.sub);
  }

  @Secured()
  @Post('me/verification')
  @HttpCode(HttpStatus.ACCEPTED)
  async requestMyVerification(@Request() req: { user: { sub: string } }) {
    const result = await this.verificationService.request(req.user.sub);
    return {
      userId: result.userId,
      alreadyVerified: result.alreadyVerified,
      cooldownSeconds: result.cooldownSeconds,
    };
  }

  @Public()
  @Post('verification/confirm')
  @HttpCode(HttpStatus.OK)
  async confirmVerification(@Body() dto: VerifyUserDto) {
    return this.verificationService.confirm(dto.token);
  }

  @Public()
  @Get(':id')
  async findById(@Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.findPublicProfile(id);
  }

  @Secured(AccountType.ADMIN)
  @RequireAdminRole(AdminRole.SUPER_ADMIN)
  @RequirePermissions(Permission.USERS_MANAGE_ALL)
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateUserDto) {
    return this.usersService.create(dto as unknown as CreateUserInput);
  }

  @Patch(':id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateUserDto: UpdateUserDto,
    @Request() req: { user: { sub: string; adminRole?: string } },
  ) {
    const isOwn = req.user.sub === id;
    const isAdmin = req.user.adminRole === AdminRole.SUPER_ADMIN || req.user.adminRole === AdminRole.MODERATOR;

    if (!isOwn && !isAdmin) {
      throw new ForbiddenException('You can only update your own profile');
    }

    return this.usersService.update(id, updateUserDto);
  }

  @Delete('me')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteMe(@Request() req: { user: { sub: string } }) {
    await this.usersService.softDelete(req.user.sub);
  }

  @Secured(AccountType.ADMIN)
  @RequireAdminRole(AdminRole.SUPER_ADMIN)
  @RequirePermissions(Permission.USERS_MANAGE_ALL)
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param('id', ParseUUIDPipe) id: string) {
    await this.usersService.softDelete(id);
  }
}
