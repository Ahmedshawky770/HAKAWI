import { Controller, Get, Post, Body, Param } from '@nestjs/common';
import { Public } from '../../common/decorators/roles.decorator.js';
import { RentalExtensionsService } from '../services/rental-extensions.service.js';

@Controller('rental-extensions')
export class RentalExtensionsController {
  constructor(private readonly rentalExtensionsService: RentalExtensionsService) {}

  @Public()
  @Get()
  findAll() {
    return this.rentalExtensionsService.findAll();
  }

  @Public()
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.rentalExtensionsService.findOne(id);
  }

  @Post()
  create(@Body() data: unknown) {
    return this.rentalExtensionsService.create(data);
  }
}
