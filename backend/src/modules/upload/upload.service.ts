import { Injectable, Inject, Optional, ForbiddenException } from '@nestjs/common';
import type { S3 } from '@aws-sdk/client-s3';
import { PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { eq } from 'drizzle-orm';

import type { Upload } from '../../db/schema/upload.schema.ts';
import { uploads } from '../../db/schema/upload.schema.ts';
import { db } from '../../db/index.ts';
import { ValkeyService } from '../../common/services/valkey.service.ts';
import { WinstonLoggerService } from '../../common/services/winston-logger.service.ts';
import { CircuitBreakerService } from '../../common/resilience/circuit-breaker.service.js';

import type { UploadResponse } from './dto/upload-response.dto.ts';

@Injectable()
export class UploadService {
  private readonly bucket: string;
  private readonly cdnUrl: string;
  private readonly maxFileSize: number;
  private readonly allowedImageTypes: string[];
  private readonly allowedPdfTypes: string[];

  constructor(
    @Inject(WinstonLoggerService) private readonly logger: WinstonLoggerService,
    @Inject(ValkeyService) private readonly valkeyService: ValkeyService,
    @Inject(CircuitBreakerService) private readonly circuitBreaker: CircuitBreakerService,
    @Optional() private readonly s3Client?: S3,
  ) {
    this.bucket = process.env.STORAGE_BUCKET || 'hakawi-media';
    this.cdnUrl = process.env.STORAGE_CDN_URL || '';
    this.maxFileSize = parseInt(process.env.MAX_FILE_SIZE || '10485760', 10);
    this.allowedImageTypes = (process.env.ALLOWED_IMAGE_TYPES || 'image/jpeg,image/png,image/webp,image/gif').split(',');
    this.allowedPdfTypes = (process.env.ALLOWED_PDF_TYPES || 'application/pdf').split(',');
  }

  async generatePresignedUrl(filename: string, contentType: string, folder = 'uploads'): Promise<UploadResponse> {
    const uniqueFilename = `${folder}/${Date.now()}-${crypto.randomUUID()}-${filename.replace(/[^a-zA-Z0-9._-]/g, '')}`;

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: uniqueFilename,
      ContentType: contentType,
    });

    const url = await this.circuitBreaker.execute(
      's3-presigned-url',
      async () => getSignedUrl(this.s3Client as S3, command, { expiresIn: 3600 }),
    );
    const cdnUrl = this.cdnUrl ? `${this.cdnUrl}/${uniqueFilename}` : url;

    return {
      filename: uniqueFilename,
      originalName: filename,
      mimetype: contentType,
      size: 0,
      url,
      cdnUrl,
    };
  }

  async confirmUpload(filename: string, originalName: string, mimetype: string, size: number, uploadedById?: string, storyId?: string): Promise<Upload> {
    if (size > this.maxFileSize) {
      throw new ForbiddenException(`File size exceeds maximum of ${this.maxFileSize} bytes`);
    }

    const [upload] = await db.insert(uploads).values({
      filename,
      originalName,
      mimetype,
      size,
      url: this.cdnUrl ? `${this.cdnUrl}/${filename}` : filename,
      cdnUrl: this.cdnUrl ? `${this.cdnUrl}/${filename}` : null,
      uploadedById,
      storyId,
    }).returning();
    return upload;
  }

  async deleteFile(filename: string): Promise<void> {
    const command = new DeleteObjectCommand({ Bucket: this.bucket, Key: filename });
    await this.circuitBreaker.execute(
      's3-delete',
      async () => await this.s3Client?.send(command).catch(() => undefined),
    );
    await db.delete(uploads).where(eq(uploads.filename, filename));
  }

  async findByStory(storyId: string): Promise<Upload[]> {
    const result = await db.select().from(uploads).where(eq(uploads.storyId, storyId));
    return result;
  }
}
