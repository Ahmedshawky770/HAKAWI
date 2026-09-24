import { Injectable, NotFoundException, ConflictException, Inject } from '@nestjs/common';

import { WinstonLoggerService } from '../../common/services/winston-logger.service.ts';

import type { ITagsRepository } from './interfaces/tags-repository.interface.ts';
import { TAGS_REPOSITORY } from './interfaces/tags-repository.interface.ts';
import type { Tag, CreateTagInput, UpdateTagInput } from './types.ts';

@Injectable()
export class TagsService {
  constructor(
    @Inject(TAGS_REPOSITORY) private readonly tagsRepository: ITagsRepository,
    @Inject(WinstonLoggerService) private readonly logger: WinstonLoggerService,
  ) {}

  async findById(id: string): Promise<Tag> {
    const tag = await this.tagsRepository.findById(id);
    if (!tag) {
      throw new NotFoundException('Tag not found');
    }
    return tag;
  }

  async findBySlug(slug: string): Promise<Tag> {
    const tag = await this.tagsRepository.findBySlug(slug);
    if (!tag) {
      throw new NotFoundException('Tag not found');
    }
    return tag;
  }

  async findAll(): Promise<Tag[]> {
    return this.tagsRepository.findAll();
  }

  async create(input: CreateTagInput): Promise<Tag> {
    const existing = await this.tagsRepository.findBySlug(input.slug);
    if (existing) {
      throw new ConflictException('Tag slug already exists');
    }

    return this.tagsRepository.create(input);
  }

  async update(id: string, input: UpdateTagInput): Promise<Tag> {
    const existing = await this.tagsRepository.findById(id);
    if (!existing) {
      throw new NotFoundException('Tag not found');
    }

    if (input.slug && input.slug !== existing.slug) {
      const slugExists = await this.tagsRepository.findBySlug(input.slug);
      if (slugExists) {
        throw new ConflictException('Tag slug already exists');
      }
    }

    return this.tagsRepository.update(id, input);
  }
}
