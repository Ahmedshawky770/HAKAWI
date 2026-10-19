import { Injectable, Inject } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

import { WinstonLoggerService } from '../../../common/services/winston-logger.service.ts';

export interface UserUpgradedEvent {
  userId: string;
  oldType: string;
  newType: string;
}

@Injectable()
export class UserUpgradedEventHandler {
  constructor(@Inject(WinstonLoggerService) private readonly logger: WinstonLoggerService) {}

  @OnEvent('user.upgraded')
  async handleUserUpgraded(event: UserUpgradedEvent): Promise<void> {
    this.logger.info(`User account upgraded: ${event.userId} -> ${event.newType}`, 'UserUpgradedEventHandler');
  }
}
