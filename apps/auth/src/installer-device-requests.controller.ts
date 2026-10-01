import { Controller, Get, Headers, Inject, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Portals, SignedIn } from '@shared/access';
import { InstallerDeviceSetupRequestsUseCases } from './installer-device-setup-requests.use-cases';
import { InstallerDeviceSetupRequestListResponse, InstallerDeviceSetupRequestResponse } from './dto/auth.schema';
import { ApiErrorResponse } from './dto/api-error.dto';
import { bearer, mapped, ok } from './installation-http';
import { InstallerErrors } from './installer-openapi';

const REQUEST_NOT_FOUND = '"Device setup request <id> not found", for a missing request and one assigned to someone else alike';

/** Tenant device requests the platform assigned to the calling installer. */
@ApiTags('Installer portal')
@ApiBearerAuth()
@Portals('installer')
@SignedIn()
@Controller('installer/device-requests')
export class InstallerDeviceRequestsController {
  constructor(
    @Inject(InstallerDeviceSetupRequestsUseCases) private readonly requests: InstallerDeviceSetupRequestsUseCases,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Device requests assigned to the caller, oldest first' })
  @ApiOkResponse({ type: InstallerDeviceSetupRequestListResponse })
  @InstallerErrors()
  async list(@Headers('authorization') authorization?: string) {
    const token = bearer(authorization);
    return ok(await mapped(() => this.requests.list(token)));
  }

  @Post(':requestId/complete')
  @ApiOperation({ summary: 'Mark an assigned device request installed: installation_in_progress becomes completed' })
  @ApiCreatedResponse({ description: 'The request, now completed. message is "Device request completed".', type: InstallerDeviceSetupRequestResponse })
  @InstallerErrors(REQUEST_NOT_FOUND)
  @ApiErrorResponse(409, '"Only a device request being installed can be completed. This one is <status>"')
  async complete(@Param('requestId') requestId: string, @Headers('authorization') authorization?: string) {
    const token = bearer(authorization);
    return ok(await mapped(() => this.requests.complete(token, requestId)), 'Device request completed');
  }
}
