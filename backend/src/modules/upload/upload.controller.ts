import {
  Body,
  Controller,
  Post,
  Delete,
  Param,
  UseGuards,
  Inject,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';

import { Public } from '../../common/decorators/roles.decorator.ts';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.ts';
import { ThrottleTier } from '../../common/decorators/throttle-tier.decorator.ts';

import { UploadService } from './upload.service.ts';
import { GenerateUploadUrlDto, UPLOAD_FILENAME_PATTERN } from './dto/upload-response.dto.ts';

@ThrottleTier('upload')
@Controller('upload')
export class UploadController {
  constructor(@Inject(UploadService) private readonly uploadService: UploadService) {}

  @Public()
  @Post('image')
  async generateImageUploadUrl(@Body() body: GenerateUploadUrlDto) {
    const filename = this.resolveFilename(body.filename, 'image.png');
    const contentType = body.contentType || 'image/png';
    return this.uploadService.generatePresignedUrl(filename, contentType, 'images');
  }

  @Public()
  @Post('pdf')
  async generatePdfUploadUrl(@Body() body: GenerateUploadUrlDto) {
    const filename = this.resolveFilename(body.filename, 'document.pdf');
    const contentType = body.contentType || 'application/pdf';
    return this.uploadService.generatePresignedUrl(filename, contentType, 'pdfs');
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':filename')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteFile(@Param('filename') filename: string) {
    if (!UPLOAD_FILENAME_PATTERN.test(filename)) {
      throw new BadRequestException('Filename contains unsupported characters');
    }
    await this.uploadService.deleteFile(filename);
  }

  private resolveFilename(requested: string | undefined, fallback: string): string {
    if (requested === undefined || requested.length === 0) {
      return fallback;
    }
    if (!UPLOAD_FILENAME_PATTERN.test(requested)) {
      throw new BadRequestException('Filename contains unsupported characters');
    }
    return requested;
  }
}
