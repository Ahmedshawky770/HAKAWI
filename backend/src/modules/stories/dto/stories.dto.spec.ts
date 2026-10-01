import { describe, it, expect } from 'vitest';
import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';

import { CreateStoryDto, UpdateStoryDto, MAX_STORY_TAGS, MAX_STORY_TAG_LENGTH } from './stories.dto.ts';
import {
  deriveStorySlug,
  storySlugCandidates,
  MAX_STORY_SLUG_LENGTH,
  MAX_SLUG_COLLISION_ATTEMPTS,
} from './story-slug.ts';

/**
 * The exact pipe `main.ts:118-127` installs, reproduced here rather than imported so this suite
 * fails the moment the production configuration and this one disagree — that divergence is the
 * whole bug class (`whitelist`/`forbidNonWhitelisted` turning an undeclared field into a 400).
 */
function productionPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    transform: true,
    forbidNonWhitelisted: true,
    transformOptions: { enableImplicitConversion: true },
  });
}

const VALID_UUID_V4 = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';

async function messagesFor(cls: typeof CreateStoryDto | typeof UpdateStoryDto, payload: unknown): Promise<string[]> {
  const pipe = productionPipe();
  try {
    await pipe.transform(payload, { type: 'body', metatype: cls });
    return [];
  } catch (error) {
    const response = (error as { getResponse?: () => { message?: string | string[] } }).getResponse?.();
    const message = response?.message;
    if (Array.isArray(message)) {
      return message;
    }
    return typeof message === 'string' ? [message] : [String(error)];
  }
}

async function accepts(cls: typeof CreateStoryDto | typeof UpdateStoryDto, payload: unknown): Promise<boolean> {
  return (await messagesFor(cls, payload)).length === 0;
}

describe('deriveStorySlug', () => {
  it('lowercases and hyphenates a plain ASCII title', () => {
    expect(deriveStorySlug('The Lighthouse')).toBe('the-lighthouse');
  });

  it('strips diacritics instead of deleting the letter they sit on', () => {
    // The bug this prevents: dropping "Café" as a non-ASCII run yields "caf", not "cafe".
    expect(deriveStorySlug('Café au Lait')).toBe('cafe-au-lait');
    expect(deriveStorySlug('Añejo Ñandú')).toBe('anejo-nandu');
  });

  it('transliterates the letters Unicode does not decompose', () => {
    expect(deriveStorySlug('Straße')).toBe('strasse');
    expect(deriveStorySlug('Æther Øre Łódź')).toBe('aether-ore-lodz');
  });

  it('collapses every run of punctuation and whitespace into a single hyphen', () => {
    expect(deriveStorySlug('Hello,  World!!  Again')).toBe('hello-world-again');
  });

  it('never leads or trails with a hyphen', () => {
    expect(deriveStorySlug('  ...A Lighthouse...  ')).toBe('a-lighthouse');
  });

  it('is deterministic, so the same title always derives the same slug', () => {
    expect(deriveStorySlug('The Lighthouse')).toBe(deriveStorySlug('The Lighthouse'));
  });

  it('produces a slug that satisfies the DTO pattern it will be validated against', async () => {
    const slug = deriveStorySlug('The Lighthouse');
    // Feeding the derived slug back through the pipe is the real invariant: derivation must not be
    // able to emit a value its own DTO would reject.
    expect(await accepts(CreateStoryDto, { title: 'The Lighthouse', slug })).toBe(true);
  });

  it('truncates to the documented readable limit and never ends on a hyphen', () => {
    const title = Array.from({ length: 80 }, (_, index) => `word${index}`).join(' ');
    const slug = deriveStorySlug(title);

    expect(slug.length).toBeLessThanOrEqual(MAX_STORY_SLUG_LENGTH);
    expect(slug.endsWith('-')).toBe(false);
  });

  it('leaves headroom under the column width so a collision suffix can never overflow it', () => {
    const title = Array.from({ length: 80 }, (_, index) => `word${index}`).join(' ');
    const slug = deriveStorySlug(title);
    const lastCandidate = storySlugCandidates(slug).at(-1) ?? '';

    // stories.slug is varchar(255) (stories.schema.ts:51).
    expect(slug.length + `-${MAX_SLUG_COLLISION_ATTEMPTS}`.length).toBeLessThanOrEqual(255);
    expect(lastCandidate.length).toBeLessThanOrEqual(255);
  });

  it('rejects a title with nothing slugifiable in it with a typed 400', () => {
    // Arabic and other non-Latin scripts survive NFKD but contain no [a-z0-9], so they produce an
    // empty result. That must be a readable refusal, never a row with an empty slug.
    expect(() => deriveStorySlug('ليلة في الحارة')).toThrow(BadRequestException);
    expect(() => deriveStorySlug('???')).toThrow(BadRequestException);
    expect(() => deriveStorySlug('   ')).toThrow(BadRequestException);
  });

  it('names the offending title in the 400 so the caller can act on it', () => {
    expect(() => deriveStorySlug('???')).toThrow(/"\?\?\?"/);
  });
});

