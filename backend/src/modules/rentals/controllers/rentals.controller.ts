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
import { RestrictionGuard } from '../../../common/guards/restriction.guard.ts';
import { RentalsService } from '../rentals.service.ts';
import { ExtendRentalDto, RentalsQueryDto } from '../dto/rentals.dto.ts';

@Controller('rentals')
export class RentalsController {
  constructor(@Inject(RentalsService) private readonly rentalsService: RentalsService) {}

  /**
   * THERE IS DELIBERATELY NO `POST /rentals`.
   *
   * The route used to exist and created an ACTIVE rental for nothing — a reader took the file of a
   * paid book for the price of one request, and the payment-first redesign of rentals
   * (`POST /books/:id/rent` → Paymob checkout → `RentalsEventHandler` creates the row on
   * `payment.completed`) left it standing as a second, free door into the same entitlement. It was
   * removed rather than guarded, because a route whose only purpose was to bypass the payment
   * cannot be fixed by a condition: the entitlement must arrive from money, not from a request.
   *
   * The client already uses the paid path, so nothing calls this route — its removal is invisible
   * to the product and visible only to a caller trying to get a book for nothing, who now gets a
   * 404.
   */
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

  @UseGuards(JwtAuthGuard, RestrictionGuard)
  @Post(':id/extend')
  @HttpCode(HttpStatus.OK)
  async extendRental(
    @Param('id') id: string,
    @Body() dto: ExtendRentalDto,
    @Request() req: Request & { user: { sub: string } },
  ) {
    // The reader's CHOICE, not a gateway handle — the same two words the
    // purchase and the rental take, resolved by the server to this merchant's
    // Paymob method id.
    return this.rentalsService.extendRental(id, dto.extensionDays ?? 7, req.user.sub, dto.paymentMethod);
  }

  @UseGuards(JwtAuthGuard, RestrictionGuard)
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
