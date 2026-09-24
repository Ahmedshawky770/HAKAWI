export const TAGS_REPOSITORY = Symbol('TAGS_REPOSITORY');

export type Tag = {
  id: string;
  name: string;
  slug: string;
  createdAt: Date;
};

export type CreateTagInput = {
  name: string;
  slug: string;
};

export type UpdateTagInput = Partial<{
  name: string;
  slug: string;
}>;

export interface ITagsRepository {
  findById(id: string): Promise<Tag | null>;
  findBySlug(slug: string): Promise<Tag | null>;
  findAll(): Promise<Tag[]>;
  create(data: CreateTagInput): Promise<Tag>;
  update(id: string, data: UpdateTagInput): Promise<Tag>;
}
