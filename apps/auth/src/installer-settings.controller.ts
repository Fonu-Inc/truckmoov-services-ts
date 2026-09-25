import { Body, Controller, Get, Headers, Inject, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Portals, SignedIn } from '@shared/access';
import { ChangeInstallerPasswordUseCase } from './contexts/installation/application/use-cases/change-installer-password.use-case';
import { InstallerPreferencesUseCases } from './contexts/installation/application/use-cases/installer-preferences.use-cases';
import { ApiErrorResponse } from './dto/api-error.dto';
import {
  ChangeInstallerPasswordDto,
  UpdateInstallerDisplayPreferencesDto,
  UpdateInstallerWorkPreferencesDto,
} from './dto/installer-portal.dto';
import {
  InstallerDisplayPreferencesResponse,
  InstallerPasswordChangedResponse,
  InstallerWorkPreferencesResponse,
} from './dto/installer-settings-response.dto';
import { bearer, mapped, ok } from './installation-http';
import { InstallerErrors, InvalidInstallerBody } from './installer-openapi';

const NOTHING_TO_CHANGE = '"Nothing to change" for an empty body';

/** Settings: Account & Security password, Display Preferences and Work Preferences. */
@ApiTags('Installer portal')
@ApiBearerAuth()
@Portals('installer')
@SignedIn()
@Controller('installer')
export class InstallerSettingsController {
  constructor(
    @Inject(ChangeInstallerPasswordUseCase) private readonly password: ChangeInstallerPasswordUseCase,
    @Inject(InstallerPreferencesUseCases) private readonly preferences: InstallerPreferencesUseCases,
  ) {}

  @Post('password')
  @ApiOperation({
    summary: 'Change the password',
    description: 'As the system accounts change theirs: every session ends and a new token pair comes back.',
  })
  @ApiCreatedResponse({ description: 'The new session', type: InstallerPasswordChangedResponse })
  @InvalidInstallerBody('currentPassword and newPassword are each required, at least 8 characters (ValidationPipe array body).')
  @ApiErrorResponse(
    401,
    'Wrong current password: "Invalid credentials", as on the system accounts\' route. "Missing authorization" without a bearer token, "Invalid or expired access token" for a bad one.',
  )
  @InstallerErrors()
  async changePassword(@Body() body: ChangeInstallerPasswordDto, @Headers('authorization') authorization?: string) {
    const change = { currentPassword: body.currentPassword, newPassword: body.newPassword };
    return ok(await mapped(() => this.password.execute(bearer(authorization), change)), 'Password changed');
  }

  @Get('preferences/display')
  @ApiOperation({ summary: 'Default time zone and time range; Africa/Lagos and last_7_days until changed' })
  @ApiOkResponse({ description: 'The display preferences', type: InstallerDisplayPreferencesResponse })
  @InstallerErrors()
  async display(@Headers('authorization') authorization?: string) {
    return ok(await mapped(() => this.preferences.display(bearer(authorization))));
  }

  @Patch('preferences/display')
  @ApiOperation({ summary: 'Change the time zone, the default time range, or both' })
  @ApiOkResponse({ description: 'The display preferences', type: InstallerDisplayPreferencesResponse })
  @InvalidInstallerBody(
    `"timezone must be an IANA time zone, such as Africa/Lagos", "defaultTimeRange must be one of: <ranges>", or ${NOTHING_TO_CHANGE}.`,
  )
  @InstallerErrors()
  async updateDisplay(@Body() body: UpdateInstallerDisplayPreferencesDto, @Headers('authorization') authorization?: string) {
    return ok(await mapped(() => this.preferences.updateDisplay(bearer(authorization), body)), 'Preferences updated');
  }

  @Get('preferences/work')
  @ApiOperation({ summary: 'Availability, working hours, preferred periods and the service areas the admin set' })
  @ApiOkResponse({ description: 'The work preferences', type: InstallerWorkPreferencesResponse })
  @InstallerErrors()
  async work(@Headers('authorization') authorization?: string) {
    return ok(await mapped(() => this.preferences.work(bearer(authorization))));
  }

  @Patch('preferences/work')
  @ApiOperation({
    summary: 'Change availability, working hours or preferred periods',
    description: 'Automatic assignment skips an installer who is unavailable, off on the booked day, or whose hours miss the slot. serviceAreas is read-only.',
  })
  @ApiOkResponse({ description: 'The work preferences', type: InstallerWorkPreferencesResponse })
  @InvalidInstallerBody(
    `"availability must be one of: available, unavailable", "preferredPeriods must be one of: weekdays, weekends, all_days", "workingHours.start must be a 24-hour time (HH:MM)" (likewise end), "workingHours.start must be before workingHours.end", or ${NOTHING_TO_CHANGE}.`,
  )
  @InstallerErrors()
  async updateWork(@Body() body: UpdateInstallerWorkPreferencesDto, @Headers('authorization') authorization?: string) {
    return ok(await mapped(() => this.preferences.updateWork(bearer(authorization), body)), 'Preferences updated');
  }
}
