import { Injectable } from '@nestjs/common';

@Injectable()
export class StoryCategoriesService {
  async findAll() {
    return [];
  }

  async findOne(id: string) {
    return null;
  }

  async create(data: unknown) {
    return data;
  }

  async update(id: string, data: unknown) {
    return data;
  }

  async remove(id: string) {
    return { message: 'Deleted successfully' };
  }
}
