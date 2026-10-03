import {
  Body,
  Controller,
  Post,
  Delete,
  Get,
  Param,
  Query,
  UseGuards,
  Inject,
  HttpCode,
  HttpStatus,
  BadRequestException,
  Request,
} from '@nestjs/common';

import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.ts';
import { ThrottleTier } from '../../common/decorators/throttle-tier.decorator.ts';

import { UploadService } from './upload.service.ts';
import { ConfirmUploadDto, GenerateUploadUrlDto, UPLOAD_FILENAME_PATTERN } from './dto/upload-response.dto.ts';

interface AuthenticatedRequest {
  user: { sub: string; adminRole?: string };
}

@ThrottleTier('upload')
@Controller('upload')
export class UploadController {
  constructor(@Inject(UploadService) private readonly uploadService: UploadService) {}

  @UseGuards(JwtAuthGuard)
  @Post('image')
  async generateImageUploadUrl(@Body() body: GenerateUploadUrlDto) {
    const filename = this.resolveFilename(body.filename, 'image.png');
    const contentType = body.contentType || 'image/png';
    return this.uploadService.generatePresignedUrl(filename, contentType, 'images');
  }

  @UseGuards(JwtAuthGuard)
  @Post('pdf')
  async generatePdfUploadUrl(@Body() body: GenerateUploadUrlDto) {
    const filename = this.resolveFilename(body.filename, 'document.pdf');
    const contentType = body.contentType || 'application/pdf';
    return this.uploadService.generatePresignedUrl(filename, contentType, 'pdfs');
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
  @UseGuards(JwtAuthGuard)
  @Post('confirm')
  @HttpCode(HttpStatus.CREATED)
  async confirmUpload(@Body() body: ConfirmUploadDto, @Request() req: AuthenticatedRequest) {
    if (!UPLOAD_FILENAME_PATTERN.test(body.filename)) {
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

  @UseGuards(JwtAuthGuard)
  @Delete(':filename')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteFile(@Param('filename') filename: string, @Request() req: AuthenticatedRequest) {
    if (!UPLOAD_FILENAME_PATTERN.test(filename)) {
      throw new BadRequestException('Filename contains unsupported characters');
    }
    await this.uploadService.deleteFile(filename, req.user.sub, req.user.adminRole === 'super_admin');
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
