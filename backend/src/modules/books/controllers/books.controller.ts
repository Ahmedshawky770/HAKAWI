import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards, Inject, HttpCode, HttpStatus, Request } from '@nestjs/common';

import { Public } from '../../../common/decorators/roles.decorator.ts';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard.ts';
import { BooksService } from '../books.service.ts';
import { CreateBookDto, UpdateBookDto, BooksQueryDto, PurchaseBookDto, RentBookDto } from '../dto/books.dto.ts';
import type { CreateBookInput } from '../types.ts';

@Controller('books')
export class BooksController {
  constructor(@Inject(BooksService) private readonly booksService: BooksService) {}

  @Public()
  @Get()
  async findAll(@Query() query: BooksQueryDto) {
    return this.booksService.findAll(query);
  }

  @Public()
  @Get(':id')
  async findById(@Param('id') id: string) {
    return this.booksService.findById(id);
  }

  @Public()
  @Get('isbn/:isbn')
  async findByIsbn(@Param('isbn') isbn: string) {
    return this.booksService.findByIsbn(isbn);
  }

  @UseGuards(JwtAuthGuard)
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateBookDto, @Request() req: Request & { user: { sub: string } }) {
    return this.booksService.create(req.user.sub, dto as CreateBookInput);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateBookDto, @Request() req: Request & { user: { sub: string } }) {
    return this.booksService.update(id, dto, req.user.sub);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/publish')
  @HttpCode(HttpStatus.OK)
  async publish(@Param('id') id: string, @Request() req: Request & { user: { sub: string } }) {
    return this.booksService.publish(id, req.user.sub);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/archive')
  async archive(@Param('id') id: string, @Request() req: Request & { user: { sub: string } }) {
    return this.booksService.archive(id, req.user.sub);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/download')
  @HttpCode(HttpStatus.OK)
  async download(@Param('id') id: string, @Request() req: Request & { user: { sub: string } }) {
    await this.booksService.incrementDownloadCount(id);
    const book = await this.booksService.findById(id);
    return { downloadUrl: book.fileUrl };
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/purchase')
  @HttpCode(HttpStatus.CREATED)
  async purchase(@Param('id') id: string, @Body() dto: PurchaseBookDto, @Request() req: Request & { user: { sub: string } }) {
    return this.booksService.purchase(req.user.sub, id, dto.paymentMethodId);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/rent')
  @HttpCode(HttpStatus.CREATED)
  async rent(@Param('id') id: string, @Body() dto: RentBookDto, @Request() req: Request & { user: { sub: string } }) {
    return this.booksService.rent(req.user.sub, id, dto.durationDays);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param('id') id: string, @Request() req: Request & { user: { sub: string } }) {
    await this.booksService.delete(id, req.user.sub);
  }
}