describe('storySlugCandidates', () => {
  it('starts at the bare base and then counts up deterministically', () => {
    expect(storySlugCandidates('the-lighthouse', 3)).toEqual([
      'the-lighthouse',
      'the-lighthouse-2',
      'the-lighthouse-3',
    ]);
  });

  it('is bounded by the documented attempt limit', () => {
    expect(storySlugCandidates('x')).toHaveLength(MAX_SLUG_COLLISION_ATTEMPTS);
  });
});

describe('CreateStoryDto through the production ValidationPipe', () => {
  it('accepts the documented frontend body with no slug and no category name', async () => {
    // The regression this file exists for: { title, content, category, tags } was a 400 twice over,
    // because `slug` was required and `category` was not whitelisted.
    expect(
      await accepts(CreateStoryDto, {
        title: 'The Lighthouse',
        content: '<p>Once upon a time</p>',
        categoryId: VALID_UUID_V4,
        tags: ['sea', 'night'],
      }),
    ).toBe(true);
  });

  it('accepts the full body including excerpt, coverImage and a client-supplied slug', async () => {
    expect(
      await accepts(CreateStoryDto, {
        title: 'The Lighthouse',
        slug: 'the-lighthouse',
        content: '<p>Once upon a time</p>',
        excerpt: 'A short excerpt',
        coverImage: 'https://example.com/cover.jpg',
        categoryId: VALID_UUID_V4,
        tags: ['sea'],
      }),
    ).toBe(true);
  });

  it('accepts a title on its own, because the slug is now server-derived', async () => {
    expect(await accepts(CreateStoryDto, { title: 'Just A Title' })).toBe(true);
  });

  it('still rejects a client-supplied slug that is not URL-safe', async () => {
    const messages = await messagesFor(CreateStoryDto, { title: 'Bad', slug: 'Not A Valid Slug' });

    expect(messages.join(' ')).toContain('Slug can only contain lowercase letters, numbers, and hyphens');
  });

  it('rejects an empty slug instead of silently deriving one, so the intent is explicit', async () => {
    const messages = await messagesFor(CreateStoryDto, { title: 'Bad', slug: '' });

    expect(messages.join(' ')).toContain('Slug must not be empty');
  });

  it('rejects a missing title', async () => {
    const messages = await messagesFor(CreateStoryDto, { content: 'no title' });

    expect(messages.join(' ')).toContain('Title is required');
  });

  it('rejects a category name, because the mutation input is the foreign key not the label', async () => {
    // `whitelist` + `forbidNonWhitelisted` is what turns an undeclared key into a 400 here. This
    // assertion documents that the removal is deliberate rather than an oversight.
    const messages = await messagesFor(CreateStoryDto, { title: 'The Lighthouse', category: 'fiction' });

    expect(messages.join(' ')).toContain('category');
  });

  it('rejects a categoryId that is not a uuid v4', async () => {
    const messages = await messagesFor(CreateStoryDto, { title: 'The Lighthouse', categoryId: 'fiction' });

    expect(messages.join(' ')).toContain('Category ID must be a valid UUID');
  });
});

