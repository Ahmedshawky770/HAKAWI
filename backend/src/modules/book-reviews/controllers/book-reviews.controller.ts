import { Controller, Get, Post, Body, Param } from '@nestjs/common';
import { Public } from '../../common/decorators/roles.decorator.js';
import { BookReviewsService } from '../services/book-reviews.service.js';

@Controller('book-reviews')
export class BookReviewsController {
  constructor(private readonly bookReviewsService: BookReviewsService) {}

  @Public()
  @Get()
  findAll() {
    return this.bookReviewsService.findAll();
  }

  @Public()
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.bookReviewsService.findOne(id);
  }

  @Post()
  create(@Body() data: unknown) {
    return this.bookReviewsService.create(data);
  }
}
