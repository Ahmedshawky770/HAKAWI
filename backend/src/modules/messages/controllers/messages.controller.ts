import { Controller, Get, Post, Patch, Body, Param, Query, UseGuards, Inject, Request, BadRequestException } from '@nestjs/common';

import { Public } from '../../../common/decorators/roles.decorator.ts';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard.ts';
import { MessagesService } from '../messages.service.ts';

@Controller('messages')
export class MessagesController {
  constructor(@Inject(MessagesService) private readonly messagesService: MessagesService) {}

  @UseGuards(JwtAuthGuard)
  @Post('conversations')
  async createConversation(@Body() body: { recipientId?: string; participantIds?: string[] }, @Request() req: { user: { sub: string } }) {
    const recipientId = body.recipientId || body.participantIds?.[0];
    if (!recipientId) {
      throw new BadRequestException('recipientId or participantIds is required');
    }
    const conversation = await this.messagesService.getOrCreateConversation(req.user.sub, recipientId);
    return conversation;
  }

  @UseGuards(JwtAuthGuard)
  @Get('conversations')
  async getConversations(@Request() req: { user: { sub: string } }, @Query('page') page?: string, @Query('limit') limit?: string) {
    return this.messagesService.getConversations(req.user.sub, Number(page) || 1, Number(limit) || 20);
  }

  @UseGuards(JwtAuthGuard)
  @Get('conversations/:conversationId/messages')
  async getMessages(@Param('conversationId') conversationId: string, @Request() req: { user: { sub: string } }, @Query('page') page?: string, @Query('limit') limit?: string) {
    return this.messagesService.getMessages(conversationId, req.user.sub, Number(page) || 1, Number(limit) || 50);
  }

  @UseGuards(JwtAuthGuard)
  @Post('conversations/:conversationId/messages')
  async sendMessage(@Param('conversationId') conversationId: string, @Body('content') content: string, @Request() req: { user: { sub: string } }) {
    return this.messagesService.sendMessage(conversationId, req.user.sub, content);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('messages/:messageId/read')
  async markAsRead(@Param('messageId') messageId: string, @Request() req: { user: { sub: string } }) {
    return this.messagesService.markAsRead(messageId, req.user.sub);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('conversations/:conversationId/read')
  async markAllAsRead(@Param('conversationId') conversationId: string, @Request() req: { user: { sub: string } }) {
    await this.messagesService.markAllAsRead(conversationId, req.user.sub);
    return { message: 'All messages marked as read' };
  }

  @UseGuards(JwtAuthGuard)
  @Get('conversations/:conversationId/unread')
  async getUnreadCount(@Param('conversationId') conversationId: string, @Request() req: { user: { sub: string } }) {
    const count = await this.messagesService.getUnreadCount(conversationId, req.user.sub);
    return { count };
  }
}
