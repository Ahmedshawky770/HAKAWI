import { Controller, Get, Post, Body, Param } from '@nestjs/common';
import { Public } from '../../common/decorators/roles.decorator.js';
import { MessageReadReceiptsService } from '../services/message-read-receipts.service.js';

@Controller('message-read-receipts')
export class MessageReadReceiptsController {
  constructor(private readonly messageReadReceiptsService: MessageReadReceiptsService) {}

  @Public()
  @Get()
  findAll() {
    return this.messageReadReceiptsService.findAll();
  }

  @Public()
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.messageReadReceiptsService.findOne(id);
  }

  @Post()
  create(@Body() data: unknown) {
    return this.messageReadReceiptsService.create(data);
  }
}
