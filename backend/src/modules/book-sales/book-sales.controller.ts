import { Controller, Get, Post, Body, Param, UseGuards, Request } from '@nestjs/common';
import type { AuthRequest } from '../../common/types/auth-request.interface.js';
import { BookSalesService } from './services/book-sales.service.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { PurchaseBookDto } from './dto/book-sales.dto.js';

@Controller('books')
export class BookSalesController {
  constructor(private readonly bookSalesService: BookSalesService) {}

  @Post(':id/purchase')
  @UseGuards(JwtAuthGuard)
  async purchase(@Param('id') bookId: string, @Request() req: AuthRequest, @Body() purchaseDto: PurchaseBookDto) {
    return this.bookSalesService.purchase(bookId, req.user.sub, '', 0, 'EGP', 'digital');
  }
}
