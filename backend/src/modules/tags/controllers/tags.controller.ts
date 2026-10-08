import { Controller, Get, Post, Patch, Body, Param, Inject, HttpCode, HttpStatus } from '@nestjs/common';

import { Public, RequireAdminRole, RequirePermissions } from '../../../common/decorators/roles.decorator.ts';
import { Secured } from '../../../common/decorators/secured.decorator.ts';
import { AccountType, AdminRole } from '../../../common/constants/roles.ts';
import { Permission } from '../../../common/permissions/permissions.ts';
import { TagsService } from '../tags.service.ts';
import { CreateTagDto, UpdateTagDto } from '../dto/tags.dto.ts';

@Controller('tags')
export class TagsController {
  constructor(@Inject(TagsService) private readonly tagsService: TagsService) {}

  @Public()
  @Get()
  async findAll() {
    return this.tagsService.findAll();
  }

  @Public()
  @Get(':id')
  async findById(@Param('id') id: string) {
    return this.tagsService.findById(id);
  }

  @Public()
  @Get('slug/:slug')
  async findBySlug(@Param('slug') slug: string) {
    return this.tagsService.findBySlug(slug);
  }

  @Secured(AccountType.ADMIN)
  @RequireAdminRole(AdminRole.CONTENT_MODERATOR)
  @RequirePermissions(Permission.CONTENT_EDIT_ALL)
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateTagDto) {
    return this.tagsService.create(dto);
  }

  @Secured(AccountType.ADMIN)
  @RequireAdminRole(AdminRole.CONTENT_MODERATOR)
  @RequirePermissions(Permission.CONTENT_EDIT_ALL)
  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateTagDto) {
    return this.tagsService.update(id, dto);
  }
}
