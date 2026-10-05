import { Controller, Get, Patch, Delete, Param, Query, UseGuards, Inject, Request, Body } from '@nestjs/common';

import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard.ts';
import { NotificationsService } from '../notifications.service.ts';
import { NotificationPreferencesDto } from '../dto/preferences.dto.ts';
import { NotificationQueryDto } from '../dto/notifications.dto.ts';

@Controller('notifications')
export class NotificationsController {
  constructor(@Inject(NotificationsService) private readonly notificationsService: NotificationsService) {}

  @UseGuards(JwtAuthGuard)
  @Get()
  async findAll(@Request() req: { user: { sub: string } }, @Query() query: NotificationQueryDto) {
    return this.notificationsService.findByUser(req.user.sub, query.page ?? 1, query.limit ?? 20);
  }

  @UseGuards(JwtAuthGuard)
  @Get('unread')
  async findUnread(@Request() req: { user: { sub: string } }, @Query() query: NotificationQueryDto) {
    // The route took no query parameters at all, and the query behind it had no `LIMIT` either, so a
    // user with thousands of unread rows fetched every one on every poll. `NotificationQueryDto.limit`
    // carries the same `@Max(100)` the list route uses; the default of 50 matches the service's.
    return this.notificationsService.findUnread(req.user.sub, query.limit ?? 50);
  }

  /**
   * The canonical unread-badge route. It used to exist twice — `GET unread/count` and
   * `GET unread-count` — which is one behaviour with two names (Principle #9) and an API surface
   * nobody can extend without doubling again.
   *
   * `unread-count` is the survivor because it is the one that is actually called:
   * `frontend/src/lib/api.ts:422`, `backend/test/notifications.integration-spec.ts` and the Postman
   * collection all use it. `unread/count` had no caller, and its RESTful appeal is not worth a second
   * name for the same row count.
   */
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

  /**
   * `PATCH` is the canonical verb here; a `PUT read-all` twin used to sit directly below it.
   *
   * Two verbs for one idempotent transition means a client cannot tell which one is the contract,
   * and every new caller has a 50% chance of picking the other one. `PATCH` survives because it is
   * the spelling `backend/test/notifications.integration-spec.ts:88` and the Postman collection
   * already use; no frontend code calls either, so there was no second opinion to weigh.
   */
  @UseGuards(JwtAuthGuard)
  @Patch('read-all')
  async markAllAsRead(@Request() req: { user: { sub: string } }) {
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
