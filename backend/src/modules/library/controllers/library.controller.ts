import { Controller, Get, Post, Delete, Body, Param, Query, UseGuards, Inject, HttpCode, HttpStatus, Request } from '@nestjs/common';

import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard.ts';
import { LibraryService } from '../library.service.ts';
import { AddToLibraryDto, LibraryQueryDto } from '../dto/library.dto.ts';
import type { LibraryQuery } from '../types.ts';

@Controller('library')
export class LibraryController {
  constructor(@Inject(LibraryService) private readonly libraryService: LibraryService) {}

  @UseGuards(JwtAuthGuard)
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async addToLibrary(@Body() dto: AddToLibraryDto, @Request() req: Request & { user: { sub: string } }) {
    return this.libraryService.addToLibrary(req.user.sub, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  async findMyLibrary(@Query() query: LibraryQueryDto, @Request() req: Request & { user: { sub: string } }) {
    const libraryQuery: LibraryQuery = { ...query, userId: req.user.sub };
    return this.libraryService.findMyLibrary(req.user.sub, libraryQuery);
  }

  @UseGuards(JwtAuthGuard)
  @Get('count')
  async count(@Request() req: Request & { user: { sub: string } }) {
    return this.libraryService.count(req.user.sub);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/access')
  @HttpCode(HttpStatus.OK)
  async accessItem(@Param('id') id: string) {
    return this.libraryService.accessItem(id);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeFromLibrary(@Param('id') id: string, @Request() req: Request & { user: { sub: string } }) {
    await this.libraryService.removeFromLibrary(id, req.user.sub);
  }
}
