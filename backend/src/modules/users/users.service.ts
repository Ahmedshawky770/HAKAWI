import { Injectable, NotFoundException, ConflictException, Inject } from '@nestjs/common';

import { PasswordHasher } from '../../common/utils/password.util.ts';
import { AccountType } from '../../common/constants/roles.ts';
import { ValkeyService } from '../../common/services/valkey.service.ts';
import { WinstonLoggerService } from '../../common/services/winston-logger.service.ts';

import type { IUsersRepository } from './interfaces/users-repository.interface.ts';
import { USERS_REPOSITORY } from './interfaces/users-repository.interface.ts';
import type { User, CreateUserInput, UpdateUserInput } from './types.ts';

@Injectable()
export class UsersService {
  constructor(
    @Inject(USERS_REPOSITORY) private readonly usersRepository: IUsersRepository,
    @Inject(PasswordHasher) private readonly passwordHasher: PasswordHasher,
    @Inject(ValkeyService) private readonly valkeyService: ValkeyService,
    @Inject(WinstonLoggerService) private readonly logger: WinstonLoggerService,
  ) {}

  async findById(id: string): Promise<User> {
    const cached = await this.valkeyService.get(`user:${id}`);
    if (cached) {
      const user = JSON.parse(cached) as User;
      if ('passwordHash' in user) {
        delete (user as Record<string, unknown>).passwordHash;
      }
      return user;
    }
    const user = await this.usersRepository.findById(id);
    if (!user || user.deletedAt) {
      throw new NotFoundException('User not found');
    }
    const safeUser = { ...user };
    if ('passwordHash' in safeUser) {
      delete (safeUser as Record<string, unknown>).passwordHash;
    }
    await this.valkeyService.set(`user:${id}`, JSON.stringify(safeUser), 300);
    return safeUser;
  }

  async findByEmail(email: string): Promise<User> {
    const user = await this.usersRepository.findByEmail(email);
    if (!user || user.deletedAt) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  async findByUsername(username: string): Promise<User> {
    const user = await this.usersRepository.findByUsername(username);
    if (!user || user.deletedAt) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  async create(input: CreateUserInput): Promise<User> {
    const existingEmail = await this.usersRepository.findByEmail(input.email).catch(() => null);
    if (existingEmail && !existingEmail.deletedAt) {
      throw new ConflictException('Email already exists');
    }

    const existingUsername = await this.usersRepository.findByUsername(input.username).catch(() => null);
    if (existingUsername && !existingUsername.deletedAt) {
      throw new ConflictException('Username already exists');
    }

    if (input.password) {
      input.passwordHash = await this.passwordHasher.hash(input.password);
    }

    const data: CreateUserInput = {
      email: input.email,
      username: input.username,
      name: input.name,
      passwordHash: input.passwordHash ?? null,
      accountType: input.accountType ?? AccountType.READER,
      googleId: input.googleId ?? null,
      facebookId: input.facebookId ?? null,
      twitterId: input.twitterId ?? null,
      githubId: input.githubId ?? null,
      appleId: input.appleId ?? null,
      tiktokId: input.tiktokId ?? null,
    };

    const user = await this.usersRepository.create(data);
    return user;
  }

  async update(id: string, input: UpdateUserInput): Promise<User> {
    if (input.email) {
      const existing = await this.usersRepository.findByEmail(input.email).catch(() => null);
      if (existing && existing.id !== id && !existing.deletedAt) {
        throw new ConflictException('Email already exists');
      }
    }

    if (input.username) {
      const existing = await this.usersRepository.findByUsername(input.username).catch(() => null);
      if (existing && existing.id !== id && !existing.deletedAt) {
        throw new ConflictException('Username already exists');
      }
    }

    const updatePayload: UpdateUserInput = { ...input };

    if (input.password) {
      updatePayload.passwordHash = await this.passwordHasher.hash(input.password);
      delete updatePayload.password;
    }

    const user = await this.usersRepository.update(id, updatePayload);
    await this.valkeyService.del(`user:${id}`);
    return user;
  }

  async updateLastLogin(id: string): Promise<void> {
    await this.usersRepository.update(id, { lastLoginAt: new Date() });
  }

  async softDelete(id: string): Promise<void> {
    await this.usersRepository.softDelete(id);
    await this.valkeyService.del(`user:${id}`);
  }

  async findByGoogleId(googleId: string): Promise<User> {
    const user = await this.usersRepository.findByGoogleId(googleId);
    if (!user || user.deletedAt) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  async findByFacebookId(facebookId: string): Promise<User> {
    const user = await this.usersRepository.findByFacebookId(facebookId);
    if (!user || user.deletedAt) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  async findByTwitterId(twitterId: string): Promise<User> {
    const user = await this.usersRepository.findByTwitterId(twitterId);
    if (!user || user.deletedAt) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  async findByGithubId(githubId: string): Promise<User> {
    const user = await this.usersRepository.findByGithubId(githubId);
    if (!user || user.deletedAt) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  async findByAppleId(appleId: string): Promise<User> {
    const user = await this.usersRepository.findByAppleId(appleId);
    if (!user || user.deletedAt) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  async findByTiktokId(tiktokId: string): Promise<User> {
    const user = await this.usersRepository.findByTiktokId(tiktokId);
    if (!user || user.deletedAt) {
      throw new NotFoundException('User not found');
    }
    return user;
  }
}