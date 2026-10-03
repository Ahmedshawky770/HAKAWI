import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  Inject,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';

import { Public, RequireAdminRole, RequirePermissions } from '../../../common/decorators/roles.decorator.ts';
import { Secured } from '../../../common/decorators/secured.decorator.ts';
import { AccountType, AdminRole } from '../../../common/constants/roles.ts';
import { Permission } from '../../../common/permissions/permissions.ts';
import { CategoriesService } from '../categories.service.ts';
import { CreateCategoryDto, UpdateCategoryDto } from '../dto/categories.dto.ts';

@Controller('categories')
export class CategoriesController {
  constructor(@Inject(CategoriesService) private readonly categoriesService: CategoriesService) {}

  @Public()
  @Get()
  async findAll() {
    return this.categoriesService.findAll();
  }

  @Public()
  @Get(':id')
  async findById(@Param('id') id: string) {
    return this.categoriesService.findById(id);
  }

  @Public()
  @Get('slug/:slug')
  async findBySlug(@Param('slug') slug: string) {
    return this.categoriesService.findBySlug(slug);
  }

  @Secured(AccountType.ADMIN)
  @RequireAdminRole(AdminRole.CONTENT_MODERATOR)
  @RequirePermissions(Permission.CONTENT_EDIT_ALL)
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateCategoryDto) {
    return this.categoriesService.create(dto);
  }

  @Secured(AccountType.ADMIN)
  @RequireAdminRole(AdminRole.CONTENT_MODERATOR)
  @RequirePermissions(Permission.CONTENT_EDIT_ALL)
  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateCategoryDto) {
    return this.categoriesService.update(id, dto);
  }

  @Secured(AccountType.ADMIN)
  @RequireAdminRole(AdminRole.CONTENT_MODERATOR)
  @RequirePermissions(Permission.CONTENT_EDIT_ALL)
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param('id') id: string) {
    await this.categoriesService.delete(id);
  }
}
