import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  Inject,
  Request,
  ParseUUIDPipe,
} from '@nestjs/common';

import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard.ts';
import { parseOrThrow } from '../../shared/validation/zod-validation.util.ts';
import { MessagesService } from '../messages.service.ts';
import {
  CreateConversationDto,
  MessageHistoryQueryDto,
  MessagesPageQueryDto,
  SendMessageDto,
  type CreateConversationInput,
  type SendMessageInput,
} from '../dto/messages.dto.ts';

@Controller('messages')
export class MessagesController {
  constructor(@Inject(MessagesService) private readonly messagesService: MessagesService) {}

  /**
   * `POST /messages/conversations`.
   *
   * The body used to be a TYPE ALIAS, which `tsc` erases to `Object`, so the global
   * `ValidationPipe` had no metadata to validate against and `recipientId` went to the database
   * unchecked — a non-UUID reached a foreign key and answered 500. It is now a Zod schema applied with
   * `parseOrThrow`, the same shape `moderation.controller.ts` uses.
   *
   * `participantIds` is still accepted and narrowed to its first entry: `forbidNonWhitelisted` would
   * 400 the plural form that `test/messages.integration-spec.ts` sends, and the service has always
   * taken one recipient.
   */
  @UseGuards(JwtAuthGuard)
  @Post('conversations')
  async createConversation(@Body() body: CreateConversationInput, @Request() req: { user: { sub: string } }) {
    const parsed = parseOrThrow(CreateConversationDto, body);
    const recipientId = parsed.recipientId ?? parsed.participantIds?.[0];

    // The schema's `.refine` already guarantees one of the two is present, so this is belt-and-braces
    // rather than the only check — and it keeps `recipientId` typed as `string` for the service.
    if (!recipientId) {
      return undefined;
    }

    return this.messagesService.getOrCreateConversation(req.user.sub, recipientId);
  }

  /**
   * `page` and `limit` were `Number(x) || n`, which accepts `999999999` and hands it to `LIMIT`, and
   * accepts a negative value — which reaches Postgres as `LIMIT must not be negative` and comes back
   * through `AllExceptionsFilter` as an opaque 500 rather than a 400.
   *
   * The bounded form is the one the rest of the codebase already uses, so this is a convergence
   * rather than a new convention. The default is 20 and stays 20.
   */
  @UseGuards(JwtAuthGuard)
  @Get('conversations')
  async getConversations(@Request() req: { user: { sub: string } }, @Query() query: unknown) {
    const { page, limit } = parseOrThrow(MessagesPageQueryDto, query);
    return this.messagesService.getConversations(req.user.sub, page, limit);
  }

  /**
   * The history default stays **50**, not 20: `Number(limit) || 50` is the existing contract and
   * `messages.service.spec.ts` asserts `(…, 1, 50)`. Changing it to match the list default would be a
   * silent API change for no reason.
   */
  @UseGuards(JwtAuthGuard)
  @Get('conversations/:conversationId/messages')
  async getMessages(
    @Param('conversationId', ParseUUIDPipe) conversationId: string,
    @Request() req: { user: { sub: string } },
    @Query() query: unknown,
  ) {
    const { page, limit } = parseOrThrow(MessageHistoryQueryDto, query);
    return this.messagesService.getMessages(conversationId, req.user.sub, page, limit);
  }

  /**
   * `content` used to be `@Body('content') content: string` — a primitive, so there was never any
   * metadata for a validator to read. An empty body sent `undefined` into a `NOT NULL` column and
   * answered 500, and an unbounded string was accepted at any size.
   */
  @UseGuards(JwtAuthGuard)
  @Post('conversations/:conversationId/messages')
  async sendMessage(
    @Param('conversationId', ParseUUIDPipe) conversationId: string,
    @Body() body: SendMessageInput,
    @Request() req: { user: { sub: string } },
  ) {
    const { content } = parseOrThrow(SendMessageDto, body);
    return this.messagesService.sendMessage(conversationId, req.user.sub, content);
  }

  /**
   * `PATCH /messages/:messageId/read`.
   *
   * This was `@Patch('messages/:messageId/read')` under `@Controller('messages')`, so the controller
   * base and the route segment both contributed a `messages` and the ONLY path that resolved was
   * `PATCH /api/v1/messages/messages/:messageId/read`. The natural path was a 404, and no client
   * guesses a doubled segment — so read receipts for one message were unreachable over HTTP. The
   * route segment drops its redundant prefix rather than the controller base: `messages` is the
   * module's public noun and `backend/src/modules/messages/README.md:11` already documented the
   * natural path, so the controller had drifted from its own module contract.
   *
   * WHY THIS CANNOT BE CONFUSED WITH `conversations/:conversationId/read` BELOW. Express matches a
   * whole path, and the two shapes have different segment counts under this controller base:
   * `:messageId/read` is two segments after `messages`, `conversations/:conversationId/read` is
   * three. `PATCH /messages/conversations/<uuid>/read` therefore cannot reach this handler at all,
   * and no `:messageId` can be swallowed by the conversation route either — the two are disjoint by
   * construction, so there is no registration order that could make one shadow the other.
   * `ParseUUIDPipe` is what rejects a caller who puts a non-UUID in the `messageId` position.
   */
  @UseGuards(JwtAuthGuard)
  @Patch(':messageId/read')
  async markAsRead(@Param('messageId', ParseUUIDPipe) messageId: string, @Request() req: { user: { sub: string } }) {
    return this.messagesService.markAsRead(messageId, req.user.sub);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('conversations/:conversationId/read')
  async markAllAsRead(
    @Param('conversationId', ParseUUIDPipe) conversationId: string,
    @Request() req: { user: { sub: string } },
  ) {
    await this.messagesService.markAllAsRead(conversationId, req.user.sub);
    return { message: 'All messages marked as read' };
  }

  @UseGuards(JwtAuthGuard)
  @Get('conversations/:conversationId/unread')
  async getUnreadCount(
    @Param('conversationId', ParseUUIDPipe) conversationId: string,
    @Request() req: { user: { sub: string } },
  ) {
    const count = await this.messagesService.getUnreadCount(conversationId, req.user.sub);
    return { count };
  }
}
