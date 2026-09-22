import { Controller, Get, Post, Body, UseGuards, Request } from '@nestjs/common';
import type { AuthRequest } from '../../common/types/auth-request.interface.js';
import { ConversationsService } from './services/conversations.service.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { CreateConversationDto } from '../messages/dto/messages.dto.js';

@Controller('messages/conversations')
export class ConversationsController {
  constructor(private readonly conversationsService: ConversationsService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  async findByUserId(@Request() req: AuthRequest) {
    return this.conversationsService.findByParticipantId(req.user.sub);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  async create(@Request() req: AuthRequest, @Body() createConversationDto: CreateConversationDto) {
    return this.conversationsService.create(createConversationDto.participantIds);
  }
}
