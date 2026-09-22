import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards, Request } from '@nestjs/common';
import type { AuthRequest } from '../../common/types/auth-request.interface.js';
import { BooksService } from './services/books.service.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { CreateBookDto, UpdateBookDto, BookFiltersDto } from './dto/books.dto.js';

@Controller('books')
export class BooksController {
  constructor(private readonly booksService: BooksService) {}

  @Get()
  async findPublished(@Query() filters: BookFiltersDto) {
    return this.booksService.findPublished(filters);
  }

  @Get(':id')
  async findById(@Param('id') id: string) {
    return this.booksService.findById(id);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  async create(@Request() req: AuthRequest, @Body() createBookDto: CreateBookDto) {
    return this.booksService.create(req.user.sub, createBookDto);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  async update(@Param('id') id: string, @Request() req: AuthRequest, @Body() updateBookDto: UpdateBookDto) {
    return this.booksService.update(id, req.user.sub, updateBookDto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  async delete(@Param('id') id: string, @Request() req: AuthRequest) {
    return this.booksService.delete(id, req.user.sub);
  }
}
