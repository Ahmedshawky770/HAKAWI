import crypto from 'crypto';

import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';

import { Injectable, Inject, ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { eq } from 'drizzle-orm';
import type { Readable } from 'node:stream';

import type { Upload } from '../../db/schema/upload.schema.ts';
import { uploads } from '../../db/schema/upload.schema.ts';
import { db } from '../../db/index.ts';
import { ValkeyService } from '../../common/services/valkey.service.ts';
import { WinstonLoggerService } from '../../common/services/winston-logger.service.ts';
import { CircuitBreakerService } from '../../common/resilience/circuit-breaker.service.js';

import type { UploadResponse } from './dto/upload-response.dto.ts';
import { UPLOAD_FILENAME_PATTERN } from './dto/upload-response.dto.ts';

@Injectable()
export class UploadService {
  private readonly bucket: string;
  private readonly cdnUrl: string;
  private readonly publicApiUrl: string;
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
    this.publicApiUrl = (process.env.PUBLIC_API_URL || 'http://localhost:3001/api/v1').replace(/\/+$/, '');
    this.maxFileSize = parseInt(process.env.MAX_FILE_SIZE || '10485760', 10);
    this.allowedImageTypes = (process.env.ALLOWED_IMAGE_TYPES || 'image/jpeg,image/png,image/webp,image/gif').split(
      ',',
    );
    this.allowedPdfTypes = (process.env.ALLOWED_PDF_TYPES || 'application/pdf').split(',');
  }

  async generatePresignedUrl(filename: string, contentType: string, folder = 'uploads', size?: number, uploadedById?: string): Promise<UploadResponse> {
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      throw new BadRequestException('Filename contains unsupported characters');
    }
    if (size !== undefined && size > this.maxFileSize) {
      throw new ForbiddenException(`File size exceeds maximum of ${this.maxFileSize} bytes`);
    }
    const normalizedContentType = contentType.toLowerCase().trim();
    const isAllowed =
      this.allowedImageTypes.includes(normalizedContentType) || this.allowedPdfTypes.includes(normalizedContentType);
    if (!isAllowed) {
      throw new ForbiddenException(`File type ${contentType} is not allowed`);
    }

    const uniqueFilename = `${folder}/${Date.now()}-${crypto.randomUUID()}-${filename.replace(/[^a-zA-Z0-9._-]/g, '')}`;

    // Record that this key was minted by the presign flow for this caller, so `confirmUpload`
    // can reject any filename that was not generated here (or that belongs to another account).
    // Stored with a TTL matching the presigned PUT expiry (1 hour) plus a small grace window.
    if (this.valkeyService) {
      try {
        await this.valkeyService.set(`upload:pending:${uniqueFilename}`, uploadedById ?? '', 3600 + 300);
      } catch {
        // Valkey is unavailable: the confirm step treats a missing entry as "not signed" and fails
        // closed, so a transient outage locks out uploads for the duration of the outage rather
        // than silently bypassing the ownership check. That is the intended, safe default.
      }
    }

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: uniqueFilename,
      ContentType: normalizedContentType,
    });

    const url = await this.circuitBreaker.execute('s3-presigned-url', async () =>
      getSignedUrl(this.s3Client, command, { expiresIn: 3600 }),
    );
    const cdnUrl = this.cdnUrl
      ? `${this.cdnUrl.replace(/\/+$/, '')}/${uniqueFilename}`
      : `${this.publicApiUrl}/upload/file/${uniqueFilename}`;

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
    if (!UPLOAD_FILENAME_PATTERN.test(filename) || filename.includes('..')) {
      throw new BadRequestException('Filename contains unsupported characters');
    }
    const normalizedMimetype = mimetype.toLowerCase().trim();
    const isAllowed =
      this.allowedImageTypes.includes(normalizedMimetype) || this.allowedPdfTypes.includes(normalizedMimetype);
    if (!isAllowed) {
      throw new ForbiddenException(`File type ${mimetype} is not allowed`);
    }
    if (size > this.maxFileSize) {
      throw new ForbiddenException(`File size exceeds maximum of ${this.maxFileSize} bytes`);
    }

    // Reject keys that were not minted by `generatePresignedUrl` for this caller. The signed key
    // lives in Valkey under `upload:pending:<filename>` with the owning account id as its value,
    // so an attacker cannot point `confirmUpload` at an arbitrary S3 object (or a path-traversal
    // key) and have it recorded as their upload.
    //
    // FAIL-CLOSED ON VALKEY OUTAGE: if Valkey is configured but the read fails, the pending entry
    // cannot be verified, so the confirm is refused. Presigning still succeeds (its best-effort
    // write is allowed to fail), but no object is recorded without an ownership check that could
    // actually run. This is the safe direction: a transient Valkey outage delays uploads instead
    // of silently removing the ownership gate.
    if (this.valkeyService) {
      let owner: string | null = null;
      let readFailed = false;
      try {
        owner = await this.valkeyService.get(`upload:pending:${filename}`);
      } catch {
        readFailed = true;
      }
      if (readFailed) {
        throw new ForbiddenException('Unable to verify upload ownership; please retry');
      }
      if (owner === null) {
        throw new ForbiddenException('Upload was not presigned or has expired');
      }
      if (uploadedById && owner !== '' && owner !== uploadedById) {
        throw new ForbiddenException('Upload does not belong to this account');
      }
      // Consume the pending entry so a confirmed key cannot be re-confirmed or replayed.
      try {
        await this.valkeyService.del(`upload:pending:${filename}`);
      } catch {
        // Best-effort; the TTL will retire it anyway.
      }
    }

    // Defence in depth: the generated key must be a single safe path with no traversal segments.
    if (filename.includes('..') || filename.includes('\\') || !/^[A-Za-z0-9._/-]+$/.test(filename)) {
      throw new BadRequestException('Filename contains unsupported characters');
    }

    // Verify the bytes the client claims against what actually landed in storage. The client's
    // `size` and `mimetype` are assertions, not evidence: without this, an account could record an
    // upload as 1 byte and then serve a 5 GB object (or a different content type) through the
    // confirmed URL. HeadObject is authoritative for both.
    let verifiedSize = size;
    let verifiedContentType = normalizedMimetype;
    try {
      const head = await this.circuitBreaker.execute('s3-head', async () =>
        this.s3Client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: filename })),
      );
      if (head.ContentLength !== undefined) {
        verifiedSize = head.ContentLength;
      }
      if (head.ContentType) {
        verifiedContentType = head.ContentType.toLowerCase().trim();
      }
    } catch {
      throw new NotFoundException('Upload not found in storage');
    }
    if (verifiedContentType !== normalizedMimetype) {
      throw new BadRequestException('Uploaded content type does not match the declared mimetype');
    }
    if (verifiedSize > this.maxFileSize) {
      throw new ForbiddenException(`File size exceeds maximum of ${this.maxFileSize} bytes`);
    }

    const [upload] = await db
      .insert(uploads)
      .values({
        filename,
        originalName,
        mimetype: verifiedContentType,
        size: verifiedSize,
        url: this.cdnUrl
          ? `${this.cdnUrl.replace(/\/+$/, '')}/${filename}`
          : `${this.publicApiUrl}/upload/file/${filename}`,
        cdnUrl: this.cdnUrl
          ? `${this.cdnUrl.replace(/\/+$/, '')}/${filename}`
          : `${this.publicApiUrl}/upload/file/${filename}`,
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

  async getFile(filename: string): Promise<{ stream: Readable; contentType: string; contentLength?: number }> {
    if (filename.includes('..') || filename.includes('\\') || !/^[A-Za-z0-9._/-]+$/.test(filename)) {
      throw new BadRequestException('Filename contains unsupported characters');
    }
    // Only serve objects that were confirmed through `confirmUpload`. This prevents serving arbitrary
    // keys in the bucket (and the pre-signed-but-never-confirmed objects that presigning alone
    // created) through the public capability URL.
    const [record] = await db.select().from(uploads).where(eq(uploads.filename, filename)).limit(1);
    if (!record) {
      throw new NotFoundException('File not found');
    }
    const command = new GetObjectCommand({ Bucket: this.bucket, Key: filename });
    const result = await this.circuitBreaker.execute('s3-get', async () => {
      return this.s3Client.send(command);
    });
    if (!result.Body) {
      throw new NotFoundException('File not found');
    }
    return {
      stream: result.Body as Readable,
      contentType: result.ContentType || record.mimetype || 'application/octet-stream',
      contentLength: result.ContentLength,
    };
  }

  async findByStory(storyId: string): Promise<Upload[]> {
    const result = await db.select().from(uploads).where(eq(uploads.storyId, storyId));
    return result;
  }
}
