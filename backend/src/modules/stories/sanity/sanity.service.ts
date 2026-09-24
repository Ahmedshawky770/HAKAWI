import { Injectable, Inject, Optional } from '@nestjs/common';
import { createClient, type SanityClient } from '@sanity/client';

import { WinstonLoggerService } from '../../../common/services/winston-logger.service.ts';
import { CircuitBreakerService, CircuitBreakerState } from '../../../common/resilience/circuit-breaker.service.js';

import type { SanityStoryDocument, SyncStoryResult } from './sanity.types.ts';

@Injectable()
export class SanityService {
  private readonly client: SanityClient;

  constructor(
    @Inject(WinstonLoggerService) private readonly logger: WinstonLoggerService,
    @Inject(CircuitBreakerService) private readonly circuitBreaker: CircuitBreakerService,
    @Optional() private readonly providedClient?: SanityClient,
  ) {
    this.client = this.providedClient ?? this.createSanityClient();
  }

  private createSanityClient(): SanityClient {
    const projectId = process.env.SANITY_PROJECT_ID;
    if (!projectId) {
      return this.createMockClient();
    }

    return createClient({
      projectId,
      dataset: process.env.SANITY_DATASET || 'production',
      apiVersion: process.env.SANITY_API_VERSION || '2024-01-01',
      token: process.env.SANITY_TOKEN,
      useCdn: false,
    });
  }

  private createMockClient(): SanityClient {
    return {
      fetch: async () => null,
      patch: () => ({
        set: async () => ({}),
        commit: async () => ({}),
      }),
      create: async () => ({}),
      delete: async () => ({}),
      config: { projectId: '', dataset: '', apiVersion: '' },
      withConfig: () => this.createMockClient(),
      clone: () => this.createMockClient(),
      observe: () => ({ unsubscribe: () => {/* mock unsubscribe */} }),
      getDocument: async () => null,
      getDocuments: async () => [],
      createIfNotExists: async () => ({}),
      createOrReplace: async () => ({}),
      transaction: () => ({
        patch: () => ({
          set: async () => ({}),
          commit: async () => ({}),
        }),
        create: async () => ({}),
        delete: async () => ({}),
        commit: async () => ({}),
        ifExists: () => ({
          patch: () => ({
            set: async () => ({}),
            commit: async () => ({}),
          }),
          delete: async () => ({}),
          commit: async () => ({}),
        }),
        ifDocumentMissing: () => ({
          create: async () => ({}),
          commit: async () => ({}),
        }),
      }),
    } as unknown as SanityClient;
  }

  async syncStoryToSanity(story: SanityStoryDocument): Promise<SyncStoryResult> {
    try {
      const documentId = `story-${story.hakawiId}`;
      const doc = {
        _id: documentId,
        _type: 'story' as const,
        title: story.title,
        slug: story.slug,
        excerpt: story.excerpt,
        content: story.content,
        coverImage: story.coverImage,
        status: story.status,
        publishedAt: story.publishedAt,
        authorId: story.authorId,
        hakawiId: story.hakawiId,
      };

      const existing = await this.circuitBreaker.execute(
        'sanity-fetch',
        () => this.client.fetch(`*[_type == "story" && hakawiId == $hakawiId][0]`, { hakawiId: story.hakawiId }).catch(() => null),
      );

      if (existing) {
        await this.circuitBreaker.execute(
          'sanity-patch',
          async () => await this.client.patch(documentId).set(doc).commit(),
        );
        this.logger.info(`Updated story in Sanity: ${documentId}`, 'SanityService');
      } else {
        await this.circuitBreaker.execute(
          'sanity-create',
          async () => await this.client.create(doc),
        );
        this.logger.info(`Created story in Sanity: ${documentId}`, 'SanityService');
      }

      return { success: true, documentId };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to sync story to Sanity: ${message}`, 'SanityService');
      return { success: false, error: message };
    }
  }

  async deleteStoryFromSanity(storyId: string): Promise<SyncStoryResult> {
    try {
      const documentId = `story-${storyId}`;
      await this.circuitBreaker.execute(
        'sanity-delete',
        async () => await this.client.delete(documentId),
      );
      this.logger.info(`Deleted story from Sanity: ${documentId}`, 'SanityService');
      return { success: true, documentId };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to delete story from Sanity: ${message}`, 'SanityService');
      return { success: false, error: message };
    }
  }

  async syncAllStories(stories: SanityStoryDocument[]): Promise<SyncStoryResult[]> {
    const results: SyncStoryResult[] = [];
    for (const story of stories) {
      const result = await this.syncStoryToSanity(story);
      results.push(result);
    }
    return results;
  }

  isEnabled(): boolean {
    return Boolean(process.env.SANITY_PROJECT_ID && process.env.SANITY_DATASET);
  }
}
