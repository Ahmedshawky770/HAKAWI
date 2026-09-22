import { Module } from '@nestjs/common';
import { UserLibrariesService } from './services/user-libraries.service.js';
import { UserLibrariesController } from './controllers/user-libraries.controller.js';
import { UserLibrariesRepository } from './repositories/user-libraries.repository.js';

@Module({
  imports: [],
  controllers: [UserLibrariesController],
  providers: [UserLibrariesService, UserLibrariesRepository],
  exports: [UserLibrariesService],
})
export class UserLibrariesModule {}
