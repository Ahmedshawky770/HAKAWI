import { Injectable, Inject } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

import { type IUsersRepository, USERS_REPOSITORY } from '../../../common/users/users-repository.interface.ts';
import { WinstonLoggerService } from '../../../common/services/winston-logger.service.ts';
import { UserRegisteredEvent, UserUpdatedEvent } from '../../../common/events/users.events.ts';

@Injectable()
export class UsersEventHandler {
  constructor(
    @Inject(USERS_REPOSITORY) private readonly usersRepository: IUsersRepository,
    private readonly logger: WinstonLoggerService,
  ) {}

  @OnEvent('user.registered')
  async handleUserRegistered(event: UserRegisteredEvent): Promise<void> {
    if (this.logger) {
      this.logger.info(`Handling user registered event: ${event.userId}`, 'UsersEventHandler');
    }

    const user = await this.usersRepository.findById(event.userId);
    if (!user) {
      throw new Error('User not found');
    }

    await this.usersRepository.update(user.id, { lastLoginAt: new Date() });
  }

  @OnEvent('user.updated')
  async handleUserUpdated(event: UserUpdatedEvent): Promise<void> {
    if (this.logger) {
      this.logger.info(`Handling user updated event: ${event.userId}`, 'UsersEventHandler');
    }
  }
}
