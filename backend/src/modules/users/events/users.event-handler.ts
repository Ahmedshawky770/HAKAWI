import { Injectable, Logger, NotFoundException, Inject } from '@nestjs/common';
import { UsersService } from '../users.service.js';
import { UsersRepository } from '../repositories/users.repository.js';
import { USERS_REPOSITORY } from '../interfaces/users-repository.interface.js';
import type { User } from '../interfaces/users-repository.interface.js';

export class UserRegisteredEvent {
  constructor(public readonly userId: string, public readonly email: string, public readonly name: string) {}
}

export class UserUpdatedEvent {
  constructor(public readonly userId: string, public readonly updatedFields: Record<string, unknown>) {}
}

@Injectable()
export class UsersEventHandler {
  private readonly logger = new Logger(UsersEventHandler.name);

  constructor(
    private readonly usersService: UsersService,
    @Inject(USERS_REPOSITORY) private readonly usersRepository: UsersRepository,
  ) {}

  async handleUserRegistered(event: UserRegisteredEvent): Promise<void> {
    this.logger.info(`Handling user registered event: ${event.userId}`);
    
    const user = await this.usersRepository.findById(event.userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    await this.usersService.updateLastLogin(user.id);
  }

  async handleUserUpdated(event: UserUpdatedEvent): Promise<void> {
    this.logger.info(`Handling user updated event: ${event.userId}`);
  }
}
