import { describe, it, expect } from 'vitest';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';

import { SearchFiltersDto } from './search.dto.ts';

async function check(input: Record<string, unknown>): Promise<string[]> {
  const dto = plainToInstance(SearchFiltersDto, input);
  const errors = await validate(dto);
  return errors.flatMap((error) => Object.values(error.constraints ?? {}));
}

describe('SearchFiltersDto', () => {
  it('should accept an empty query', async () => {
    await expect(check({})).resolves.toEqual([]);
  });

  it('should accept a normal search', async () => {
    await expect(check({ query: 'sea', category: 'fiction', page: 2, limit: 20 })).resolves.toEqual([]);
  });

  it('should reject a non numeric page', async () => {
    await expect(check({ page: 'abc' })).resolves.toContain('Page must be an integer');
  });

  it('should reject a page below one', async () => {
    await expect(check({ page: 0 })).resolves.toContain('page must not be less than 1');
  });

  it('should reject a limit above one hundred', async () => {
    await expect(check({ limit: 101 })).resolves.toContain('limit must not be greater than 100');
  });

  it('should reject a malformed author id', async () => {
    await expect(check({ authorId: 'not-a-uuid' })).resolves.toContain('Author ID must be a valid UUID');
  });

  it('should accept a v4 author id', async () => {
    await expect(check({ authorId: '123e4567-e89b-42d3-a456-426614174000' })).resolves.toEqual([]);
  });

  it('should reject an unknown status', async () => {
    await expect(check({ status: 'archived-ish' })).resolves.toContain('Status must be draft, published, or archived');
  });

  it('should reject an unknown sort field', async () => {
    await expect(check({ sortBy: 'drop_table' })).resolves.toContain(
      'Sort by must be relevance, date, views, or reactions',
    );
  });

  it.each(['relevance', 'date', 'views', 'reactions'])('should accept the %s sort field', async (sortBy) => {
    await expect(check({ sortBy })).resolves.toEqual([]);
  });
});
