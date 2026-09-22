import { Injectable, Logger, NotFoundException, Inject } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { IUserRestrictionsRepository, CreateUserRestrictionData } from '../interfaces/user-restrictions-repository.interface.js';
import { USER_RESTRICTIONS_REPOSITORY } from '../interfaces/user-restrictions-repository.interface.js';
import { UserRestrictionsRepository } from '../repositories/user-restrictions.repository.js';

export const RESTRICTION_TYPE = {
  TEMPORARY_BAN: 'temporary_ban',
  PERMANENT_BAN: 'permanent_ban',
  CONTENT_RESTRICTION: 'content_restriction',
  RATE_LIMIT: 'rate_limit',
} as const;

export type RestrictionType = (typeof RESTRICTION_TYPE)[keyof typeof RESTRICTION_TYPE];

@Injectable()
export class UserRestrictionsService {
  private readonly logger = new Logger(UserRestrictionsService.name);

  constructor(
    @Inject(USER_RESTRICTIONS_REPOSITORY) private readonly restrictionsRepository: UserRestrictionsRepository,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async findById(id: string): Promise<CreateUserRestrictionData> {
    const restriction = await this.restrictionsRepository.findById(id);
    if (!restriction) {
      throw new NotFoundException('User restriction not found');
    }
    return restriction;
  }

  async findByUserId(userId: string): Promise<CreateUserRestrictionData[]> {
    return this.restrictionsRepository.findByUserId(userId);
  }

  async findActiveByUserId(userId: string): Promise<CreateUserRestrictionData | null> {
    return this.restrictionsRepository.findActiveByUserId(userId);
  }

  async create(data: CreateUserRestrictionData): Promise<CreateUserRestrictionData> {
    const restriction = await this.restrictionsRepository.create(data);
    this.eventEmitter.emit('user.restricted', { userId: data.userId, restrictionType: data.restrictionType, duration: data.expiresAt ?? 'permanent', reason: data.reason });
    return restriction;
  }

  async delete(id: string): Promise<void> {
    await this.restrictionsRepository.delete(id);
    this.eventEmitter.emit('user.unrestricted', { userId: '', reason: 'Restriction removed' });
  }

  async deleteExpired(): Promise<number> {
    return this.restrictionsRepository.deleteExpired();
  }
}
