import { Controller, Get, Post, Body, Param, UseGuards, Request } from '@nestjs/common';
import type { AuthRequest } from '../../common/types/auth-request.interface.js';
import { MessageReadReceiptsService } from './services/message-read-receipts.service.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { MarkAsReadDto } from '../messages/dto/messages.dto.js';

@Controller('messages/read-receipts')
export class MessageReadReceiptsController {
  constructor(private readonly receiptsService: MessageReadReceiptsService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  async create(@Request() req: AuthRequest, @Body() markAsReadDto: MarkAsReadDto) {
    return this.receiptsService.create(markAsReadDto.messageId, req.user.sub);
  }

  @Get('message/:messageId')
  @UseGuards(JwtAuthGuard)
  async findByMessageId(@Param('messageId') messageId: string) {
    return this.receiptsService.findByMessageId(messageId);
  }
}
