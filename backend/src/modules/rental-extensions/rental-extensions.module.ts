import { Module } from '@nestjs/common';
import { RentalExtensionsService } from './services/rental-extensions.service.js';
import { RentalExtensionsController } from './controllers/rental-extensions.controller.js';
import { RentalExtensionsRepository } from './repositories/rental-extensions.repository.js';

@Module({
  imports: [],
  controllers: [RentalExtensionsController],
  providers: [RentalExtensionsService, RentalExtensionsRepository],
  exports: [RentalExtensionsService],
})
export class RentalExtensionsModule {}
