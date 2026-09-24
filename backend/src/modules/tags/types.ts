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
