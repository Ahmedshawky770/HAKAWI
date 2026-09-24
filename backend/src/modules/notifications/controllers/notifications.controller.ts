import { Controller, Get, Patch, Delete, Param, Query, UseGuards, Inject, Request, Body, Put } from '@nestjs/common';

import { Public } from '../../../common/decorators/roles.decorator.ts';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard.ts';
import { NotificationsService } from '../notifications.service.ts';
import { NotificationPreferencesDto } from '../dto/preferences.dto.ts';

@Controller('notifications')
export class NotificationsController {
  constructor(@Inject(NotificationsService) private readonly notificationsService: NotificationsService) {}

  @UseGuards(JwtAuthGuard)
  @Get()
  async findAll(@Request() req: { user: { sub: string } }, @Query('page') page?: string, @Query('limit') limit?: string) {
    return this.notificationsService.findByUser(req.user.sub, Number(page) || 1, Number(limit) || 20);
  }

  @UseGuards(JwtAuthGuard)
  @Get('unread')
  async findUnread(@Request() req: { user: { sub: string } }) {
    return this.notificationsService.findUnread(req.user.sub);
  }

  @UseGuards(JwtAuthGuard)
  @Get('unread/count')
  async countUnread(@Request() req: { user: { sub: string } }) {
    const count = await this.notificationsService.countUnread(req.user.sub);
    return { count };
  }

  @UseGuards(JwtAuthGuard)
  @Get('unread-count')
  async unreadCount(@Request() req: { user: { sub: string } }) {
    const count = await this.notificationsService.countUnread(req.user.sub);
    return { count };
  }

  @UseGuards(JwtAuthGuard)
  @Get('preferences')
  async getPreferences(@Request() req: { user: { sub: string } }) {
    return this.notificationsService.getPreferences(req.user.sub);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('preferences')
  async updatePreferences(@Request() req: { user: { sub: string } }, @Body() dto: NotificationPreferencesDto) {
    return this.notificationsService.updatePreferences(req.user.sub, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id/read')
  async markAsRead(@Param('id') id: string, @Request() req: { user: { sub: string } }) {
    return this.notificationsService.markAsRead(id, req.user.sub);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('read-all')
  async markAllAsRead(@Request() req: { user: { sub: string } }) {
    await this.notificationsService.markAllAsRead(req.user.sub);
    return { message: 'All notifications marked as read' };
  }

  @UseGuards(JwtAuthGuard)
  @Put('read-all')
  async markAllAsReadPut(@Request() req: { user: { sub: string } }) {
    await this.notificationsService.markAllAsRead(req.user.sub);
    return { message: 'All notifications marked as read' };
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  async delete(@Param('id') id: string, @Request() req: { user: { sub: string } }) {
    await this.notificationsService.delete(id, req.user.sub);
    return { message: 'Notification deleted' };
  }
}
