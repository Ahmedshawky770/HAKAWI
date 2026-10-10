import {
  BadRequestException,
  Controller,
  Get,
  Post,
  Param,
  UseGuards,
  Inject,
  HttpCode,
  HttpStatus,
  Request,
  Body,
  Query,
} from '@nestjs/common';

import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard.ts';
import { RentalsService } from '../rentals.service.ts';
import { CreateRentalDto, ExtendRentalDto, RentalsQueryDto } from '../dto/rentals.dto.ts';
import type { CreateRentalRequest } from '../types.ts';

@Controller('rentals')
export class RentalsController {
  constructor(@Inject(RentalsService) private readonly rentalsService: RentalsService) {}

  @UseGuards(JwtAuthGuard)
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createRental(@Body() dto: CreateRentalDto, @Request() req: Request & { user: { sub: string } }) {
    return this.rentalsService.createRental(req.user.sub, dto as CreateRentalRequest);
  }

  @UseGuards(JwtAuthGuard)
  @Get('my')
  async findMyRentals(@Query() query: RentalsQueryDto, @Request() req: Request & { user: { sub: string } }) {
    return this.rentalsService.findMyRentals(req.user.sub, query);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  async findById(@Param('id') id: string, @Request() req: Request & { user: { sub: string } }) {
    return this.rentalsService.findById(id, req.user.sub);
  }

  /**
   * `GET /rentals/:id/extend/quote` — the price of an extension, before any money moves.
   *
   * WHY A QUOTE ROUTE EXISTS. `POST /rentals/:id/extend` now initialises a payment, so calling it
   * would take the reader to a checkout for an extension they may not be permitted — not their rental,
   * not active, cap already reached, duration not offered. The quote runs every one of those checks and
   * returns the amount, so nothing is charged until the reader has seen the price and chosen to pay it.
   *
   * `createRental` has no equivalent quote route because `POST /books/:id/rent` already returns a
   * checkout the client can display, and the book's own detail response carries the price.
   */
  @UseGuards(JwtAuthGuard)
  @Get(':id/extend/quote')
  async quoteExtension(
    @Param('id') id: string,
    @Query('days') days: string,
    @Request() req: Request & { user: { sub: string } },
  ) {
    const extensionDays = Number(days);
    if (!Number.isInteger(extensionDays)) {
      throw new BadRequestException('days must be an integer');
    }
    return this.rentalsService.quoteExtension(id, extensionDays, req.user.sub);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/extend')
  @HttpCode(HttpStatus.OK)
  async extendRental(
    @Param('id') id: string,
    @Body() dto: ExtendRentalDto,
    @Request() req: Request & { user: { sub: string } },
  ) {
    return this.rentalsService.extendRental(id, dto.extensionDays ?? 7, req.user.sub);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/return')
  @HttpCode(HttpStatus.OK)
  async returnRental(@Param('id') id: string, @Request() req: Request & { user: { sub: string } }) {
    return this.rentalsService.returnRental(id, req.user.sub);
  }

  @UseGuards(JwtAuthGuard)
  @Get('overdue')
  async findOverdue() {
    return this.rentalsService.findOverdue();
  }
}
