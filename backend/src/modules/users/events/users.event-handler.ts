import { Injectable, Inject } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

import { UsersRepository } from '../repositories/users.repository.ts';
import { USERS_REPOSITORY } from '../interfaces/users-repository.interface.ts';
import { WinstonLoggerService } from '../../../common/services/winston-logger.service.ts';

export class UserRegisteredEvent {
  constructor(public readonly userId: string, public readonly email: string, public readonly name: string) {}
}

export class UserUpdatedEvent {
  constructor(public readonly userId: string, public readonly updatedFields: Record<string, unknown>) {}
}

@Injectable()
export class UsersEventHandler {
  constructor(
    @Inject(USERS_REPOSITORY) private readonly usersRepository: UsersRepository,
    private readonly logger: WinstonLoggerService,
  ) {}

  @OnEvent('user.registered')
  async handleUserRegistered(event: UserRegisteredEvent): Promise<void> {
    this.logger.info(`Handling user registered event: ${event.userId}`);

    const user = await this.usersRepository.findById(event.userId);
    if (!user) {
      throw new Error('User not found');
    }

    await this.usersRepository.update(user.id, { lastLoginAt: new Date() });
  }

  @OnEvent('user.updated')
  async handleUserUpdated(event: UserUpdatedEvent): Promise<void> {
    this.logger.info(`Handling user updated event: ${event.userId}`);
  }
}