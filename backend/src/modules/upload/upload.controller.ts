import {
  Body,
  Controller,
  Post,
  Delete,
  Get,
  Param,
  UseGuards,
  Inject,
  HttpCode,
  HttpStatus,
  BadRequestException,
  Request,
  StreamableFile,
  Res,
} from '@nestjs/common';

import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.ts';
import { RestrictionGuard } from '../../common/guards/restriction.guard.ts';
import { ThrottleTier } from '../../common/decorators/throttle-tier.decorator.ts';
import { Public } from '../../common/decorators/roles.decorator.ts';

import { UploadService } from './upload.service.ts';
import type { Response as ExpressResponse } from 'express';
import { ConfirmUploadDto, GenerateUploadUrlDto, UPLOAD_FILENAME_PATTERN } from './dto/upload-response.dto.ts';

interface AuthenticatedRequest {
  user: { sub: string; adminRole?: string };
}

@ThrottleTier('upload')
@Controller('upload')
export class UploadController {
  constructor(@Inject(UploadService) private readonly uploadService: UploadService) {}

  @UseGuards(JwtAuthGuard, RestrictionGuard)
  @Post('image')
  async generateImageUploadUrl(@Body() body: GenerateUploadUrlDto, @Request() req: AuthenticatedRequest) {
    const filename = this.resolveFilename(body.filename, 'image.png');
    const contentType = body.contentType || 'image/png';
    return this.uploadService.generatePresignedUrl(filename, contentType, 'images', body.size, req.user.sub);
  }

  @UseGuards(JwtAuthGuard, RestrictionGuard)
  @Post('pdf')
  async generatePdfUploadUrl(@Body() body: GenerateUploadUrlDto, @Request() req: AuthenticatedRequest) {
    const filename = this.resolveFilename(body.filename, 'document.pdf');
    const contentType = body.contentType || 'application/pdf';
    return this.uploadService.generatePresignedUrl(filename, contentType, 'pdfs', body.size, req.user.sub);
  }

  /**
   * Records a completed upload against the caller.
   *
   * WHY THIS ROUTE HAS TO EXIST. `UploadService.confirmUpload` is the only writer of
   * `uploads.uploaded_by_id` (`migrations/0004`), and without it every row in `uploads` has
   * `uploaded_by_id = NULL` — which makes the ownership check on `DELETE /upload/:filename` deny
   * everyone, including the account that just uploaded the file. The presigned PUT goes straight to
   * S3 and never passes through this API, so the application has to be told the upload finished.
   */
  @UseGuards(JwtAuthGuard, RestrictionGuard)
  @Post('confirm')
  @HttpCode(HttpStatus.CREATED)
  async confirmUpload(@Body() body: ConfirmUploadDto, @Request() req: AuthenticatedRequest) {
    if (!UPLOAD_FILENAME_PATTERN.test(body.filename) || body.filename.includes('..')) {
      throw new BadRequestException('Filename contains unsupported characters');
    }
    return this.uploadService.confirmUpload(
      body.filename,
      body.originalName,
      body.mimetype,
      body.size,
      req.user.sub,
      body.storyId,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Get('story/:storyId')
  async findByStory(@Param('storyId') storyId: string) {
    return this.uploadService.findByStory(storyId);
  }

  @Public()
  @Get('file/*')
  async serveFile(@Request() req: AuthenticatedRequest & { params?: Record<string, string>; url?: string }, @Res({ passthrough: true }) res: ExpressResponse) {
    // The filename may contain slashes (e.g. "images/foo.png"); Express wildcard
    // captures the rest of the path.
    const raw = (req.params && req.params[0]) || req.url?.split('/upload/file/')[1] || '';
    const filename = decodeURIComponent(raw.split('?')[0]);
    if (!filename || filename.includes('..') || filename.includes('\\') || !UPLOAD_FILENAME_PATTERN.test(filename)) {
      throw new BadRequestException('Filename contains unsupported characters');
    }
    const file = await this.uploadService.getFile(filename);
    res.set({
      'Content-Type': file.contentType,
      ...(file.contentLength ? { 'Content-Length': String(file.contentLength) } : {}),
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'public, max-age=31536000, immutable',
    });
    return new StreamableFile(file.stream);
  }
  @UseGuards(JwtAuthGuard, RestrictionGuard)
  @Delete('*')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteFile(@Request() req: AuthenticatedRequest & { params?: Record<string, string>; url?: string }) {
    const raw = req.params?.[0] || req.url?.split('/upload/')[1] || '';
    const filename = decodeURIComponent(String(raw).split('?')[0]);
    if (!filename || !UPLOAD_FILENAME_PATTERN.test(filename) || filename.includes('..')) {
      throw new BadRequestException('Filename contains unsupported characters');
    }
    await this.uploadService.deleteFile(filename, req.user.sub, req.user.adminRole === 'super_admin');
  }

  private resolveFilename(requested: string | undefined, fallback: string): string {
    if (requested === undefined || requested.length === 0) {
      return fallback;
    }
    if (requested.includes('..') || requested.includes('/') || requested.includes('\\') || requested.includes('\u0000')) {
      throw new BadRequestException('Filename contains unsupported characters');
    }
    return requested;
  }
}
