import { describe, it, expect } from 'vitest';
import { BadRequestException } from '@nestjs/common';

import { parseOrThrow } from '../../shared/validation/zod-validation.util.ts';
import {
  CreateConversationDto,
  MAX_MESSAGE_LENGTH,
  MessageHistoryQueryDto,
  MessagesPageQueryDto,
  SendMessageDto,
} from './messages.dto.ts';

const parse = <T>(schema: Parameters<typeof parseOrThrow>[0], value: unknown): T => parseOrThrow(schema, value) as T;

describe('CreateConversationDto', () => {
  it('accepts a single recipientId', () => {
    const parsed = parse<{ recipientId?: string }>(CreateConversationDto, {
      recipientId: '11111111-1111-4111-8111-111111111111',
    });

    expect(parsed.recipientId).toBe('11111111-1111-4111-8111-111111111111');
  });

  it('still accepts the plural participantIds, because forbidNonWhitelisted would 400 it otherwise', () => {
    // test/messages.integration-spec.ts sends the plural form. Dropping it from the schema would turn
    // a live integration test into a 400, so it is declared, bounded and narrowed by the handler.
    const parsed = parse<{ participantIds?: string[] }>(CreateConversationDto, {
      participantIds: ['11111111-1111-4111-8111-111111111111'],
    });

    expect(parsed.participantIds).toEqual(['11111111-1111-4111-8111-111111111111']);
  });

  it('rejects a recipientId that is not a UUID', () => {
    // This is the defect: the old body was a type alias, so the ValidationPipe had no metadata and
    // 'not-a-uuid' reached the conversations foreign key and answered 500.
    expect(() => parseOrThrow(CreateConversationDto, { recipientId: 'not-a-uuid' })).toThrow(BadRequestException);
  });

  it('rejects a body with neither recipientId nor participantIds', () => {
    expect(() => parseOrThrow(CreateConversationDto, {})).toThrow(BadRequestException);
  });

  it('rejects an empty participantIds array', () => {
    expect(() => parseOrThrow(CreateConversationDto, { participantIds: [] })).toThrow(BadRequestException);
  });

  it('rejects a non-UUID inside participantIds', () => {
    expect(() =>
      parseOrThrow(CreateConversationDto, { participantIds: ['11111111-1111-4111-8111-111111111111', 'nope'] }),
    ).toThrow(BadRequestException);
  });
});

describe('SendMessageDto', () => {
  it('accepts ordinary content and trims it', () => {
    const parsed = parse<{ content: string }>(SendMessageDto, { content: '  Hello!  ' });

    expect(parsed.content).toBe('Hello!');
  });

  it('accepts Arabic content', () => {
    const parsed = parse<{ content: string }>(SendMessageDto, { content: 'مرحبا بك' });

    expect(parsed.content).toBe('مرحبا بك');
  });

  it('rejects a missing content, which used to answer 500 from the NOT NULL column', () => {
    expect(() => parseOrThrow(SendMessageDto, {})).toThrow(BadRequestException);
  });

  it('rejects an empty body', () => {
    expect(() => parseOrThrow(SendMessageDto, { content: '' })).toThrow(BadRequestException);
  });

  it('rejects whitespace-only content', () => {
    expect(() => parseOrThrow(SendMessageDto, { content: '    ' })).toThrow(BadRequestException);
  });

  it('rejects content at the boundary plus one', () => {
    expect(() => parseOrThrow(SendMessageDto, { content: 'a'.repeat(MAX_MESSAGE_LENGTH + 1) })).toThrow(
      BadRequestException,
    );
  });

  it('accepts content at exactly the boundary', () => {
    const parsed = parse<{ content: string }>(SendMessageDto, { content: 'a'.repeat(MAX_MESSAGE_LENGTH) });

    expect(parsed.content).toHaveLength(MAX_MESSAGE_LENGTH);
  });

  it('rejects a non-string content', () => {
    // @Body('content') typed the field as a string, so a number or an object arrived at the repository
    // unchallenged. There is no coercion here: a number is not a message.
    expect(() => parseOrThrow(SendMessageDto, { content: 42 })).toThrow(BadRequestException);
    expect(() => parseOrThrow(SendMessageDto, { content: { text: 'hi' } })).toThrow(BadRequestException);
  });
});

describe('MessagesPageQueryDto', () => {
  it('defaults to page 1, limit 20 for an absent query string', () => {
    const parsed = parse<{ page: number; limit: number }>(MessagesPageQueryDto, {});

    expect(parsed).toEqual({ page: 1, limit: 20 });
  });

  it('coerces numeric strings from the query string', () => {
    const parsed = parse<{ page: number; limit: number }>(MessagesPageQueryDto, { page: '3', limit: '50' });

    expect(parsed).toEqual({ page: 3, limit: 50 });
  });

  it('rejects a limit beyond the ceiling, which used to reach LIMIT as-is', () => {
    expect(() => parseOrThrow(MessagesPageQueryDto, { limit: '999999999' })).toThrow(BadRequestException);
  });

  it('accepts a limit exactly at the ceiling', () => {
    expect(parse<{ limit: number }>(MessagesPageQueryDto, { limit: '100' }).limit).toBe(100);
  });

  it('rejects a negative limit, which reached Postgres as LIMIT must not be negative and answered 500', () => {
    // 'Number("-5")' is truthy, so the old 'Number(limit) || 20' passed it straight through and
    // AllExceptionsFilter rendered the driver's error as an opaque 500 rather than a 400.
    expect(() => parseOrThrow(MessagesPageQueryDto, { limit: '-5' })).toThrow(BadRequestException);
    expect(() => parseOrThrow(MessagesPageQueryDto, { page: '-1' })).toThrow(BadRequestException);
  });

  it('rejects a zero limit and a zero page', () => {
    expect(() => parseOrThrow(MessagesPageQueryDto, { limit: '0' })).toThrow(BadRequestException);
    expect(() => parseOrThrow(MessagesPageQueryDto, { page: '0' })).toThrow(BadRequestException);
  });

  it('rejects a fractional limit', () => {
    // Postgres ROUNDS 'LIMIT 2.5' to 3 while the response envelope reported 'limit: 2.5', so the caller
    // was told one page size and given another.
    expect(() => parseOrThrow(MessagesPageQueryDto, { limit: '2.5' })).toThrow(BadRequestException);
  });

  it('rejects a non-numeric page', () => {
    expect(() => parseOrThrow(MessagesPageQueryDto, { page: 'abc' })).toThrow(BadRequestException);
  });
});

describe('MessageHistoryQueryDto', () => {
  it('defaults to limit 50, not the list default of 20', () => {
    // 'Number(limit) || 50' is the existing contract and messages.service.spec.ts asserts the 50.
    const parsed = parse<{ page: number; limit: number }>(MessageHistoryQueryDto, {});

    expect(parsed).toEqual({ page: 1, limit: 50 });
  });

  it('still honours an explicit limit', () => {
    expect(parse<{ limit: number }>(MessageHistoryQueryDto, { limit: '10' }).limit).toBe(10);
  });

  it('still enforces the ceiling', () => {
    expect(() => parseOrThrow(MessageHistoryQueryDto, { limit: '101' })).toThrow(BadRequestException);
  });
});
