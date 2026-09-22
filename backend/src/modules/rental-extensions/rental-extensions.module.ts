import { Module } from '@nestjs/common';
import { RentalExtensionsController } from './rental-extensions.controller.js';
import { RentalExtensionsService } from './services/rental-extensions.service.js';
import { RENTAL_EXTENSIONS_REPOSITORY } from './interfaces/rental-extensions-repository.interface.js';
import { RentalExtensionsRepository } from './repositories/rental-extensions.repository.js';
import { DatabaseModule } from '../../db/database.module.js';
import { EventBusModule } from '../../common/event-bus.module.js';

@Module({
  imports: [DatabaseModule, EventBusModule],
  controllers: [RentalExtensionsController],
  providers: [
    RentalExtensionsService,
    {
      provide: RENTAL_EXTENSIONS_REPOSITORY,
      useClass: RentalExtensionsRepository,
    },
  ],
  exports: [RentalExtensionsService, RENTAL_EXTENSIONS_REPOSITORY],
})
export class RentalExtensionsModule {}
