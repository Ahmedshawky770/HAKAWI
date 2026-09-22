import { Controller, Get, Post, Delete, Body, Param, UseGuards, Request } from '@nestjs/common';
import type { AuthRequest } from '../../common/types/auth-request.interface.js';
import { RentalExtensionsService } from './services/rental-extensions.service.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { ExtendRentalDto } from './dto/rental-extensions.dto.js';

@Controller('rental-extensions')
export class RentalExtensionsController {
  constructor(private readonly rentalExtensionsService: RentalExtensionsService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  async create(@Request() req: AuthRequest, @Body() extendRentalDto: ExtendRentalDto) {
    return this.rentalExtensionsService.create({
      userId: req.user.sub,
      rentalId: extendRentalDto.rentalId,
      oldEndDate: new Date(),
      newEndDate: new Date(),
      extensionPrice: 0,
    });
  }

  @Get('rental/:rentalId')
  @UseGuards(JwtAuthGuard)
  async findByRentalId(@Param('rentalId') rentalId: string) {
    return this.rentalExtensionsService.findByRentalId(rentalId);
  }
}
