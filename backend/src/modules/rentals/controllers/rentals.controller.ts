import {
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
