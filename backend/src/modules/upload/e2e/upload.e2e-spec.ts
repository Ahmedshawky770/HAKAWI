import type { Server } from 'node:http';

import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { EventEmitter2 } from '@nestjs/event-emitter';
import request from 'supertest';

import { AppModule } from '../../../app.module.ts';
import { WinstonLoggerService } from '../../../common/services/winston-logger.service.ts';
import { ValkeyService } from '../../../common/services/valkey.service.ts';
import { EncryptionService } from '../../../common/utils/encryption.util.ts';
import { UsersRepository } from '../../../modules/users/repositories/users.repository.ts';
import { USERS_REPOSITORY } from '../../../modules/users/interfaces/users-repository.interface.ts';
import { UsersEventHandler } from '../../../modules/users/events/users.event-handler.ts';
import { UploadService } from '../../../modules/upload/upload.service.ts';
import type { JsonResponse, LoginResponseBody } from '../../../test/helpers/test-response-types.ts';

interface PresignedUploadResponseBody {
  url: string;
  filename: string;
}

describe('Upload E2E', () => {
  let app: INestApplication<Server>;
  let httpServer: Server;
  let accessToken: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
      providers: [
        {
          provide: 'REFLECTOR',
          useValue: new Reflector(),
        },
        WinstonLoggerService,
        ValkeyService,
        EventEmitter2,
        UsersRepository,
        {
          provide: USERS_REPOSITORY,
          useExisting: UsersRepository,
        },
      ],
    })
      .overrideProvider(UsersEventHandler)
      .useValue({
        handleUserRegistered: () => Promise.resolve(),
        handleUserUpdated: () => Promise.resolve(),
      })
      .overrideProvider(EncryptionService)
      .useValue({
        encrypt: (plaintext: string) => plaintext,
        decrypt: (ciphertext: string) => ciphertext,
      })
      .overrideProvider(UploadService)
      .useValue({
        generatePresignedUrl: (filename: string, contentType: string, folder: string) => ({
          url: `https://s3.amazonaws.com/bucket/${folder}/${filename}`,
          filename: `${folder}/${filename}`,
        }),
      })
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
    httpServer = app.getHttpServer();

    await request(httpServer).post('/auth/register').send({
      email: 'e2e-upload@example.com',
      password: 'SecurePass123!',
      name: 'E2E Upload User',
      username: 'e2eupload',
    });

    /**
     * WHY THE TOKEN IS NOW KEPT. Both routes are `@UseGuards(JwtAuthGuard)`, and the login below used
     * to discard its response — so the requests went out with no `Authorization` header at all and
     * the 401 was the guard working correctly, not a broken fixture. Minting a presigned S3 URL is a
     * write against the caller's storage quota and `DELETE /upload/:filename` resolves ownership from
     * `uploads.uploaded_by_id`, so an unauthenticated caller has no identity to attribute the object
     * to. The header is the fix; the 401 stays, pinned at the bottom of each describe.
     */
    const loginRes = (await request(httpServer).post('/auth/login').send({
      email: 'e2e-upload@example.com',
      password: 'SecurePass123!',
    })) as JsonResponse<LoginResponseBody>;

    accessToken = loginRes.body.tokens.accessToken;
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('POST /upload/image', () => {
    it('should generate image upload URL', async () => {
      const res = await request(httpServer)
        .post('/upload/image')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ filename: 'e2e-test.png', contentType: 'image/png' })
        .expect(201);

      expect(res.body).toHaveProperty('url');
      expect((res.body as PresignedUploadResponseBody).filename).toContain('images/e2e-test');
    });

    it('should refuse an unauthenticated caller', async () => {
      await request(httpServer)
        .post('/upload/image')
        .send({ filename: 'e2e-anonymous.png', contentType: 'image/png' })
        .expect(401);
    });
  });

  describe('POST /upload/pdf', () => {
    it('should generate PDF upload URL', async () => {
      const res = await request(httpServer)
        .post('/upload/pdf')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ filename: 'e2e-test.pdf', contentType: 'application/pdf' })
        .expect(201);

      expect(res.body).toHaveProperty('url');
      expect((res.body as PresignedUploadResponseBody).filename).toContain('pdfs/e2e-test');
    });

    it('should refuse an unauthenticated caller', async () => {
      await request(httpServer)
        .post('/upload/pdf')
        .send({ filename: 'e2e-anonymous.pdf', contentType: 'application/pdf' })
        .expect(401);
    });
  });
});
