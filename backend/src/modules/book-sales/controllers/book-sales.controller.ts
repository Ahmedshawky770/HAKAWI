import { Controller, Get, Post, Body, Param } from '@nestjs/common';
import { Public } from '../../common/decorators/roles.decorator.js';
import { BookSalesService } from '../services/book-sales.service.js';

@Controller('book-sales')
export class BookSalesController {
  constructor(private readonly bookSalesService: BookSalesService) {}

  @Public()
  @Get()
  findAll() {
    return this.bookSalesService.findAll();
  }

  @Public()
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.bookSalesService.findOne(id);
  }

  @Post()
  create(@Body() data: unknown) {
    return this.bookSalesService.create(data);
  }
}
