import { SanityClient } from '@sanity/client';

export interface SanityConfig {
  projectId: string;
  dataset: string;
  apiVersion: string;
  token?: string;
}

export interface SanityStoryDocument {
  _id: string;
  _type: 'story';
  title: string;
  slug: string;
  excerpt?: string;
  content?: string;
  coverImage?: string;
  status: string;
  publishedAt?: string;
  authorId: string;
  hakawiId: string;
}

export interface SyncStoryResult {
  success: boolean;
  documentId?: string;
  error?: string;
}
