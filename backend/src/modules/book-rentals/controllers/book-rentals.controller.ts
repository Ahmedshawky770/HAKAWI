import { Controller, Get, Post, Body, Param } from '@nestjs/common';
import { Public } from '../../common/decorators/roles.decorator.js';
import { BookRentalsService } from '../services/book-rentals.service.js';

@Controller('book-rentals')
export class BookRentalsController {
  constructor(private readonly bookRentalsService: BookRentalsService) {}

  @Public()
  @Get()
  findAll() {
    return this.bookRentalsService.findAll();
  }

  @Public()
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.bookRentalsService.findOne(id);
  }

  @Post()
  create(@Body() data: unknown) {
    return this.bookRentalsService.create(data);
  }
}
