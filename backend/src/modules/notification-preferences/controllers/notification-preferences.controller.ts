import { Controller, Get, Post, Body, Param } from '@nestjs/common';
import { Public } from '../../common/decorators/roles.decorator.js';
import { NotificationPreferencesService } from '../services/notification-preferences.service.js';

@Controller('notification-preferences')
export class NotificationPreferencesController {
  constructor(private readonly notificationPreferencesService: NotificationPreferencesService) {}

  @Public()
  @Get()
  findAll() {
    return this.notificationPreferencesService.findAll();
  }

  @Public()
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.notificationPreferencesService.findOne(id);
  }

  @Post()
  create(@Body() data: unknown) {
    return this.notificationPreferencesService.create(data);
  }
}
