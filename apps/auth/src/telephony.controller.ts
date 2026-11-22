import {
  Controller,
  ForbiddenException,
  Get,
  Headers,
  Inject,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { OnResource, Portals } from '@shared/access';
import { ActivityLogService } from './activity-log.service';
import { BaseAuthController } from './base.controller';
import { ForbiddenError } from './contexts/auth/session';
import {
  ClickToCallNotConfiguredError,
  ClickToCallUnavailableError,
  GetClickToCallCredentialsUseCase,
} from './get-click-to-call-credentials.use-case';

@ApiTags('Telephony')
@Portals('tenant')
@OnResource('tenant.drivers')
@Controller('telephony')
export class TelephonyController extends BaseAuthController {
  constructor(
    protected readonly activityLogService: ActivityLogService,
    @Inject(GetClickToCallCredentialsUseCase)
    private readonly getClickToCallCredentials: GetClickToCallCredentialsUseCase,
  ) {
    super(activityLogService);
  }

  @Get('click-to-call-credentials')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Click-to-call SIP settings for the browser dialer',
    description: 'The Fonu clickToCall block (extension, domain, wss_url, destination, origin, originUuid). The Fonu API key never leaves the server.',
  })
  @ApiOkResponse({ description: 'clickToCall settings' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiServiceUnavailableResponse({ description: 'Click-to-call not configured, or Fonu unreachable' })
  async clickToCallCredentials(@Headers('authorization') authorization?: string) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');

    try {
      return { status: true, message: 'success', data: await this.getClickToCallCredentials.execute(accessToken) };
    } catch (error) {
      if (error instanceof ClickToCallNotConfiguredError || error instanceof ClickToCallUnavailableError) {
        throw new ServiceUnavailableException(error.message);
      }
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      this.rethrowInvalidAccessToken(error);
      throw error;
    }
  }
}
