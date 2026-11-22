import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  NotFoundException,
  Param,
  Post,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiExcludeController, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Portals, Requires } from '@shared/access';
import { ActivityLogService } from './activity-log.service';
import {
  AdminNotificationInputError,
  AdminNotificationNotFoundError,
  AdminNotificationsUseCases,
} from './admin-notifications.use-cases';
import { BaseAuthController } from './base.controller';
import { BodyOrDataPipe } from './body-or-data.pipe';
import { ForbiddenError } from './contexts/auth/session';
import { RecordAdminNotificationDto } from './dto/platform-alert-settings.dto';
import { InternalCallerService, type IncomingHeaders } from './internal-caller.service';
import { UnknownAlertTypeError } from './platform-alert-settings.use-case';

function toHttpError(error: unknown): unknown {
  if (error instanceof AdminNotificationNotFoundError || error instanceof ForbiddenError) {
    return new NotFoundException('Not found');
  }
  if (error instanceof AdminNotificationInputError || error instanceof UnknownAlertTypeError) {
    return new BadRequestException(error.message);
  }
  return error;
}

/** The admin portal's in-app alerts: platform alerts routed to the `in_app` channel. */
@ApiTags('Platform Alerts')
@ApiBearerAuth()
@Portals('admin')
@Controller('system/notifications')
export class AdminNotificationsController extends BaseAuthController {
  constructor(
    protected readonly activityLogService: ActivityLogService,
    @Inject(AdminNotificationsUseCases) private readonly useCases: AdminNotificationsUseCases,
  ) {
    super(activityLogService);
  }

  @Get()
  @Requires('admin.alerts.read')
  @ApiOperation({ summary: 'In-app alerts, newest first, with the caller\'s read state and unread count' })
  @ApiQuery({ name: 'unreadOnly', required: false, type: Boolean })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async list(
    @Query('unreadOnly') unreadOnly?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Headers('authorization') authorization?: string,
  ) {
    try {
      const data = await this.useCases.list(this.token(authorization), {
        unreadOnly: unreadOnly === 'true',
        page: page ? Number(page) || 1 : undefined,
        limit: limit ? Number(limit) || 20 : undefined,
      });
      return { status: true, message: 'success', data };
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      throw toHttpError(error);
    }
  }

  @Post('read-all')
  @Requires('admin.alerts.read')
  @ApiOperation({ summary: 'Mark every in-app alert read for the caller' })
  async readAll(@Headers('authorization') authorization?: string) {
    try {
      return { status: true, message: 'success', data: await this.useCases.markAllRead(this.token(authorization)) };
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      throw toHttpError(error);
    }
  }

  @Post(':id/read')
  @Requires('admin.alerts.read')
  @ApiOperation({ summary: 'Mark one in-app alert read for the caller' })
  async read(@Param('id') id: string, @Headers('authorization') authorization?: string) {
    try {
      return { status: true, message: 'success', data: await this.useCases.markRead(this.token(authorization), id) };
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      throw toHttpError(error);
    }
  }

  private token(authorization?: string): string {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    return accessToken;
  }
}

/** Service-to-service only: the notification service records `in_app` alerts here. */
@ApiExcludeController()
@Portals('service')
@Controller('internal/admin-notifications')
export class InternalAdminNotificationsController {
  constructor(
    @Inject(AdminNotificationsUseCases) private readonly useCases: AdminNotificationsUseCases,
    @Inject(InternalCallerService) private readonly callers: InternalCallerService,
  ) {}

  @Post()
  async record(@Body(BodyOrDataPipe) payload: RecordAdminNotificationDto, @Headers() headers: IncomingHeaders) {
    if (!(await this.callers.serviceFor(headers, ['notification']))) {
      throw new UnauthorizedException('Invalid service token');
    }
    try {
      return { status: true, message: 'success', data: await this.useCases.record(payload) };
    } catch (error) {
      throw toHttpError(error);
    }
  }
}
