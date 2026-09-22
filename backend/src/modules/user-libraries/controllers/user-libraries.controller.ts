import { Controller, Get, Post, Body, Param } from '@nestjs/common';
import { Public } from '../../common/decorators/roles.decorator.js';
import { UserLibrariesService } from '../services/user-libraries.service.js';

@Controller('user-libraries')
export class UserLibrariesController {
  constructor(private readonly userLibrariesService: UserLibrariesService) {}

  @Public()
  @Get()
  findAll() {
    return this.userLibrariesService.findAll();
  }

  @Public()
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.userLibrariesService.findOne(id);
  }

  @Post()
  create(@Body() data: unknown) {
    return this.userLibrariesService.create(data);
  }
}
