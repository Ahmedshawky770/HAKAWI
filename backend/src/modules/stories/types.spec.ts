import { describe, it, expect } from 'vitest';

import { toStoryRecord, toStoryResponse, type Story } from './types.ts';

const NOW = new Date('2026-01-01T00:00:00.000Z');

function story(overrides: Partial<Story> = {}): Story {
  return {
    id: 'story-1',
    authorId: 'user-1',
    title: 'A Lighthouse',
    slug: 'a-lighthouse',
    excerpt: 'An excerpt',
    content: '<p>Body</p>',
    coverImage: null,
    status: 'published',
    categoryId: null,
    viewCount: 12,
    likeCount: 3,
    commentCount: 1,
    readingTime: 4,
    publishedAt: NOW,
    deletedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

describe('toStoryResponse', () => {
  it('should expose the wire field names, not the persistence ones', () => {
    const response = toStoryResponse(story());

    expect(response).not.toHaveProperty('viewCount');
    expect(response).not.toHaveProperty('likeCount');
    expect(response).not.toHaveProperty('commentCount');
    expect(response).not.toHaveProperty('categoryId');
    expect(response).not.toHaveProperty('authorId');
    expect(response).not.toHaveProperty('readingTime');
    expect(response).not.toHaveProperty('deletedAt');
  });

  it('should rename the counters to views and reactions', () => {
    const response = toStoryResponse(story({ viewCount: 12, likeCount: 3 }));

    expect(response.views).toBe(12);
    expect(response.reactions).toBe(3);
  });

  it('should serialise the timestamps to strings', () => {
    const response = toStoryResponse(story());

    expect(response.createdAt).toBe(NOW.toISOString());
    expect(response.updatedAt).toBe(NOW.toISOString());
  });

  it('should default the author to the id with a null name rather than an empty one', () => {
    expect(toStoryResponse(story()).author).toEqual({ id: 'user-1', name: null });
  });

  it('should pass a null author name straight through', () => {
    expect(toStoryResponse(story(), { id: 'user-1', name: null }).author).toEqual({ id: 'user-1', name: null });
  });

  it('should use the author it is given', () => {
    const response = toStoryResponse(story(), { id: 'user-1', name: 'Keeper' });

    expect(response.author).toEqual({ id: 'user-1', name: 'Keeper' });
  });

  it('should report a null category when the story has none', () => {
    expect(toStoryResponse(story()).category).toBeNull();
  });

  it('should report the joined category name', () => {
    expect(toStoryResponse(story({ categoryId: 'cat-1' }), undefined, { category: 'Sea Stories' }).category).toBe(
      'Sea Stories',
    );
  });

  it('should report the joined tag names', () => {
    const response = toStoryResponse(story(), undefined, { tags: ['sea', 'night'] });

    expect(response.tags).toEqual(['sea', 'night']);
  });

  it('should copy the tag array rather than aliasing the caller list', () => {
    const tags = ['sea'];
    const response = toStoryResponse(story(), undefined, { tags });

    tags.push('night');

    expect(response.tags).toEqual(['sea']);
  });

  it('should default to an empty tag list', () => {
    expect(toStoryResponse(story()).tags).toEqual([]);
  });
});

describe('toStoryRecord', () => {
  it('should carry the resolved author name next to the author id', () => {
    const record = toStoryRecord(story(), 'Ahmed');

    expect(record.authorId).toBe('user-1');
    expect(record.authorName).toBe('Ahmed');
  });

  it('should keep an unknown author name as null instead of an empty string', () => {
    expect(toStoryRecord(story(), null).authorName).toBeNull();
  });

  it('should serialise the persistence timestamps to strings', () => {
    const record = toStoryRecord(story(), 'Ahmed');

    expect(record.createdAt).toBe(NOW.toISOString());
    expect(record.publishedAt).toBe(NOW.toISOString());
    expect(record.deletedAt).toBeNull();
  });
});
