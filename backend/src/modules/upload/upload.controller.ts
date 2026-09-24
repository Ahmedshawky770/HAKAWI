import { Controller, Post, Delete, Param, UseGuards, Inject, Body, HttpCode, HttpStatus } from '@nestjs/common';

import { Public } from '../../common/decorators/roles.decorator.ts';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.ts';

import { UploadService } from './upload.service.ts';

@Controller('upload')
export class UploadController {
  constructor(@Inject(UploadService) private readonly uploadService: UploadService) {}

  @Public()
  @Post('image')
  async generateImageUploadUrl(@Body() body: { filename?: string; contentType?: string }) {
    const filename = body.filename || 'image.png';
    const contentType = body.contentType || 'image/png';
    return this.uploadService.generatePresignedUrl(filename, contentType, 'images');
  }

  @Public()
  @Post('pdf')
  async generatePdfUploadUrl(@Body() body: { filename?: string; contentType?: string }) {
    const filename = body.filename || 'document.pdf';
    const contentType = body.contentType || 'application/pdf';
    return this.uploadService.generatePresignedUrl(filename, contentType, 'pdfs');
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':filename')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteFile(@Param('filename') filename: string) {
    await this.uploadService.deleteFile(filename);
  }
}
