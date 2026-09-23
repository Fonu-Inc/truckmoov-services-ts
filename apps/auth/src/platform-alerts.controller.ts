import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  Inject,
  Param,
  Patch,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ActivityLogService } from './activity-log.service';
import { BaseAuthController } from './base.controller';
import { BodyOrDataPipe } from './body-or-data.pipe';
import { ForbiddenError } from './contexts/auth/session';
import { UpdateAlertSettingDto } from './dto/platform-alert-settings.dto';
import { PLATFORM_ALERT_TYPES } from './platform-alert-settings.repository';
import {
  AlertHasNoRecipientError,
  PlatformAlertSettingsUseCase,
  UnknownAlertChannelError,
  UnknownAlertTypeError,
} from './platform-alert-settings.use-case';
import { Portals } from '@shared/access';

/**
 * One store for platform staff alerting, read and written from one place.
 *
 * The security screen and the API governance screen both configure this. They
 * are two views of these rows, not two stores: a second recipient list drifts
 * from the first, and staff end up removed from one and not the other.
 */
@ApiTags('Platform Alerts')
@Portals('admin')
@Controller('system/alert-settings')
export class PlatformAlertsController extends BaseAuthController {
  constructor(
    protected readonly activityLogService: ActivityLogService,
    @Inject(PlatformAlertSettingsUseCase)
    private readonly useCase: PlatformAlertSettingsUseCase,
  ) {
    super(activityLogService);
  }

  @Get()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Platform alert settings, one row per alert type' })
  @ApiOkResponse({ description: 'Alert settings' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiForbiddenResponse({ description: 'Caller is not a platform administrator' })
  async list(@Headers('authorization') authorization?: string) {
    const accessToken = this.requireBearerToken(authorization);

    try {
      return { status: true, message: 'success', data: await this.useCase.list(accessToken) };
    } catch (error) {
      throw this.toHttpError(error);
    }
  }

  @Patch(':alertType')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Update one alert type',
    description:
      'Enabling an alert with no recipients is refused: it would look configured and tell nobody.',
  })
  @ApiParam({ name: 'alertType', enum: [...PLATFORM_ALERT_TYPES] })
  @ApiOkResponse({ description: 'Updated setting' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiForbiddenResponse({ description: 'Caller is not a platform administrator' })
  async update(
    @Param('alertType') alertType: string,
    @Body(BodyOrDataPipe) payload: UpdateAlertSettingDto,
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.requireBearerToken(authorization);

    try {
      const data = await this.useCase.update({ accessToken, alertType, ...payload });
      await this.tryRecordActivity({
        tenantId: 'system',
        service: 'auth',
        action: 'platform.alert_settings.updated',
        entityType: 'alert_setting',
        entityId: data.alertType,
        summary: `Alert settings updated for ${data.alertType}`,
        metadata: {
          enabled: data.enabled,
          channels: data.channels,
          recipientCount: data.recipients.length,
        },
      });
      return { status: true, message: 'success', data };
    } catch (error) {
      throw this.toHttpError(error);
    }
  }

  private requireBearerToken(authorization?: string): string {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    return accessToken;
  }

  private toHttpError(error: unknown): unknown {
    if (
      error instanceof UnknownAlertTypeError ||
      error instanceof UnknownAlertChannelError ||
      error instanceof AlertHasNoRecipientError
    ) {
      return new BadRequestException(error.message);
    }
    if (error instanceof ForbiddenError) return new ForbiddenException(error.message);
    this.rethrowInvalidAccessToken(error);
    return error;
  }
}
