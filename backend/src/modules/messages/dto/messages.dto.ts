import { z } from 'zod';

/**
 * WHY ZOD AND NOT `class-validator`, AND WHY `parseOrThrow` AT THE HANDLER.
 *
 * The messages module had no `dto/` directory at all, and `POST /messages/conversations` took
 * `@Body() body: { recipientId?: string; participantIds?: string[] }` — a TYPE ALIAS. That is the trap
 * `shared/validation/zod-validation.util.ts` and `search/dto/search.dto.ts` both document: `tsc`
 * erases a type alias to `Object`, so the global `ValidationPipe` reads nothing out of
 * `design:paramtypes` and validates nothing. `main.ts` installs the pipe with
 * `forbidNonWhitelisted: true` and it was inert on this route.
 *
 * `SendMessage` was worse: `@Body('content') content: string` is a primitive, so there was never any
 * metadata to validate against. Posting `{}` sent `undefined` to a `NOT NULL` column and answered
 * 500; posting ten megabytes of text was accepted.
 *
 * `moderation/dto/report.dto.ts` is the worked example of a Zod body DTO validated with
 * `parseOrThrow` at the controller boundary, and this follows it.
 */

/**
 * WHY `participantIds` IS STILL DECLARED. `main.ts` sets `forbidNonWhitelisted: true`, so a key the
 * schema does not name is a 400 — and `test/messages.integration-spec.ts:26` sends
 * `{ participantIds: [recipient.id] }`. Removing it to tidy the API would break a live test and every
 * client that uses the plural form. It is therefore accepted, bounded, and narrowed to its first entry
 * by the handler, which is what the service has always done.
 */
export const CreateConversationDto = z
  .object({
    recipientId: z.string().uuid('recipientId must be a valid UUID').optional(),
    participantIds: z
      .array(z.string().uuid('participantIds must contain only valid UUIDs'))
      .min(1, 'participantIds must not be empty')
      .optional(),
  })
  .refine((value) => Boolean(value.recipientId) || Boolean(value.participantIds), {
    message: 'recipientId or participantIds is required',
    path: ['recipientId'],
  });

export type CreateConversationDto = z.infer<typeof CreateConversationDto>;

/**
 * The request is a type alias, so the parameter is typed `unknown` and the whole body is validated in
 * one statement at the handler. See the note above on why the alias cannot be replaced with a class
 * here.
 */
export type CreateConversationInput = {
  recipientId?: unknown;
  participantIds?: unknown;
};

/**
 * WHY 4000. It is a choice, not a derivation, so the number is named once here and shared by the
 * DTO, the Swagger schema and the tests. `CreateCommentDto.content` is 2000 and `CreateStoryDto`
 * allows far more, so a direct message sitting between the two is a defensible middle.
 *
 * `messages.content` is a Postgres `text` column, which has no limit of its own, so this is enforced
 * entirely in the application — which is why it has to exist at all.
 */
export const MAX_MESSAGE_LENGTH = 4000;

export const SendMessageDto = z.object({
  content: z
    .string({ required_error: 'Message content is required' })
    .trim()
    .min(1, 'Message content must not be empty')
    .max(MAX_MESSAGE_LENGTH, `Message must not exceed ${MAX_MESSAGE_LENGTH} characters`),
});

export type SendMessageDto = z.infer<typeof SendMessageDto>;

export type SendMessageInput = {
  content?: unknown;
};

/**
 * `page` and `limit` for the two paginated reads.
 *
 * WHY THE CEILING IS 100. It is the ceiling the rest of the codebase already applies to a paginated
 * read — `SearchFiltersDto.limit`, `NotificationQueryDto.limit`, `FollowersQueryDto.limit` all carry
 * `@Max(100)` — so this brings the module onto the existing convention instead of inventing a number.
 *
 * `.int()` matters: `Number('2.5')` is truthy and reached `LIMIT 2.5`, which Postgres ROUNDS, while the
 * response envelope reported back `limit: 2.5`. The caller was told one page size and given another.
 */
export const MessagesPageQueryDto = z.object({
  page: z.coerce
    .number({ invalid_type_error: 'Page must be a number' })
    .int('Page must be an integer')
    .positive('Page must be greater than zero')
    .default(1),
  limit: z.coerce
    .number({ invalid_type_error: 'Limit must be a number' })
    .int('Limit must be an integer')
    .positive('Limit must be greater than zero')
    .max(100, `Limit must not exceed 100`)
    .default(20),
});

export type MessagesPageQueryDto = z.infer<typeof MessagesPageQueryDto>;

/**
 * The conversation list's default page size is 20 and the message history's is 50, so the two handlers
 * need different fallbacks.
 *
 * WHY `.extend(...)` AND NOT `.default({ page: 1, limit: 50 })`. On a ZodObject, `.default(v)` REPLACES
 * the schema with "this whole value is optional, and if absent use v" — it applies only when the input
 * is `undefined`, not when it is `{}`. `@Query()` hands over `{}` for a request with no query string, so
 * that form silently fell back to the *list* schema's limit of 20 and the history endpoint changed its
 * default page size without anything failing. `.extend()` overrides the field's own default, which is
 * what was intended, and `messages.service.spec.ts` asserts the 50.
 */
export const MessageHistoryQueryDto = MessagesPageQueryDto.extend({
  limit: z.coerce
    .number({ invalid_type_error: 'Limit must be a number' })
    .int('Limit must be an integer')
    .positive('Limit must be greater than zero')
    .max(100, 'Limit must not exceed 100')
    .default(50),
});

export type MessageHistoryQueryDto = z.infer<typeof MessageHistoryQueryDto>;
