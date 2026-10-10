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
import { ReadingProgressService } from '../reading-progress.service.ts';
import {
  CreateReadingProgressDto,
  UpdateReadingProgressDto,
  ReadingProgressQueryDto,
} from '../dto/reading-progress.dto.ts';

@Controller('reading-progress')
export class ReadingProgressController {
  constructor(@Inject(ReadingProgressService) private readonly readingProgressService: ReadingProgressService) {}

  @UseGuards(JwtAuthGuard)
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateReadingProgressDto, @Request() req: Request & { user: { sub: string } }) {
    return this.readingProgressService.create(req.user.sub, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  async findById(@Param('id') id: string, @Request() req: Request & { user: { sub: string } }) {
    return this.readingProgressService.findById(id, req.user.sub);
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  async findMyProgress(@Query() query: ReadingProgressQueryDto, @Request() req: Request & { user: { sub: string } }) {
    return this.readingProgressService.findMyProgress(req.user.sub, query);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateReadingProgressDto,
    @Request() req: Request & { user: { sub: string } },
  ) {
    return this.readingProgressService.update(id, req.user.sub, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param('id') id: string, @Request() req: Request & { user: { sub: string } }) {
    await this.readingProgressService.delete(id, req.user.sub);
  }
}