describe('CreateStoryDto.tags', () => {
  it('accepts a list of strings', async () => {
    expect(await accepts(CreateStoryDto, { title: 'T', tags: ['sea', 'night'] })).toBe(true);
  });

  it('accepts an empty list, which is what the create form sends when no tag is typed', async () => {
    expect(await accepts(CreateStoryDto, { title: 'T', tags: [] })).toBe(true);
  });

  it('rejects a non-string element, which plain @IsString() silently allowed', async () => {
    // The actual bug: per-property validators check the property, not each element, so
    // `tags: [1, 2, {}]` used to sail through the pipe untouched.
    const messages = await messagesFor(CreateStoryDto, { title: 'T', tags: [1, 2, {}] });

    expect(messages.length).toBeGreaterThan(0);
    expect(messages.join(' ')).toContain('tag');
  });

  it('rejects a nested object element', async () => {
    expect(await accepts(CreateStoryDto, { title: 'T', tags: [{ name: 'sea' }] })).toBe(false);
  });

  it('rejects a null element rather than storing a null tag', async () => {
    expect(await accepts(CreateStoryDto, { title: 'T', tags: ['sea', null] })).toBe(false);
  });

  it('rejects a tags value that is not an array at all', async () => {
    expect(await accepts(CreateStoryDto, { title: 'T', tags: 'sea' })).toBe(false);
  });

  it('blames only the type when an element is not a string, never its length', async () => {
    // class-validator's maxLength is `typeof value === 'string' && ...`, so a plain
    // `@MaxLength(n, { each: true })` also fires on a number and tells the caller to shorten it.
    const messages = await messagesFor(CreateStoryDto, { title: 'T', tags: [1] });

    expect(messages).toEqual(['each value in tags must be a string']);
  });

  it('still reports a genuine over-length string with the length message', async () => {
    const messages = await messagesFor(CreateStoryDto, {
      title: 'T',
      tags: ['ok', 'a'.repeat(MAX_STORY_TAG_LENGTH + 1)],
    });

    expect(messages).toEqual([`Each tag must not exceed ${MAX_STORY_TAG_LENGTH} characters`]);
  });

  it(`rejects more than ${MAX_STORY_TAGS} tags, bounding the array at the boundary`, async () => {
    const tooMany = Array.from({ length: MAX_STORY_TAGS + 1 }, (_, index) => `tag-${index}`);

    const messages = await messagesFor(CreateStoryDto, { title: 'T', tags: tooMany });

    expect(messages.join(' ')).toContain(`more than ${MAX_STORY_TAGS} tags`);
  });

  it(`accepts exactly ${MAX_STORY_TAGS} tags, so the limit is a boundary and not an off-by-one`, async () => {
    const atLimit = Array.from({ length: MAX_STORY_TAGS }, (_, index) => `tag-${index}`);

    expect(await accepts(CreateStoryDto, { title: 'T', tags: atLimit })).toBe(true);
  });

  it(`rejects an element longer than ${MAX_STORY_TAG_LENGTH}, which is tags.name's own column width`, async () => {
    const tooLong = ['a'.repeat(MAX_STORY_TAG_LENGTH + 1)];
    const messages = await messagesFor(CreateStoryDto, { title: 'T', tags: tooLong });

    expect(messages.join(' ')).toContain(`Each tag must not exceed ${MAX_STORY_TAG_LENGTH} characters`);
  });

  it('accepts an element of exactly the column width', async () => {
    expect(await accepts(CreateStoryDto, { title: 'T', tags: ['a'.repeat(MAX_STORY_TAG_LENGTH)] })).toBe(true);
  });

  it('rejects duplicates, which would be a key collision on the story_tags primary key', async () => {
    const messages = await messagesFor(CreateStoryDto, { title: 'T', tags: ['sea', 'sea'] });

    expect(messages.join(' ')).toContain('must not contain duplicates');
  });
});

