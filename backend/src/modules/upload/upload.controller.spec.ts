import type { Server } from 'http';

import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
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
  deleteFile: ReturnType<typeof vi.fn>;
};

describe('UploadController', () => {
  let app: INestApplication;
  let httpServer: Server;
  let uploadService: MockUploadService;

  beforeAll(async () => {
    uploadService = {
      generatePresignedUrl: vi.fn(),
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
      ],
    }).compile();

    app = moduleRef.createNestApplication();
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
        .send({ filename: 'test.png', contentType: 'image/png' })
        .expect(201);

      expect(res.body).toHaveProperty('url');
      expect(uploadService.generatePresignedUrl).toHaveBeenCalledWith('test.png', 'image/png', 'images');
    });
  });

  describe('POST /upload/pdf', () => {
    it('should generate PDF upload URL', async () => {
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
        .send({ filename: 'test.pdf', contentType: 'application/pdf' })
        .expect(201);

      expect(res.body).toHaveProperty('url');
      expect(uploadService.generatePresignedUrl).toHaveBeenCalledWith('test.pdf', 'application/pdf', 'pdfs');
    });
  });

  describe('DELETE /upload/:filename', () => {
    it('should delete a file', async () => {
      const token = await generateToken('user-1', 'test@example.com', 'reader');

      vi.mocked(uploadService.deleteFile).mockResolvedValue(undefined);

      await request(httpServer)
        .delete('/upload/test.png')
        .set('Authorization', `Bearer ${token}`)
        .expect(204);

      expect(uploadService.deleteFile).toHaveBeenCalledWith('test.png');
    });
  });
});
