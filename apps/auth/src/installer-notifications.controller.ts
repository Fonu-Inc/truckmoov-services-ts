import { Body, Controller, Get, Headers, Inject, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Portals, SignedIn } from '@shared/access';
import { InstallerNotificationsUseCases } from './contexts/installation/application/use-cases/installer-notifications.use-cases';
import { UpdateInstallerNotificationPreferencesDto } from './dto/installer-portal.dto';
import { InstallerNotificationPreferencesResponse } from './dto/installer-settings-response.dto';
import { bearer, mapped, numeric, ok } from './installation-http';
import { InstallerErrors, InvalidInstallerBody } from './installer-openapi';

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
  @ApiOperation({ summary: 'The four type toggles and the email and in-platform channel toggles; each defaults to on' })
  @ApiOkResponse({ description: 'The notification preferences', type: InstallerNotificationPreferencesResponse })
  @InstallerErrors()
  async preferences(@Headers('authorization') authorization?: string) {
    return ok(await mapped(() => this.notifications.preferences(bearer(authorization))));
  }

  @Patch('preferences/notifications')
  @ApiOperation({
    summary: 'Change any of the notification toggles',
    description: 'A notice goes out only if its type toggle is on; then to the inbox only with inPlatformAlerts, by email only with emailAlerts. No SMS.',
  })
  @ApiOkResponse({ description: 'The notification preferences', type: InstallerNotificationPreferencesResponse })
  @InvalidInstallerBody('"<toggle> must be true or false", or "Nothing to change" for an empty body.')
  @InstallerErrors()
  async updatePreferences(
    @Body() body: UpdateInstallerNotificationPreferencesDto,
    @Headers('authorization') authorization?: string,
  ) {
    return ok(await mapped(() => this.notifications.updatePreferences(bearer(authorization), body)), 'Preferences updated');
  }
}
