import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import type { Server } from 'http';
import request from 'supertest';
import { JwtService } from '@nestjs/jwt';

import { CommentsController } from './comments.controller.ts';
import { CommentsService } from '../comments.service.ts';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard.ts';
import { ConfigModule } from '@nestjs/config';

const JWT_SECRET = 'test-jwt-secret-for-controller-specs';

async function generateToken(sub = 'user-1', email = 'test@example.com', accountType = 'reader'): Promise<string> {
  return new JwtService({ secret: JWT_SECRET } as any).signAsync({ sub, email, accountType } as any);
}

describe('CommentsController', () => {
  let app: INestApplication;
  let httpServer: Server;
  let commentsService: Partial<CommentsService>;

  beforeAll(async () => {
    commentsService = {
      findByStory: vi.fn(),
      findReplies: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, load: [] })],
      controllers: [CommentsController],
      providers: [
        {
          provide: CommentsService,
          useValue: commentsService,
        },
        JwtAuthGuard,
        {
          provide: JwtService,
          useValue: new JwtService({ secret: JWT_SECRET } as any),
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

  describe('GET /comments/story/:storyId', () => {
    it('should return comments for a story', async () => {
      vi.mocked(commentsService.findByStory).mockResolvedValue({
        comments: [],
        total: 0,
      } as any);

      const res = await request(httpServer)
        .get('/comments/story/123e4567-e89b-12d3-a456-426614174000')
        .expect(200);

      expect(res.body).toHaveProperty('comments');
      expect(res.body).toHaveProperty('total', 0);
      expect(commentsService.findByStory).toHaveBeenCalledWith('123e4567-e89b-12d3-a456-426614174000', 1, 20);
    });
  });

  describe('GET /comments/:id/replies', () => {
    it('should return replies for a comment', async () => {
      vi.mocked(commentsService.findReplies).mockResolvedValue({
        replies: [],
        total: 0,
      } as any);

      const res = await request(httpServer)
        .get('/comments/123e4567-e89b-12d3-a456-426614174000/replies')
        .expect(200);

      expect(res.body).toHaveProperty('replies');
      expect(res.body).toHaveProperty('total', 0);
      expect(commentsService.findReplies).toHaveBeenCalledWith('123e4567-e89b-12d3-a456-426614174000', 1, 20);
    });
  });

  describe('POST /comments', () => {
    it('should create a new comment', async () => {
      const token = await generateToken('user-1', 'test@example.com', 'reader');

      vi.mocked(commentsService.create).mockResolvedValue({
        id: 'comment-1',
        storyId: '00000000-0000-0000-0000-000000000001',
        authorId: 'user-1',
        parentId: null,
        content: 'Great story!',
        likeCount: 0,
        replyCount: 0,
        isDeleted: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);

      const res = await request(httpServer)
        .post('/comments')
        .set('Authorization', `Bearer ${token}`)
        .send({ storyId: '123e4567-e89b-12d3-a456-426614174000', content: 'Great story!' })
        .expect(201);

      expect(res.body).toHaveProperty('id', 'comment-1');
      expect(res.body).toHaveProperty('content', 'Great story!');
      expect(commentsService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          storyId: '123e4567-e89b-12d3-a456-426614174000',
          content: 'Great story!',
          authorId: 'user-1',
        }),
      );
    });
  });

  describe('PATCH /comments/:id', () => {
    it('should update a comment', async () => {
      const token = await generateToken('user-1', 'test@example.com', 'reader');

      vi.mocked(commentsService.update).mockResolvedValue({
        id: 'comment-1',
        storyId: '00000000-0000-0000-0000-000000000001',
        authorId: 'user-1',
        parentId: null,
        content: 'Updated comment',
        likeCount: 0,
        replyCount: 0,
        isDeleted: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);

      const res = await request(httpServer)
        .patch('/comments/123e4567-e89b-12d3-a456-426614174000')
        .set('Authorization', `Bearer ${token}`)
        .send({ content: 'Updated comment' })
        .expect(200);

      expect(res.body).toHaveProperty('content', 'Updated comment');
      expect(commentsService.update).toHaveBeenCalledWith('123e4567-e89b-12d3-a456-426614174000', 'user-1', { content: 'Updated comment' });
    });
  });

  describe('DELETE /comments/:id', () => {
    it('should delete a comment', async () => {
      const token = await generateToken('user-1', 'test@example.com', 'reader');

      vi.mocked(commentsService.delete).mockResolvedValue(undefined);

      const res = await request(httpServer)
        .delete('/comments/123e4567-e89b-12d3-a456-426614174000')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body).toEqual({ message: 'Comment deleted' });
      expect(commentsService.delete).toHaveBeenCalledWith('123e4567-e89b-12d3-a456-426614174000', 'user-1');
    });
  });
});
