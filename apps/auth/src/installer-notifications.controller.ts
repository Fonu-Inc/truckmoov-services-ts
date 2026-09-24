import { Body, Controller, Get, Headers, Inject, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Portals, SignedIn } from '@shared/access';
import { InstallerNotificationsUseCases } from './contexts/installation/application/use-cases/installer-notifications.use-cases';
import { UpdateInstallerNotificationPreferencesDto } from './dto/installer-portal.dto';
import { bearer, mapped, numeric, ok } from './installation-http';

function flag(value?: string): boolean {
  return value === 'true' || value === '1';
}

/** The installer's inbox and notification toggles. */
@ApiTags('Installer portal')
@ApiBearerAuth()
@Portals('installer')
@SignedIn()
@Controller('installer')
export class InstallerNotificationsController {
  constructor(@Inject(InstallerNotificationsUseCases) private readonly notifications: InstallerNotificationsUseCases) {}

  @Get('notifications')
  @ApiOperation({ summary: 'Newest first, with the unread count; the dashboard preview uses limit=3' })
  @ApiQuery({ name: 'unread', required: false, type: Boolean })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  async list(
    @Query('unread') unread?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Headers('authorization') authorization?: string,
  ) {
    const query = { unread: flag(unread), page: numeric(page), limit: numeric(limit) };
    return ok(await mapped(() => this.notifications.list(bearer(authorization), query)));
  }

  @Post('notifications/read-all')
  @ApiOperation({ summary: 'Mark every notification read' })
  async markAllRead(@Headers('authorization') authorization?: string) {
    return ok(await mapped(() => this.notifications.markAllRead(bearer(authorization))), 'All notifications marked read');
  }

  @Post('notifications/:id/read')
  @ApiOperation({ summary: 'Mark one notification read' })
  async markRead(@Param('id') id: string, @Headers('authorization') authorization?: string) {
    return ok(await mapped(() => this.notifications.markRead(bearer(authorization), id)), 'Notification marked read');
  }

  @Get('preferences/notifications')
  @ApiOperation({ summary: 'The five notification toggles; each defaults to on' })
  async preferences(@Headers('authorization') authorization?: string) {
    return ok(await mapped(() => this.notifications.preferences(bearer(authorization))));
  }

  @Patch('preferences/notifications')
  @ApiOperation({ summary: 'Change any of the notification toggles' })
  async updatePreferences(
    @Body() body: UpdateInstallerNotificationPreferencesDto,
    @Headers('authorization') authorization?: string,
  ) {
    return ok(await mapped(() => this.notifications.updatePreferences(bearer(authorization), body)), 'Preferences updated');
  }
}
