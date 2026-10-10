import type { Server } from 'http';

import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { ValkeyService } from '../../common/services/valkey.service.ts';
import { WinstonLoggerService } from '../../common/services/winston-logger.service.ts';
import { JwtService } from '@nestjs/jwt';
import { ConfigModule } from '@nestjs/config';

import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.ts';

import { UploadController } from './upload.controller.ts';
import { UploadService } from './upload.service.ts';

// vi.mocked() returns `any` when the mock property is typed ReturnType<typeof vi.fn> (= any).
// This is a vitest typing limitation — mocks are correctly typed and tests pass.
/* eslint-disable @typescript-eslint/no-non-null-assertion */

const JWT_SECRET = 'test-jwt-secret-for-controller-specs';

async function generateToken(sub = 'user-1', email = 'test@example.com', accountType = 'reader'): Promise<string> {
  return new JwtService({ secret: JWT_SECRET }).signAsync({ sub, email, accountType });
}

type MockUploadService = {
  generatePresignedUrl: ReturnType<typeof vi.fn>;
  confirmUpload: ReturnType<typeof vi.fn>;
  findByStory: ReturnType<typeof vi.fn>;
  deleteFile: ReturnType<typeof vi.fn>;
};

describe('UploadController', () => {
  let app: INestApplication;
  let httpServer: Server;
  let uploadService: MockUploadService;

  beforeAll(async () => {
    uploadService = {
      generatePresignedUrl: vi.fn(),
      confirmUpload: vi.fn(),
      findByStory: vi.fn(),
      deleteFile: vi.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, load: [] })],
      controllers: [UploadController],
      providers: [
        {
          provide: UploadService,
          useValue: uploadService,
        },
        JwtAuthGuard,
        {
          provide: JwtService,
          useValue: new JwtService({ secret: JWT_SECRET }),
        },
        // `@Secured` composes `RestrictionGuard`, which injects `ValkeyService` and the logger.
        // This module is hand-built rather than importing `CommonModule`, so both must be provided
        // here or Nest fails at DI resolution before any assertion runs.
        { provide: ValkeyService, useValue: { exists: vi.fn().mockResolvedValue(false), get: vi.fn(), set: vi.fn() } },
        {
          provide: WinstonLoggerService,
          useValue: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn(), log: vi.fn(), verbose: vi.fn() },
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    // The same pipe `main.ts` installs, with the same options. Without it this spec asserted 201
    // for a request that production answers with 400 — the decorators on ConfirmUploadDto were
    // never executed, so `@Min(0)` and `@IsUUID` were untested despite being written.
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    await app.init();
    httpServer = app.getHttpServer() as Server;
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /upload/image', () => {
    it('should generate image upload URL', async () => {
      const token = await generateToken();
      vi.mocked(uploadService.generatePresignedUrl).mockResolvedValue({
        filename: 'images/test.png',
        originalName: 'test.png',
        mimetype: 'image/png',
        size: 0,
        url: 'https://s3.amazonaws.com/bucket/images/test.png',
        cdnUrl: 'https://cdn.example.com/images/test.png',
      });

      const res = await request(httpServer)
        .post('/upload/image')
        .set('Authorization', `Bearer ${token}`)
        .send({ filename: 'test.png', contentType: 'image/png' })
        .expect(201);

      expect(res.body).toHaveProperty('url');
      expect(uploadService.generatePresignedUrl).toHaveBeenCalledWith('test.png', 'image/png', 'images');
    });

    // Both presign routes used to be `@Public()`, so anyone on the internet could mint a signed
    // PutObject URL for the bucket. Presigning is a storage-write primitive, so it is now
    // authenticated like the rest of the write surface.
    it('should reject an unauthenticated request', async () => {
      await request(httpServer).post('/upload/image').send({ filename: 'test.png' }).expect(401);

      expect(uploadService.generatePresignedUrl).not.toHaveBeenCalled();
    });
  });

  describe('POST /upload/pdf', () => {
    it('should generate PDF upload URL', async () => {
      const token = await generateToken();
      vi.mocked(uploadService.generatePresignedUrl).mockResolvedValue({
        filename: 'pdfs/test.pdf',
        originalName: 'test.pdf',
        mimetype: 'application/pdf',
        size: 0,
        url: 'https://s3.amazonaws.com/bucket/pdfs/test.pdf',
        cdnUrl: 'https://cdn.example.com/pdfs/test.pdf',
      });

      const res = await request(httpServer)
        .post('/upload/pdf')
        .set('Authorization', `Bearer ${token}`)
        .send({ filename: 'test.pdf', contentType: 'application/pdf' })
        .expect(201);

      expect(res.body).toHaveProperty('url');
      expect(uploadService.generatePresignedUrl).toHaveBeenCalledWith('test.pdf', 'application/pdf', 'pdfs');
    });

    it('should reject an unauthenticated request', async () => {
      await request(httpServer).post('/upload/pdf').send({ filename: 'test.pdf' }).expect(401);

      expect(uploadService.generatePresignedUrl).not.toHaveBeenCalled();
    });
  });

  describe('POST /upload/confirm', () => {
    it('should record the upload against the caller', async () => {
      const token = await generateToken('user-1', 'test@example.com', 'reader');
      vi.mocked(uploadService.confirmUpload).mockResolvedValue({ id: 'upload-1' });

      await request(httpServer)
        .post('/upload/confirm')
        .set('Authorization', `Bearer ${token}`)
        .send({ filename: 'test.png', originalName: 'test.png', mimetype: 'image/png', size: 1024 })
        .expect(201);

      // The 5th argument is the caller's subject: it is the only writer of
      // `uploads.uploaded_by_id`, and without it the DELETE ownership check denies everyone.
      expect(uploadService.confirmUpload).toHaveBeenCalledWith(
        'test.png',
        'test.png',
        'image/png',
        1024,
        'user-1',
        undefined,
      );
    });

    it('should reject a confirm without authentication', async () => {
      await request(httpServer)
        .post('/upload/confirm')
        .send({ filename: 'test.png', originalName: 'test.png', mimetype: 'image/png', size: 1 })
        .expect(401);

      expect(uploadService.confirmUpload).not.toHaveBeenCalled();
    });

    it('should reject a negative size', async () => {
      const token = await generateToken();

      await request(httpServer)
        .post('/upload/confirm')
        .set('Authorization', `Bearer ${token}`)
        .send({ filename: 'test.png', originalName: 'test.png', mimetype: 'image/png', size: -1 })
        .expect(400);

      expect(uploadService.confirmUpload).not.toHaveBeenCalled();
    });
  });

  describe('DELETE /upload/:filename', () => {
    it('should pass the caller to the service so ownership can be checked', async () => {
      const token = await generateToken('user-1', 'test@example.com', 'reader');

      vi.mocked(uploadService.deleteFile).mockResolvedValue(undefined);

      await request(httpServer).delete('/upload/test.png').set('Authorization', `Bearer ${token}`).expect(204);

      expect(uploadService.deleteFile).toHaveBeenCalledWith('test.png', 'user-1', false);
    });

    it('should treat a super admin as allowed to delete any upload', async () => {
      const token = await new JwtService({ secret: JWT_SECRET }).signAsync({
        sub: 'admin-1',
        email: 'admin@example.com',
        accountType: 'admin',
        adminRole: 'super_admin',
      });

      vi.mocked(uploadService.deleteFile).mockResolvedValue(undefined);

      await request(httpServer).delete('/upload/test.png').set('Authorization', `Bearer ${token}`).expect(204);

      expect(uploadService.deleteFile).toHaveBeenCalledWith('test.png', 'admin-1', true);
    });

    it('should reject a filename with unsupported characters', async () => {
      const token = await generateToken();

      await request(httpServer)
        .delete('/upload/..%2F..%2Fetc%2Fpasswd')
        .set('Authorization', `Bearer ${token}`)
        .expect(400);

      expect(uploadService.deleteFile).not.toHaveBeenCalled();
    });
  });
});
