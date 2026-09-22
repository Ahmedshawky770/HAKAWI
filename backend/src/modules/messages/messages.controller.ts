import { Controller, Get, Post, Body, Param, UseGuards, Request } from '@nestjs/common';
import type { AuthRequest } from '../../common/types/auth-request.interface.js';
import { ConversationsService } from '../conversations/services/conversations.service.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { CreateMessageDto } from './dto/messages.dto.js';

@Controller('messages')
export class MessagesController {
  constructor(private readonly conversationsService: ConversationsService) {}

  @Get('conversations/:id')
  @UseGuards(JwtAuthGuard)
  async getMessages(@Param('id') conversationId: string, @Request() req: AuthRequest) {
    return this.conversationsService.getMessages(conversationId, req.user.sub);
  }

  @Post('conversations/:id/messages')
  @UseGuards(JwtAuthGuard)
  async sendMessage(@Param('id') conversationId: string, @Request() req: AuthRequest, @Body() createMessageDto: CreateMessageDto) {
    return this.conversationsService.sendMessage(conversationId, req.user.sub, createMessageDto.content);
  }
}
