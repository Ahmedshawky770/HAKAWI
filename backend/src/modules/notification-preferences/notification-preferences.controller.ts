import { Controller, Get, Patch, Body, UseGuards, Request } from '@nestjs/common';
import type { AuthRequest } from '../../common/types/auth-request.interface.js';
import { NotificationPreferencesService } from './services/notification-preferences.service.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { UpdateNotificationPreferencesDto } from '../notifications/dto/notifications.dto.js';

@Controller('notification-preferences')
export class NotificationPreferencesController {
  constructor(private readonly prefsService: NotificationPreferencesService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  async findByUserId(@Request() req: AuthRequest) {
    return this.prefsService.findByUserId(req.user.sub);
  }

  @Patch()
  @UseGuards(JwtAuthGuard)
  async update(@Request() req: AuthRequest, @Body() updatePrefsDto: UpdateNotificationPreferencesDto) {
    return this.prefsService.update(req.user.sub, updatePrefsDto);
  }
}
