import { Controller, Get, Post, Body, Param, UseGuards, Request } from '@nestjs/common';
import type { AuthRequest } from '../../common/types/auth-request.interface.js';
import { BookReviewsService } from './services/book-reviews.service.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { CreateBookReviewDto } from './dto/book-reviews.dto.js';

@Controller('books')
export class BookReviewsController {
  constructor(private readonly bookReviewsService: BookReviewsService) {}

  @Get(':id/reviews')
  async findByBookId(@Param('id') bookId: string) {
    return this.bookReviewsService.findByBookId(bookId);
  }

  @Post(':id/reviews')
  @UseGuards(JwtAuthGuard)
  async create(@Param('id') bookId: string, @Request() req: AuthRequest, @Body() createReviewDto: CreateBookReviewDto) {
    return this.bookReviewsService.create(req.user.sub, bookId, createReviewDto);
  }
}
