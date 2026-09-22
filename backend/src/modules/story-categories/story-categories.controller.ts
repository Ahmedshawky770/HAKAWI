import { Controller, Get, UseGuards, Request, Param } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { StoryCategoriesService } from '../story-categories/services/story-categories.service.js';

@Controller('story-categories')
export class StoryCategoriesController {
  constructor(private readonly categoriesService: StoryCategoriesService) {}

  @Get()
  async findAll() {
    return this.categoriesService.findAll();
  }

  @Get(':id')
  async findById(@Param('id') id: string) {
    return this.categoriesService.findById(id);
  }
}