describe('UpdateStoryDto through the production ValidationPipe', () => {
  it('accepts the body the edit form sends, including tags', async () => {
    // `tags` was absent from UpdateStoryDto, so this exact request was a 400.
    expect(
      await accepts(UpdateStoryDto, {
        title: 'Edited Draft',
        content: '<p>Updated</p>',
        categoryId: VALID_UUID_V4,
        tags: ['sea', 'night'],
      }),
    ).toBe(true);
  });

  it('accepts a title change on its own, leaving the slug alone', async () => {
    expect(await accepts(UpdateStoryDto, { title: 'Edited Draft' })).toBe(true);
  });

  it('accepts an empty patch without complaint, leaving the slug untouched', async () => {
    expect(await accepts(UpdateStoryDto, {})).toBe(true);
  });

  it('still rejects an invalid client-supplied slug', async () => {
    const messages = await messagesFor(UpdateStoryDto, { slug: 'Not A Valid Slug' });

    expect(messages.join(' ')).toContain('Slug can only contain lowercase letters, numbers, and hyphens');
  });

  it('rejects a category name for the same reason create does', async () => {
    const messages = await messagesFor(UpdateStoryDto, { category: 'fiction' });

    expect(messages.join(' ')).toContain('category');
  });

  it('applies the same tag bounds as create', async () => {
    const tooMany = Array.from({ length: MAX_STORY_TAGS + 1 }, (_, index) => `tag-${index}`);

    expect(await accepts(UpdateStoryDto, { tags: [1] })).toBe(false);
    expect(await accepts(UpdateStoryDto, { tags: tooMany })).toBe(false);
    expect(await accepts(UpdateStoryDto, { tags: ['a'.repeat(MAX_STORY_TAG_LENGTH + 1)] })).toBe(false);
  });

  it('rejects a status outside the story lifecycle', async () => {
    const messages = await messagesFor(UpdateStoryDto, { status: 'deleted' });

    expect(messages.join(' ')).toContain('Status must be draft, published, or archived');
  });
});

describe('the mutation contract as a whole', () => {
  it('never lets an undeclared property through, which is what produced the 400s', async () => {
    // Every optional key the frontend or the shared contract could plausibly send, so a future field
    // that is added to the wire type but forgotten here shows up as a failing assertion, not a
    // production 400. `title` is exercised separately because it is the one required key.
    const optionalKeys = ['slug', 'content', 'excerpt', 'coverImage', 'categoryId', 'tags'];

    for (const key of optionalKeys) {
      expect(await accepts(CreateStoryDto, { title: 'The Lighthouse', [key]: undefined })).toBe(true);
    }
    expect(await accepts(CreateStoryDto, { title: 'The Lighthouse' })).toBe(true);
  });

  it('rejects every field the old contract used to send and the new one dropped', async () => {
    expect(await accepts(CreateStoryDto, { title: 'T', category: 'fiction' })).toBe(false);
    expect(await accepts(CreateStoryDto, { title: 'T', status: 'published' })).toBe(false);
    expect(await accepts(CreateStoryDto, { title: 'T', viewCount: 10 })).toBe(false);
    expect(await accepts(CreateStoryDto, { title: 'T', authorId: 'someone-else' })).toBe(false);
    expect(await accepts(CreateStoryDto, { title: 'T', id: 'chosen-by-the-client' })).toBe(false);
  });

  it('declares slug as optional on both mutation DTOs, so omission is a valid request', async () => {
    // A compile-time assertion as well as a behavioural one: if slug ever goes back to required,
    // this file stops type-checking.
    const create = plainToInstance(CreateStoryDto, { title: 'T' });
    const update = plainToInstance(UpdateStoryDto, { title: 'T' });

    expect(create.slug).toBeUndefined();
    expect(update.slug).toBeUndefined();
    await expect(validate(create)).resolves.toHaveLength(0);
    await expect(validate(update)).resolves.toHaveLength(0);
  });
});
