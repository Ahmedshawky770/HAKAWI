import { Controller, Get, Post, Param, UseGuards, Inject, HttpCode, HttpStatus, Request, Body, Query } from '@nestjs/common';

import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard.ts';
import { RentalsService } from '../rentals.service.ts';
import { CreateRentalDto, ExtendRentalDto, RentalsQueryDto } from '../dto/rentals.dto.ts';
import type { CreateRentalInput } from '../types.ts';

@Controller('rentals')
export class RentalsController {
  constructor(@Inject(RentalsService) private readonly rentalsService: RentalsService) {}

  @UseGuards(JwtAuthGuard)
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createRental(@Body() dto: CreateRentalDto, @Request() req: Request & { user: { sub: string } }) {
    return this.rentalsService.createRental(req.user.sub, dto as CreateRentalInput);
  }

  @UseGuards(JwtAuthGuard)
  @Get('my')
  async findMyRentals(@Query() query: RentalsQueryDto, @Request() req: Request & { user: { sub: string } }) {
    return this.rentalsService.findMyRentals(req.user.sub, query);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  async findById(@Param('id') id: string) {
    return this.rentalsService.findById(id);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/extend')
  @HttpCode(HttpStatus.OK)
  async extendRental(@Param('id') id: string, @Body() dto: ExtendRentalDto) {
    return this.rentalsService.extendRental(id, dto.extensionDays ?? 7);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/return')
  @HttpCode(HttpStatus.OK)
  async returnRental(@Param('id') id: string) {
    return this.rentalsService.returnRental(id);
  }

  @UseGuards(JwtAuthGuard)
  @Get('overdue')
  async findOverdue() {
    return this.rentalsService.findOverdue();
  }
}
