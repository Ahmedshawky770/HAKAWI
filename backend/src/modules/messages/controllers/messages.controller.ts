import { Controller, Get, Post, Body, Param } from '@nestjs/common';
import { Public } from '../../common/decorators/roles.decorator.js';
import { MessagesService } from '../services/messages.service.js';

@Controller('messages')
export class MessagesController {
  constructor(private readonly messagesService: MessagesService) {}

  @Public()
  @Get()
  findAll() {
    return this.messagesService.findAll();
  }

  @Public()
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.messagesService.findOne(id);
  }

  @Post()
  create(@Body() data: unknown) {
    return this.messagesService.create(data);
  }
}
