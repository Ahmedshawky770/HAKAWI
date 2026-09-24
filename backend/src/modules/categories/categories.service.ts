import { Injectable, NotFoundException, ConflictException, Inject } from '@nestjs/common';

import { WinstonLoggerService } from '../../common/services/winston-logger.service.ts';

import type { ICategoriesRepository } from './interfaces/categories-repository.interface.ts';
import { CATEGORIES_REPOSITORY } from './interfaces/categories-repository.interface.ts';
import type { Category, CreateCategoryInput, UpdateCategoryInput } from './types.ts';

@Injectable()
export class CategoriesService {
  constructor(
    @Inject(CATEGORIES_REPOSITORY) private readonly categoriesRepository: ICategoriesRepository,
    @Inject(WinstonLoggerService) private readonly logger: WinstonLoggerService,
  ) {}

  async findById(id: string): Promise<Category> {
    const category = await this.categoriesRepository.findById(id);
    if (!category) {
      throw new NotFoundException('Category not found');
    }
    return category;
  }

  async findBySlug(slug: string): Promise<Category> {
    const category = await this.categoriesRepository.findBySlug(slug);
    if (!category) {
      throw new NotFoundException('Category not found');
    }
    return category;
  }

  async findAll(): Promise<Category[]> {
    return this.categoriesRepository.findAll();
  }

  async create(input: CreateCategoryInput): Promise<Category> {
    const existing = await this.categoriesRepository.findBySlug(input.slug);
    if (existing) {
      throw new ConflictException('Category slug already exists');
    }

    return this.categoriesRepository.create(input);
  }

  async update(id: string, input: UpdateCategoryInput): Promise<Category> {
    const existing = await this.categoriesRepository.findById(id);
    if (!existing) {
      throw new NotFoundException('Category not found');
    }

    if (input.slug && input.slug !== existing.slug) {
      const slugExists = await this.categoriesRepository.findBySlug(input.slug);
      if (slugExists) {
        throw new ConflictException('Category slug already exists');
      }
    }

    return this.categoriesRepository.update(id, input);
  }

  async delete(id: string): Promise<void> {
    const existing = await this.categoriesRepository.findById(id);
    if (!existing) {
      throw new NotFoundException('Category not found');
    }

    await this.categoriesRepository.softDelete(id);
  }
}
