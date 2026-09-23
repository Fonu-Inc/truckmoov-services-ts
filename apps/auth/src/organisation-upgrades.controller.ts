import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  Inject,
  NotFoundException,
  Param,
  Post,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ActivityLogService } from './activity-log.service';
import { BaseAuthController } from './base.controller';
import { BodyOrDataPipe } from './body-or-data.pipe';
import { ForbiddenError } from './contexts/auth/session';
import { RequestUpgradeDto, ReviewUpgradeDto } from './dto/organisation-upgrade.dto';
import {
  UpgradeAlreadyDecidedError,
  UpgradeAlreadyRequestedError,
  UpgradeRequestNotFoundError,
} from './organisation-upgrade.repository';
import {
  FleetSizeUnknownError,
  NotUpgradeableError,
  RequestOrganisationUpgradeUseCase,
  ReviewOrganisationUpgradeUseCase,
  TargetPlanNotFoundError,
  TargetPlanRequiredError,
} from './organisation-upgrade.use-cases';
import { Portals, OnResource, Requires } from '@shared/access';

/**
 * An owner-operator's way out of the vehicle cap.
 *
 * The cap refuses them the vehicle that would exceed their plan. Without this
 * there is no path forward from that refusal, which makes the cap a dead end
 * rather than a limit.
 */
@ApiTags('Organisation Upgrades')
@Portals('admin')
@OnResource('admin.upgrade_review')
@Controller('organisation-upgrades')
export class OrganisationUpgradesController extends BaseAuthController {
  constructor(
    protected readonly activityLogService: ActivityLogService,
    @Inject(RequestOrganisationUpgradeUseCase)
    private readonly requestUpgrade: RequestOrganisationUpgradeUseCase,
    @Inject(ReviewOrganisationUpgradeUseCase)
    private readonly reviewUpgrade: ReviewOrganisationUpgradeUseCase,
  ) {
    super(activityLogService);
  }

  @Portals('tenant')
  @Requires('tenant.upgrades.manage')
  @Post()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Ask to be promoted to fleet provider' })
  @ApiOkResponse({ description: 'The request, awaiting review' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  async request(
    @Body(BodyOrDataPipe) payload: RequestUpgradeDto,
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.requireToken(authorization);

    try {
      const data = await this.requestUpgrade.execute(accessToken, payload.reason);
      await this.tryRecordActivity({
        tenantId: data.tenantId,
        service: 'auth',
        action: 'organisation.upgrade.requested',
        entityType: 'organisation_upgrade',
        entityId: data.id,
        summary: 'Promotion to fleet provider requested',
        metadata: { statedVehicleCount: data.statedVehicleCount },
      });
      return { status: true, message: 'success', data };
    } catch (error) {
      throw this.toHttpError(error);
    }
  }

  @Get()
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'The upgrade queue',
    description: 'Pending requests with a live vehicle count, plus recent decisions.',
  })
  @ApiOkResponse({ description: 'Pending requests and recent decisions' })
  async queue(@Headers('authorization') authorization?: string) {
    const accessToken = this.requireToken(authorization);

    try {
      return { status: true, message: 'success', data: await this.reviewUpgrade.list(accessToken) };
    } catch (error) {
      throw this.toHttpError(error);
    }
  }

  @Post(':id/approve')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Promote the organisation',
    description:
      'Changes the organisation type and every owner-operator role in it. Refused if the current fleet size cannot be read.',
  })
  @ApiOkResponse({ description: 'The decision' })
  async approve(
    @Param('id') id: string,
    @Body(BodyOrDataPipe) payload: ReviewUpgradeDto,
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.requireToken(authorization);

    try {
      const data = await this.reviewUpgrade.approve(
        accessToken,
        id,
        payload.notes ?? null,
        payload.targetPlanCode ?? null,
      );
      await this.tryRecordActivity({
        tenantId: data.tenantId,
        service: 'auth',
        action: 'organisation.upgrade.approved',
        entityType: 'organisation_upgrade',
        entityId: data.id,
        summary: 'Organisation promoted to fleet provider',
        metadata: {
          vehicleCountAtReview: data.vehicleCountAtReview,
          notes: data.reviewerNotes,
          targetPlanCode: data.targetPlanCode,
        },
      });
      return { status: true, message: 'success', data };
    } catch (error) {
      throw this.toHttpError(error);
    }
  }

  @Post(':id/reject')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Refuse the request' })
  @ApiOkResponse({ description: 'The decision' })
  async reject(
    @Param('id') id: string,
    @Body(BodyOrDataPipe) payload: ReviewUpgradeDto,
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.requireToken(authorization);

    try {
      const data = await this.reviewUpgrade.reject(accessToken, id, payload.notes ?? null);
      await this.tryRecordActivity({
        tenantId: data.tenantId,
        service: 'auth',
        action: 'organisation.upgrade.rejected',
        entityType: 'organisation_upgrade',
        entityId: data.id,
        summary: 'Promotion request refused',
        metadata: { notes: data.reviewerNotes },
      });
      return { status: true, message: 'success', data };
    } catch (error) {
      throw this.toHttpError(error);
    }
  }

  private requireToken(authorization?: string): string {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    return accessToken;
  }

  private toHttpError(error: unknown): unknown {
    if (error instanceof UpgradeAlreadyRequestedError) return new ConflictException(error.message);
    if (error instanceof UpgradeAlreadyDecidedError) return new ConflictException(error.message);
    if (error instanceof UpgradeRequestNotFoundError) return new NotFoundException(error.message);
    if (error instanceof NotUpgradeableError) return new BadRequestException(error.message);
    if (error instanceof TargetPlanRequiredError) return new BadRequestException(error.message);
    if (error instanceof TargetPlanNotFoundError) return new BadRequestException(error.message);
    // 503 rather than 500: nothing is wrong with the request, the decision
    // simply cannot be made until fleet answers.
    if (error instanceof FleetSizeUnknownError) {
      return new ServiceUnavailableException(error.message);
    }
    if (error instanceof ForbiddenError) return new ForbiddenException(error.message);
    this.rethrowInvalidAccessToken(error);
    return error;
  }
}
