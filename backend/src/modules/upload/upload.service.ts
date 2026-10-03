import crypto from 'crypto';

import { Injectable, Inject, ForbiddenException, NotFoundException } from '@nestjs/common';
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
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
    // No `@Optional()`: the client is provided by `UploadModule`, so a miss is a wiring bug that
    // must surface at boot rather than as a `TypeError` inside the first presign call.
    @Inject(S3Client) private readonly s3Client: S3Client,
  ) {
    this.bucket = process.env.STORAGE_BUCKET || 'hakawi-media';
    this.cdnUrl = process.env.STORAGE_CDN_URL || '';
    this.maxFileSize = parseInt(process.env.MAX_FILE_SIZE || '10485760', 10);
    this.allowedImageTypes = (process.env.ALLOWED_IMAGE_TYPES || 'image/jpeg,image/png,image/webp,image/gif').split(
      ',',
    );
    this.allowedPdfTypes = (process.env.ALLOWED_PDF_TYPES || 'application/pdf').split(',');
  }

  async generatePresignedUrl(filename: string, contentType: string, folder = 'uploads'): Promise<UploadResponse> {
    const normalizedContentType = contentType.toLowerCase().trim();
    const isAllowed =
      this.allowedImageTypes.includes(normalizedContentType) || this.allowedPdfTypes.includes(normalizedContentType);
    if (!isAllowed) {
      throw new ForbiddenException(`File type ${contentType} is not allowed`);
    }

    const uniqueFilename = `${folder}/${Date.now()}-${crypto.randomUUID()}-${filename.replace(/[^a-zA-Z0-9._-]/g, '')}`;

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: uniqueFilename,
      ContentType: normalizedContentType,
    });

    const url = await this.circuitBreaker.execute('s3-presigned-url', async () =>
      getSignedUrl(this.s3Client, command, { expiresIn: 3600 }),
    );
    const cdnUrl = this.cdnUrl ? `${this.cdnUrl}/${uniqueFilename}` : url;

    return {
      filename: uniqueFilename,
      originalName: filename,
      mimetype: normalizedContentType,
      size: 0,
      url,
      cdnUrl,
    };
  }

  async confirmUpload(
    filename: string,
    originalName: string,
    mimetype: string,
    size: number,
    uploadedById?: string,
    storyId?: string,
  ): Promise<Upload> {
    if (size > this.maxFileSize) {
      throw new ForbiddenException(`File size exceeds maximum of ${this.maxFileSize} bytes`);
    }

    const [upload] = await db
      .insert(uploads)
      .values({
        filename,
        originalName,
        mimetype,
        size,
        url: this.cdnUrl ? `${this.cdnUrl}/${filename}` : filename,
        cdnUrl: this.cdnUrl ? `${this.cdnUrl}/${filename}` : null,
        uploadedById,
        storyId,
      })
      .returning();
    return upload;
  }

  /**
   * Deletes an object and its row, but only for the account that uploaded it.
   *
   * WHY THE OWNERSHIP CHECK IS HERE AND NOT IN THE CONTROLLER. The route takes a bare filename, so
   * without a row lookup there is nothing to compare the caller against and any authenticated user
   * can delete any object in the bucket. `uploads.uploaded_by_id` (`migrations/0004`) is the only
   * record of who owns a key.
   *
   * WHY `NotFoundException` AND NOT `ForbiddenException`. A forbidden response for someone else's
   * key confirms the key exists, which turns this route into a filename-existence oracle. Reporting
   * "not found" for both cases keeps the endpoint indistinguishable.
   */
  async deleteFile(filename: string, userId: string, isSuperAdmin = false): Promise<void> {
    const [upload] = await db.select().from(uploads).where(eq(uploads.filename, filename)).limit(1);

    if (!upload || (upload.uploadedById !== userId && !isSuperAdmin)) {
      throw new NotFoundException('Upload not found');
    }

    const command = new DeleteObjectCommand({ Bucket: this.bucket, Key: filename });
    await this.circuitBreaker.execute('s3-delete', async () => {
      await this.s3Client.send(command);
    });
    await db.delete(uploads).where(eq(uploads.filename, filename));
  }

  async findByStory(storyId: string): Promise<Upload[]> {
    const result = await db.select().from(uploads).where(eq(uploads.storyId, storyId));
    return result;
  }
}
