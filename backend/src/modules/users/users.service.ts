import { Injectable, Logger, NotFoundException, ConflictException, BadRequestException, Inject } from '@nestjs/common';
import type { IUsersRepository, User, CreateUserInput, UpdateUserInput } from './interfaces/users-repository.interface.js';
import { USERS_REPOSITORY } from './interfaces/users-repository.interface.js';
import { PasswordHasher } from '../../common/utils/password.util.js';
import { AccountType } from '../../common/constants/roles.js';
import { UserResponseDto, UserStatsDto, UserProfileResponseDto } from './dto/users.dto.js';
import { ValkeyService } from '../../common/services/valkey.service.js';

@Injectable()
export class UsersService {
  constructor(
    @Inject(USERS_REPOSITORY) private readonly usersRepository: IUsersRepository,
    private readonly passwordHasher: PasswordHasher,
    private readonly valkeyService: ValkeyService,
  ) {}

  async findById(id: string): Promise<UserResponseDto> {
    const cached = await this.valkeyService.get(`user:${id}`);
    if (cached) {
      return JSON.parse(cached);
    }
    const user = await this.usersRepository.findById(id);
    if (!user || user.deletedAt) {
      throw new NotFoundException('User not found');
    }
    const response = this.toResponseDto(user);
    await this.valkeyService.set(`user:${id}`, JSON.stringify(response), 300);
    return response;
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
      delete input.password;
    }

    return this.usersRepository.create({
      ...input,
      accountType: input.accountType || AccountType.READER,
    });
  }

  async update(id: string, input: UpdateUserInput): Promise<UserResponseDto> {
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

    const user = await this.usersRepository.update(id, input);
    await this.valkeyService.del(`user:${id}`);
    return this.toResponseDto(user);
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

  async verify(id: string): Promise<{ message: string; user: { id: string; isVerified: boolean } }> {
    const existingUser = await this.usersRepository.findById(id);
    if (!existingUser || existingUser.deletedAt) {
      throw new NotFoundException('User not found');
    }

    const updatedUser = await this.usersRepository.update(id, { isVerified: true });
    await this.valkeyService.del(`user:${id}`);

    return {
      message: 'User verified successfully',
      user: {
        id: updatedUser.id,
        isVerified: true,
      },
    };
  }

  async getStats(userId: string): Promise<UserStatsDto> {
    const cached = await this.valkeyService.get(`user:${userId}:stats`);
    if (cached) {
      return JSON.parse(cached);
    }
    const user = await this.usersRepository.findById(userId);
    if (!user || user.deletedAt) {
      throw new NotFoundException('User not found');
    }

    const stats: UserStatsDto = {
      storiesCount: 0,
      totalViews: 0,
      totalReactions: 0,
      followersCount: 0,
      followingCount: 0,
    };

    await this.valkeyService.set(`user:${userId}:stats`, JSON.stringify(stats), 300);
    return stats;
  }

  toResponseDto(user: User): UserResponseDto {
    const { passwordHash, ...rest } = user;
    return {
      id: rest.id,
      username: rest.username,
      email: rest.email,
      name: rest.name,
      avatar: rest.avatar ?? null,
      bio: rest.bio ?? null,
      accountType: rest.accountType,
      isVerified: rest.isVerified ?? false,
      onboardingCompleted: rest.onboardingCompleted ?? false,
      accessBlocked: rest.accessBlocked ?? false,
      createdAt: rest.createdAt,
      updatedAt: rest.updatedAt,
    };
  }
}
