import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import type { Server } from 'http';
import request from 'supertest';
import { JwtService } from '@nestjs/jwt';

import { UsersController } from './users.controller.ts';
import { UsersService } from '../users.service.ts';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard.ts';
import { ConfigModule } from '@nestjs/config';

const JWT_SECRET = 'test-jwt-secret-for-controller-specs';

async function generateToken(sub = 'user-1', email = 'test@example.com', accountType = 'reader'): Promise<string> {
  return new JwtService({ secret: JWT_SECRET } as any).signAsync({ sub, email, accountType } as any);
}

describe('UsersController', () => {
  let app: INestApplication;
  let httpServer: Server;
  let usersService: Partial<UsersService>;

  beforeAll(async () => {
    usersService = {
      getUserStats: vi.fn(),
      findById: vi.fn(),
      update: vi.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, load: [] })],
      controllers: [UsersController],
      providers: [
        {
          provide: UsersService,
          useValue: usersService,
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

  describe('GET /users/:id/stats', () => {
    it('should return user stats', async () => {
      vi.mocked(usersService.getUserStats).mockResolvedValue({
        storiesCount: 5,
        totalViews: 100,
        totalReactions: 25,
        followersCount: 10,
        followingCount: 3,
      } as any);

      const res = await request(httpServer)
        .get('/users/123e4567-e89b-12d3-a456-426614174000/stats')
        .expect(200);

      expect(res.body).toEqual({
        storiesCount: 5,
        totalViews: 100,
        totalReactions: 25,
        followersCount: 10,
        followingCount: 3,
      });
      expect(usersService.getUserStats).toHaveBeenCalledWith('123e4567-e89b-12d3-a456-426614174000');
    });
  });

  describe('GET /users/me', () => {
    it('should return current user profile', async () => {
      const token = await generateToken('user-1', 'test@example.com', 'reader');

      vi.mocked(usersService.findById).mockResolvedValue({
        id: 'user-1',
        email: 'test@example.com',
        username: 'testuser',
        name: 'Test User',
        accountType: 'reader',
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);

      const res = await request(httpServer)
        .get('/users/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body).toHaveProperty('id', 'user-1');
      expect(res.body).toHaveProperty('email', 'test@example.com');
      expect(usersService.findById).toHaveBeenCalledWith('user-1');
    });
  });

  describe('PATCH /users/me', () => {
    it('should update current user profile', async () => {
      const token = await generateToken('user-1', 'test@example.com', 'reader');

      vi.mocked(usersService.update).mockResolvedValue({
        id: 'user-1',
        email: 'test@example.com',
        username: 'testuser',
        name: 'Updated Name',
        accountType: 'reader',
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);

      const res = await request(httpServer)
        .patch('/users/me')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Updated Name' })
        .expect(200);

      expect(res.body).toHaveProperty('name', 'Updated Name');
      expect(usersService.update).toHaveBeenCalledWith('user-1', { name: 'Updated Name' });
    });
  });

  describe('GET /users/:id', () => {
    it('should return a public user profile', async () => {
      vi.mocked(usersService.findById).mockResolvedValue({
        id: 'user-2',
        email: 'public@example.com',
        username: 'publicuser',
        name: 'Public User',
        accountType: 'author',
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);

      const res = await request(httpServer)
        .get('/users/923e4567-e89b-12d3-a456-426614174000')
        .expect(200);

      expect(res.body).toHaveProperty('id', 'user-2');
      expect(res.body).toHaveProperty('username', 'publicuser');
      expect(usersService.findById).toHaveBeenCalledWith('923e4567-e89b-12d3-a456-426614174000');
    });
  });

  describe('PATCH /users/:id', () => {
    it('should update a user by id', async () => {
      const token = await generateToken('user-1', 'test@example.com', 'reader');

      vi.mocked(usersService.update).mockResolvedValue({
        id: 'user-2',
        email: 'public@example.com',
        username: 'publicuser',
        name: 'Updated Public User',
        accountType: 'author',
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);

      const res = await request(httpServer)
        .patch('/users/923e4567-e89b-12d3-a456-426614174000')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Updated Public User' })
        .expect(200);

      expect(res.body).toHaveProperty('name', 'Updated Public User');
      expect(usersService.update).toHaveBeenCalledWith('923e4567-e89b-12d3-a456-426614174000', { name: 'Updated Public User' });
    });
  });
});
