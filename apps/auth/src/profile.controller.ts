import {
  ForbiddenException,
  Body,
  Controller,
  Get,
  NotFoundException,
  BadRequestException,
  Inject,
  Headers,
  Patch,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ApiUnauthorizedResponse,
  ApiOkResponse,
  ApiForbiddenResponse,
  ApiTags,
  ApiNotFoundResponse,
  ApiBearerAuth,
  ApiBadRequestResponse,
  ApiOperation,
} from '@nestjs/swagger';
import { ActivityLogService } from './activity-log.service';
import { BaseAuthController } from './base.controller';
import { BodyOrDataPipe } from './body-or-data.pipe';
import {
  GetNotificationPreferencesUseCase,
  UpdateDispatcherPreferencesUseCase,
  UpdateNotificationPreferencesUseCase,
  UpdateProfileUseCase,
  UserNotFoundError,
  ForbiddenError,
  GetProfileUseCase,
  InvalidSettingsError,
  GetDispatcherPreferencesUseCase,
} from './contexts/auth/session';
import { DispatcherPreferencesResponse, NotificationPreferencesResponse, ProfileResponse } from './dto/auth.schema';
import { UpdateDispatcherPreferencesDto } from './dto/update-dispatcher-preferences.dto';
import { UpdateNotificationPreferencesDto } from './dto/update-notification-preferences.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';

@ApiTags('Profile')
@Controller('profile')
export class ProfileController extends BaseAuthController {
  constructor(
    @Inject(GetProfileUseCase) private readonly getProfileUseCase: GetProfileUseCase,
    @Inject(UpdateProfileUseCase) private readonly updateProfileUseCase: UpdateProfileUseCase,
    @Inject(GetNotificationPreferencesUseCase) private readonly getNotificationPreferencesUseCase: GetNotificationPreferencesUseCase,
    @Inject(UpdateNotificationPreferencesUseCase) private readonly updateNotificationPreferencesUseCase: UpdateNotificationPreferencesUseCase,
    @Inject(GetDispatcherPreferencesUseCase) private readonly getDispatcherPreferencesUseCase: GetDispatcherPreferencesUseCase,
    @Inject(UpdateDispatcherPreferencesUseCase) private readonly updateDispatcherPreferencesUseCase: UpdateDispatcherPreferencesUseCase,
    @Inject(ActivityLogService) activityLogService: ActivityLogService,
  ) {
    super(activityLogService);
  }

