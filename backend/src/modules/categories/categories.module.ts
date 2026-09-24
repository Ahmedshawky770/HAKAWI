import { Module } from '@nestjs/common';

import { DatabaseModule } from '../../db/database.module.ts';
import { CommonModule } from '../../common/common.module.ts';

import { CategoriesService } from './categories.service.ts';
import { CategoriesController } from './controllers/categories.controller.ts';
import { CategoriesRepository } from './repositories/categories.repository.ts';
import { CATEGORIES_REPOSITORY } from './interfaces/categories-repository.interface.ts';

@Module({
  imports: [CommonModule, DatabaseModule],
  controllers: [CategoriesController],
  providers: [CategoriesService, CategoriesRepository, { provide: CATEGORIES_REPOSITORY, useExisting: CategoriesRepository }],
  exports: [CategoriesService],
})
export class CategoriesModule {}
