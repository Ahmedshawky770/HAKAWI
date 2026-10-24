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
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';

import { Public } from '../../../common/decorators/roles.decorator.ts';
import { Secured } from '../../../common/decorators/secured.decorator.ts';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard.ts';
import { RequireAdminRole, RequirePermissions } from '../../../common/decorators/roles.decorator.ts';
import { AccountType, AdminRole } from '../../../common/constants/roles.ts';
import { Permission } from '../../../common/permissions/permissions.ts';
import {
  CreatePublisherApplicationDto,
  ReviewPublisherApplicationDto,
  CreatePublisherWriterDto,
  UpdatePublisherWriterDto,
} from '../dto/publishers.dto.ts';
import { PublishersService } from '../services/publishers.service.ts';

@Controller('publishers')
@UseGuards(JwtAuthGuard)
export class PublishersController {
  constructor(@Inject(PublishersService) private readonly publishersService: PublishersService) {}

  @Secured(AccountType.ADMIN)
  @RequireAdminRole(AdminRole.VERIFICATION_OFFICER, AdminRole.SUPER_ADMIN)
  @RequirePermissions(Permission.USERS_VERIFY_ALL)
  @Get('admin/applications')
  async listApplicationsAdmin(
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.publishersService.listApplications(
      status,
      page ? Number(page) : 1,
      limit ? Number(limit) : 20,
    );
  }

  @Post('applications')
  @HttpCode(HttpStatus.CREATED)
  async submitApplication(
    @Request() req: { user: { sub: string } },
    @Body() dto: CreatePublisherApplicationDto,
  ) {
    return this.publishersService.submitApplication(req.user.sub, dto);
  }

  @Get('applications/me')
  async getMyApplication(@Request() req: { user: { sub: string } }) {
    return this.publishersService.getMyApplication(req.user.sub);
  }

  @Get('writers/me')
  async getMyWriters(@Request() req: { user: { sub: string } }) {
    return this.publishersService.getMyWriters(req.user.sub);
  }

  @Post('writers/me')
  @HttpCode(HttpStatus.CREATED)
  async addWriter(
    @Request() req: { user: { sub: string } },
    @Body() dto: CreatePublisherWriterDto,
  ) {
    return this.publishersService.addWriter(req.user.sub, dto);
  }

  @Patch('writers/me/:writerId')
  async updateWriter(
    @Request() req: { user: { sub: string } },
    @Param('writerId', ParseUUIDPipe) writerId: string,
    @Body() dto: UpdatePublisherWriterDto,
  ) {
    return this.publishersService.updateWriterLink(req.user.sub, writerId, dto);
  }

  @Delete('writers/me/:writerId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeWriter(
    @Request() req: { user: { sub: string } },
    @Param('writerId', ParseUUIDPipe) writerId: string,
  ) {
    await this.publishersService.removeWriter(req.user.sub, writerId);
  }

  // Admin endpoints

  @Secured(AccountType.ADMIN)
  @RequireAdminRole(AdminRole.SUPER_ADMIN, AdminRole.VERIFICATION_OFFICER)
  @RequirePermissions(Permission.USERS_VERIFY_ALL)
  @Get('applications')
  async listApplications(
    @Query('status') status?: string,
    @Query('page') page = 1,
    @Query('limit') limit = 20,
  ) {
    return this.publishersService.listApplications(status, Number(page), Number(limit));
  }

  @Secured(AccountType.ADMIN)
  @RequireAdminRole(AdminRole.SUPER_ADMIN, AdminRole.VERIFICATION_OFFICER)
  @RequirePermissions(Permission.USERS_VERIFY_ALL)
  @Get('applications/:id')
  async getApplication(@Param('id', ParseUUIDPipe) id: string) {
    return this.publishersService.getApplicationById(id);
  }

  @Secured(AccountType.ADMIN)
  @RequireAdminRole(AdminRole.SUPER_ADMIN, AdminRole.VERIFICATION_OFFICER)
  @RequirePermissions(Permission.USERS_VERIFY_ALL)
  @Patch('applications/:id/review')
  async reviewApplication(
    @Request() req: { user: { sub: string } },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReviewPublisherApplicationDto,
  ) {
    return this.publishersService.reviewApplication(req.user.sub, id, dto);
  }

  @Secured(AccountType.ADMIN)
  @RequireAdminRole(AdminRole.VERIFICATION_OFFICER, AdminRole.SUPER_ADMIN)
  @RequirePermissions(Permission.USERS_VERIFY_ALL)
  @Get('stats')
  async getStats() {
    return this.publishersService.getStats();
  }
}