  @Get()
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get current user profile',
    description:
      'Epic B (US-B01): view authenticated user name/contact details.',
  })
  @ApiOkResponse({ type: ProfileResponse })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiNotFoundResponse({ description: 'User not found' })
  @ApiForbiddenResponse({ description: 'Caller is not permitted' })
  async getProfile(@Headers('authorization') authorization?: string) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');

    try {
      return await this.getProfileUseCase.execute(accessToken);
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError)
        throw new ForbiddenException(error.message);
      if (error instanceof UserNotFoundError)
        throw new NotFoundException(error.message);
      throw error;
    }
  }

  /** Updates current authenticated user's name/contact details */

  @Patch()
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Update current user profile',
    description:
      'Epic B (US-B01): edit authenticated user name/contact details.',
  })
  @ApiOkResponse({ type: ProfileResponse })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiNotFoundResponse({ description: 'User not found' })
  @ApiForbiddenResponse({ description: 'Caller is not permitted' })
  async updateProfile(
    @Body(BodyOrDataPipe) payload: UpdateProfileDto,
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');

    try {
      const result = await this.updateProfileUseCase.execute({
        accessToken,
        fullName: payload.fullName,
        phoneNumber: payload.phoneNumber,
        address: payload.address,
        profilePictureUrl: payload.profilePictureUrl,
      });
      await this.tryRecordActivityFromAccessToken(accessToken, {
        service: 'auth',
        action: 'profile.updated',
        entityType: 'user',
        entityId: 'self',
        summary: 'User profile updated',
        metadata: {
          fullName: payload.fullName,
          phoneNumber: payload.phoneNumber,
          address: payload.address,
          profilePictureUrl: payload.profilePictureUrl,
        },
      });
      return result;
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError)
        throw new ForbiddenException(error.message);
      if (error instanceof UserNotFoundError)
        throw new NotFoundException(error.message);
      throw error;
    }
  }

  /** Gets current notification preferences */

  @Get('preferences/notifications')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get notification preferences',
    description:
      'Epic B (US-B02): retrieve current notification preference settings.',
  })
  @ApiOkResponse({ type: NotificationPreferencesResponse })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiNotFoundResponse({ description: 'User not found' })
  @ApiForbiddenResponse({ description: 'Caller is not permitted' })
  async getNotificationPreferences(
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');

    try {
      return await this.getNotificationPreferencesUseCase.execute(accessToken);
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError)
        throw new ForbiddenException(error.message);
      if (error instanceof UserNotFoundError)
        throw new NotFoundException(error.message);
      throw error;
    }
  }

  /** Updates current notification preferences */

  @Patch('preferences/notifications')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Update notification preferences',
    description: 'Epic B (US-B02): update alert channel preferences.',
  })
  @ApiOkResponse({ type: NotificationPreferencesResponse })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiNotFoundResponse({ description: 'User not found' })
  @ApiForbiddenResponse({ description: 'Caller is not permitted' })
  async updateNotificationPreferences(
    @Body(BodyOrDataPipe) payload: UpdateNotificationPreferencesDto,
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');

    try {
      const result = await this.updateNotificationPreferencesUseCase.execute({
        accessToken,
        smsAlerts: payload.smsAlerts,
        pushAlerts: payload.pushAlerts,
        incidentAlerts: payload.incidentAlerts,
        jobAssignment: payload.jobAssignment,
        jobCompletion: payload.jobCompletion,
        maintenanceReminders: payload.maintenanceReminders,
        fuelAlerts: payload.fuelAlerts,
        geofenceAlerts: payload.geofenceAlerts,
        emailDigest: payload.emailDigest,
      });
      await this.tryRecordActivityFromAccessToken(accessToken, {
        service: 'auth',
        action: 'preferences.notifications.updated',
        entityType: 'user',
        entityId: result.userId,
        summary: 'Notification preferences updated',
        metadata: result.notificationPreferences,
      });
      return result;
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError)
        throw new ForbiddenException(error.message);
      if (error instanceof UserNotFoundError)
        throw new NotFoundException(error.message);
      throw error;
    }
  }

  /** Gets dispatcher working-hours and timezone preferences */

  @Get('preferences/dispatch')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get dispatcher schedule and timezone preferences',
    description:
      'Epic B (US-B03): retrieve dispatcher working-hours/timezone settings.',
  })
  @ApiOkResponse({ type: DispatcherPreferencesResponse })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiNotFoundResponse({ description: 'User not found' })
  @ApiForbiddenResponse({ description: 'Caller is not a dispatcher' })
  async getDispatcherPreferences(
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');

    try {
      return await this.getDispatcherPreferencesUseCase.execute(accessToken);
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError)
        throw new ForbiddenException(error.message);
      if (error instanceof UserNotFoundError)
        throw new NotFoundException(error.message);
      throw error;
    }
  }

  /** Updates dispatcher working-hours and timezone preferences */

  @Patch('preferences/dispatch')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Update dispatcher schedule and timezone preferences',
    description:
      'Epic B (US-B03): update dispatcher working-hours/timezone settings.',
  })
  @ApiOkResponse({ type: DispatcherPreferencesResponse })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiNotFoundResponse({ description: 'User not found' })
  @ApiForbiddenResponse({ description: 'Caller is not a dispatcher' })
  @ApiBadRequestResponse({
    description: 'Invalid timezone/workday/shift format',
  })
  async updateDispatcherPreferences(
    @Body(BodyOrDataPipe) payload: UpdateDispatcherPreferencesDto,
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');

    try {
      const result = await this.updateDispatcherPreferencesUseCase.execute({
        accessToken,
        timezone: payload.timezone,
        shiftStart: payload.shiftStart,
        shiftEnd: payload.shiftEnd,
        workDays: payload.workDays,
      });
      await this.tryRecordActivityFromAccessToken(accessToken, {
        service: 'auth',
        action: 'preferences.dispatch.updated',
        entityType: 'user',
        entityId: result.userId,
        summary: 'Dispatcher preferences updated',
        metadata: {
          timezone: payload.timezone,
          shiftStart: payload.shiftStart,
          shiftEnd: payload.shiftEnd,
          workDays: payload.workDays,
        },
      });
      return result;
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError)
        throw new ForbiddenException(error.message);
      if (error instanceof UserNotFoundError)
        throw new NotFoundException(error.message);
      if (error instanceof InvalidSettingsError)
        throw new BadRequestException(error.message);
      throw error;
    }
  }

  /** Lists users (accepted + invited) for the current tenant */
}
