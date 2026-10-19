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
import { RequireAdminRole, RequirePermissions, RequireMfa } from '../../../common/decorators/roles.decorator.ts';
import { AccountType, AdminRole } from '../../../common/constants/roles.ts';
import { Permission } from '../../../common/permissions/permissions.ts';
import { CreateUserDto, UpdateUserDto, UpgradeDto, VerifyUserDto } from '../dto/users.dto.ts';
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
    const updateInput: UpdateUserDto = { ...updateUserDto };
    // caller can never change their own accountType/adminRole — escalates only via admin
    delete updateInput.accountType;
    delete updateInput.adminRole;
    return this.usersService.update(req.user.sub, updateInput);
  }

  @Post('me/upgrade')
  @HttpCode(HttpStatus.OK)
  async upgrade(
    @Request() req: { user: { sub: string; adminRole?: string } },
    @Body() dto: UpgradeDto,
  ) {
    const callerRole = req.user.adminRole;
    const isSuperAdmin = callerRole === AdminRole.SUPER_ADMIN;
    const isVerificationOfficer = callerRole === AdminRole.VERIFICATION_OFFICER;
    const approvedByAdmin = isSuperAdmin || isVerificationOfficer;
    return this.usersService.upgradeAccount(req.user.sub, dto.target, approvedByAdmin);
  }

  @Post('me/professional-request')
  @HttpCode(HttpStatus.OK)
  async professionalRequest(@Request() req: { user: { sub: string } }) {
    return this.usersService.checkProfessionalEligibility(req.user.sub);
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
  @RequireMfa()
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
    const callerRole = req.user.adminRole;
    const isSuperAdmin = callerRole === AdminRole.SUPER_ADMIN;

    const updateInput: UpdateUserDto = { ...updateUserDto };

    if (isOwn) {
      // caller cannot escalate their own accountType/adminRole
      delete updateInput.accountType;
      delete updateInput.adminRole;
    } else {
      // super_admin can change any accountType; verification_officer may
      // provision a publisher account or approve a professional upgrade
      const allowed =
        isSuperAdmin ||
        (callerRole === AdminRole.VERIFICATION_OFFICER &&
          (updateInput.accountType === AccountType.PUBLISHER || updateInput.accountType === AccountType.PROFESSIONAL));
      if (!allowed) {
        throw new ForbiddenException('You can only update your own profile');
      }
    }

    return this.usersService.update(id, updateInput as UpdateUserDto);
  }

  @Delete('me')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteMe(@Request() req: { user: { sub: string } }) {
    await this.usersService.softDelete(req.user.sub);
  }

  @Secured(AccountType.ADMIN)
  @RequireAdminRole(AdminRole.SUPER_ADMIN)
  @RequirePermissions(Permission.USERS_MANAGE_ALL)
  @RequireMfa()
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param('id', ParseUUIDPipe) id: string) {
    await this.usersService.softDelete(id);
  }
}
