import { Controller, Get, Post, Body, Param, UseGuards, Request } from '@nestjs/common';
import type { AuthRequest } from '../../common/types/auth-request.interface.js';
import { BookRentalsService } from './services/book-rentals.service.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { RentBookDto } from './dto/book-rentals.dto.js';

@Controller('books')
export class BookRentalsController {
  constructor(private readonly bookRentalsService: BookRentalsService) {}

  @Post(':id/rent')
  @UseGuards(JwtAuthGuard)
  async rent(@Param('id') bookId: string, @Request() req: AuthRequest, @Body() rentDto: RentBookDto) {
    return this.bookRentalsService.rent(bookId, req.user.sub, rentDto.rentalDuration, 0, 0, 0, new Date(), new Date());
  }

  @Post('rentals/:id/extend')
  @UseGuards(JwtAuthGuard)
  async extend(@Param('id') rentalId: string, @Request() req: AuthRequest, @Body() body: { days: number; price: number }) {
    return this.bookRentalsService.extend(rentalId, req.user.sub, body.days, body.price);
  }
}
