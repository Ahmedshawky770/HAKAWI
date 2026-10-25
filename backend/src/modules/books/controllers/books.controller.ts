import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Inject,
  HttpCode,
  HttpStatus,
  Request,
} from '@nestjs/common';

import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard.ts';
import { RestrictionGuard } from '../../../common/guards/restriction.guard.ts';
import type { AuthRequest } from '../../../common/types/auth-request.interface.ts';
import { BooksService } from '../books.service.ts';
import { CreateBookDto, UpdateBookDto, BooksQueryDto, PurchaseBookDto, RentBookDto } from '../dto/books.dto.ts';
import type { CreateBookInput } from '../types.ts';
import { toBookResponse, isContentAdmin } from '../types.ts';

@Controller('books')
export class BooksController {
  constructor(@Inject(BooksService) private readonly booksService: BooksService) {}

  @UseGuards(JwtAuthGuard, RestrictionGuard)
  @Get()
  async findAll(@Query() query: BooksQueryDto, @Request() req: AuthRequest) {
    return this.booksService.findAll({
      ...query,
      userId: req.user.sub,
      isAdmin: isContentAdmin(req.user.accountType, req.user.adminRole),
    });
  }

  @UseGuards(JwtAuthGuard, RestrictionGuard)
  @Get('isbn/:isbn')
  async findByIsbn(@Param('isbn') isbn: string, @Request() req: AuthRequest) {
    return toBookResponse(await this.booksService.findByIsbn(isbn, req.user.sub, isContentAdmin(req.user.accountType, req.user.adminRole)));
  }

  @UseGuards(JwtAuthGuard, RestrictionGuard)
  @Get(':id')
  async findById(@Param('id') id: string, @Request() req: AuthRequest) {
    return toBookResponse(await this.booksService.findById(id, req.user.sub, isContentAdmin(req.user.accountType, req.user.adminRole)));
  }

  @UseGuards(JwtAuthGuard, RestrictionGuard)
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateBookDto, @Request() req: Request & { user: { sub: string } }) {
    return this.booksService.create(req.user.sub, dto as CreateBookInput);
  }

  @UseGuards(JwtAuthGuard, RestrictionGuard)
  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateBookDto,
    @Request() req: Request & { user: { sub: string } },
  ) {
    return this.booksService.update(id, dto, req.user.sub);
  }

  @UseGuards(JwtAuthGuard, RestrictionGuard)
  @Post(':id/publish')
  @HttpCode(HttpStatus.OK)
  async publish(@Param('id') id: string, @Request() req: Request & { user: { sub: string } }) {
    return this.booksService.publish(id, req.user.sub);
  }

  @UseGuards(JwtAuthGuard, RestrictionGuard)
  @Post(':id/archive')
  async archive(@Param('id') id: string, @Request() req: Request & { user: { sub: string } }) {
    return this.booksService.archive(id, req.user.sub);
  }

  @UseGuards(JwtAuthGuard, RestrictionGuard)
  @Post(':id/download')
  @HttpCode(HttpStatus.OK)
  async download(@Param('id') id: string, @Request() req: Request & { user: { sub: string } }) {
    // The caller's identity travels with the request because the file of a paid book is an
    // entitlement, not public content: `recordDownload` decides — free, owned, or inside an active
    // rental — before the URL is handed over, and it records the download in the same call.
    const book = await this.booksService.recordDownload(id, req.user.sub);
    return { downloadUrl: book.fileUrl };
  }

  @UseGuards(JwtAuthGuard, RestrictionGuard)
  @Post(':id/purchase')
  @HttpCode(HttpStatus.CREATED)
  async purchase(
    @Param('id') id: string,
    @Body() dto: PurchaseBookDto,
    @Request() req: Request & { user: { sub: string } },
  ) {
    // The reader's CHOICE, not a gateway handle: `PurchaseBookDto.paymentMethod` is "card" or
    // "wallet", and the service resolves it to this merchant's Paymob method id.
    return this.booksService.purchase(req.user.sub, id, dto.paymentMethod);
  }

  @UseGuards(JwtAuthGuard, RestrictionGuard)
  @Post(':id/rent')
  @HttpCode(HttpStatus.CREATED)
  async rent(@Param('id') id: string, @Body() dto: RentBookDto, @Request() req: Request & { user: { sub: string } }) {
    return this.booksService.rent(req.user.sub, id, dto.durationDays, dto.paymentMethod);
  }

  @UseGuards(JwtAuthGuard, RestrictionGuard)
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param('id') id: string, @Request() req: Request & { user: { sub: string } }) {
    await this.booksService.delete(id, req.user.sub);
  }
}
