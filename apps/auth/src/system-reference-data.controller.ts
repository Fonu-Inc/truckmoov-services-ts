import {
  ForbiddenException,
  Controller,
  Get,
  NotFoundException,
  Inject,
  Headers,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ApiUnauthorizedResponse,
  ApiOkResponse,
  ApiForbiddenResponse,
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
} from '@nestjs/swagger';
import { ActivityLogService } from './activity-log.service';
import { BaseAuthController } from './base.controller';
import { UserNotFoundError, ForbiddenError } from './contexts/auth/session';
import { SystemDeviceCatalogReferenceDataResponse, SystemTenantOnboardingReferenceDataResponse } from './dto/auth.schema';
import { GetSystemDeviceCatalogReferenceDataUseCase } from './get-system-device-catalog-reference-data.use-case';
import { GetSystemTenantOnboardingReferenceDataUseCase } from './get-system-tenant-onboarding-reference-data.use-case';
import { Portals } from '@shared/access';

@ApiTags('System Reference Data')
@Portals('admin')
@Controller('system/reference-data')
export class SystemReferenceDataController extends BaseAuthController {
  constructor(
    @Inject(GetSystemDeviceCatalogReferenceDataUseCase) private readonly getSystemDeviceCatalogReferenceDataUseCase: GetSystemDeviceCatalogReferenceDataUseCase,
    @Inject(GetSystemTenantOnboardingReferenceDataUseCase) private readonly getSystemTenantOnboardingReferenceDataUseCase: GetSystemTenantOnboardingReferenceDataUseCase,
    @Inject(ActivityLogService) activityLogService: ActivityLogService,
  ) {
    super(activityLogService);
  }

  @Get('device-catalog')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get system device catalog reference data',
    description:
      'Returns protocol types, catalog statuses, and supported feature options for the device catalog admin flow.',
  })
  @ApiOkResponse({ type: SystemDeviceCatalogReferenceDataResponse })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiForbiddenResponse({
    description:
      'Caller is not permitted to view device catalog reference data',
  })
  async getSystemDeviceCatalogReferenceData(
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');

    try {
      return await this.getSystemDeviceCatalogReferenceDataUseCase.execute(
        accessToken,
      );
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError)
        throw new ForbiddenException(error.message);
      if (error instanceof UserNotFoundError)
        throw new NotFoundException(error.message);
      throw error;
    }
  }

  /** Super admin lists all system admin accounts */

  @Get('tenant-onboarding')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get tenant onboarding reference data',
    description:
      'Returns hardcoded onboarding reference data for the system admin and super admin flows.',
  })
  @ApiOkResponse({ type: SystemTenantOnboardingReferenceDataResponse })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiForbiddenResponse({
    description:
      'Caller is not permitted to view tenant onboarding reference data',
  })
  async getSystemTenantOnboardingReferenceData(
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');

    try {
      return await this.getSystemTenantOnboardingReferenceDataUseCase.execute(
        accessToken,
      );
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError)
        throw new ForbiddenException(error.message);
      if (error instanceof UserNotFoundError)
        throw new NotFoundException(error.message);
      throw error;
    }
  }
}
