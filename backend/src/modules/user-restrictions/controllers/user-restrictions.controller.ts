import { Controller, Get, Post, Body, Param } from '@nestjs/common';
import { Public } from '../../common/decorators/roles.decorator.js';
import { UserRestrictionsService } from '../services/user-restrictions.service.js';

@Controller('user-restrictions')
export class UserRestrictionsController {
  constructor(private readonly userRestrictionsService: UserRestrictionsService) {}

  @Public()
  @Get()
  findAll() {
    return this.userRestrictionsService.findAll();
  }

  @Public()
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.userRestrictionsService.findOne(id);
  }

  @Post()
  create(@Body() data: unknown) {
    return this.userRestrictionsService.create(data);
  }
}
