import { Controller, Get, Post, Body, Param } from '@nestjs/common';
import { Public } from '../../common/decorators/roles.decorator.js';
import { StoryCategoriesService } from '../services/story-categories.service.js';

@Controller('story-categories')
export class StoryCategoriesController {
  constructor(private readonly storyCategoriesService: StoryCategoriesService) {}

  @Public()
  @Get()
  findAll() {
    return this.storyCategoriesService.findAll();
  }

  @Public()
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.storyCategoriesService.findOne(id);
  }

  @Post()
  create(@Body() data: unknown) {
    return this.storyCategoriesService.create(data);
  }
}
