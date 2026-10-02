import {
  ConflictException,
  Res,
  ForbiddenException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  BadRequestException,
  Post,
  Inject,
  Headers,
  StreamableFile,
  Patch,
  UnauthorizedException,
  Query,
  Delete,
  GoneException,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiUnauthorizedResponse,
  ApiOkResponse,
  ApiForbiddenResponse,
  ApiTags,
  ApiProduces,
  ApiConflictResponse,
  ApiNotFoundResponse,
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiCreatedResponse,
} from '@nestjs/swagger';
import { ActivityLogService } from './activity-log.service';
import { BaseAuthController } from './base.controller';
import { BodyOrDataPipe } from './body-or-data.pipe';
import { EmailTakenError, UserNotFoundError, ForbiddenError } from './contexts/auth/session';
import { CreateSystemTenantUseCase, TenantContactNameRequiredError, InvalidSubscriptionPlanError } from './create-system-tenant.use-case';
import { DeleteSystemTenantUseCase, SystemTenantDeleteConflictError } from './delete-system-tenant.use-case';
import {
  SystemTenantDetailResponse,
  SystemTenantOnboardingResponse,
  SystemTenantsListResponse,
  SystemTenantsSummaryResponse,
  SystemRevenueByMonthResponse,
  SystemTenantGrowthResponse,
  SystemTenantInviteActionResponse,
  SystemTenantDeleteResponse,
} from './dto/auth.schema';
import { CreateSystemTenantDto } from './dto/create-system-tenant.dto';
import { TerminateTenantDto } from './dto/terminate-tenant.dto';
import {
  GetTenantAuditLogUseCase,
  GetTenantDocumentsUseCase,
  GetTenantResourceUseCase,
  isTenantResourceTab,
  TENANT_RESOURCE_TABS,
} from './system-tenant-detail.use-cases';
import {
  TenantAlreadyTerminatedError,
  TerminateSystemTenantUseCase,
} from './terminate-system-tenant.use-case';
import { TenantTerminationError } from './tenant-termination.repository';
import { UpdateSystemTenantStatusDto } from './dto/update-system-tenant-status.dto';
import { UpdateSystemTenantDto } from './dto/update-system-tenant.dto';
import { CreateTenantExportDto } from './dto/create-tenant-export.dto';
import { ConvertTenantTrialDto, ExtendTenantTrialDto } from './dto/tenant-trial.dto';
import { UpdateTenantQuotasDto } from './dto/update-tenant-quotas.dto';
import {
  DownloadTenantExportUseCase,
  InvalidTenantExportError,
  ListTenantExportsUseCase,
  RequestTenantExportUseCase,
  TenantExportNotFoundError,
  TenantExportUnavailableError,
} from './tenant-data-export.use-cases';
import {
  ConvertTenantTrialUseCase,
  ExtendTenantTrialUseCase,
  InvalidTenantTrialError,
  TenantTrialNotFoundError,
  TenantTrialStateError,
} from './tenant-trial.use-cases';
import { InvalidTenantQuotasError, UpdateTenantQuotasUseCase } from './update-tenant-quotas.use-case';
import { ExportSystemTenantsUseCase } from './export-system-tenants.use-case';
import { GetSystemTenantUseCase, SystemTenantNotFoundError } from './get-system-tenant.use-case';
import { GetSystemTenantBillingUseCase } from './get-system-tenant-billing.use-case';
import { GetSystemRevenueByMonthUseCase } from './get-system-revenue-by-month.use-case';
import { GetSystemTenantGrowthUseCase } from './get-system-tenant-growth.use-case';
import { GetSystemTenantsSummaryUseCase } from './get-system-tenants-summary.use-case';
import { ListSystemTenantsUseCase } from './list-system-tenants.use-case';
import { SystemTenantInviteResendConflictError, ResendSystemTenantInviteUseCase } from './resend-system-tenant-invite.use-case';
import { InvalidSystemDeviceProvisioningError } from './system-device-model.errors';
import {
  SystemTenantStatusConflictError,
  SystemTenantStatusReasonRequiredError,
  UpdateSystemTenantStatusUseCase,
} from './update-system-tenant-status.use-case';
import { UpdateSystemTenantUseCase, SystemTenantUpdateConflictError } from './update-system-tenant.use-case';
import { Portals, OnResource } from '@shared/access';

@ApiTags('System Tenants')
@Portals('admin')
@OnResource('admin.tenants')
@Controller('system/tenants')
export class SystemTenantsController extends BaseAuthController {
  constructor(
    @Inject(CreateSystemTenantUseCase) private readonly createSystemTenantUseCase: CreateSystemTenantUseCase,
    @Inject(ExportSystemTenantsUseCase) private readonly exportSystemTenantsUseCase: ExportSystemTenantsUseCase,
    @Inject(GetSystemTenantsSummaryUseCase) private readonly getSystemTenantsSummaryUseCase: GetSystemTenantsSummaryUseCase,
    @Inject(GetSystemRevenueByMonthUseCase)
    private readonly getSystemRevenueByMonthUseCase: GetSystemRevenueByMonthUseCase,
    @Inject(GetSystemTenantGrowthUseCase)
    private readonly getSystemTenantGrowthUseCase: GetSystemTenantGrowthUseCase,
    @Inject(GetSystemTenantUseCase) private readonly getSystemTenantUseCase: GetSystemTenantUseCase,
    @Inject(GetSystemTenantBillingUseCase) private readonly getSystemTenantBillingUseCase: GetSystemTenantBillingUseCase,
    @Inject(ListSystemTenantsUseCase) private readonly listSystemTenantsUseCase: ListSystemTenantsUseCase,
    @Inject(ResendSystemTenantInviteUseCase) private readonly resendSystemTenantInviteUseCase: ResendSystemTenantInviteUseCase,
    @Inject(UpdateSystemTenantStatusUseCase) private readonly updateSystemTenantStatusUseCase: UpdateSystemTenantStatusUseCase,
    @Inject(UpdateSystemTenantUseCase) private readonly updateSystemTenantUseCase: UpdateSystemTenantUseCase,
    @Inject(DeleteSystemTenantUseCase) private readonly deleteSystemTenantUseCase: DeleteSystemTenantUseCase,
    @Inject(TerminateSystemTenantUseCase) private readonly terminateSystemTenantUseCase: TerminateSystemTenantUseCase,
    @Inject(GetTenantResourceUseCase) private readonly getTenantResourceUseCase: GetTenantResourceUseCase,
    @Inject(GetTenantDocumentsUseCase) private readonly getTenantDocumentsUseCase: GetTenantDocumentsUseCase,
    @Inject(GetTenantAuditLogUseCase) private readonly getTenantAuditLogUseCase: GetTenantAuditLogUseCase,
    @Inject(UpdateTenantQuotasUseCase) private readonly updateTenantQuotasUseCase: UpdateTenantQuotasUseCase,
    @Inject(ExtendTenantTrialUseCase) private readonly extendTenantTrialUseCase: ExtendTenantTrialUseCase,
    @Inject(ConvertTenantTrialUseCase) private readonly convertTenantTrialUseCase: ConvertTenantTrialUseCase,
    @Inject(RequestTenantExportUseCase) private readonly requestTenantExportUseCase: RequestTenantExportUseCase,
    @Inject(ListTenantExportsUseCase) private readonly listTenantExportsUseCase: ListTenantExportsUseCase,
    @Inject(DownloadTenantExportUseCase) private readonly downloadTenantExportUseCase: DownloadTenantExportUseCase,
    @Inject(ActivityLogService) activityLogService: ActivityLogService,
  ) {
    super(activityLogService);
  }

  @Post()
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Create tenant onboarding',
    description:
      'Allows a super admin or system admin to create a tenant onboarding record and send the bootstrap admin invite.',
  })
  @ApiCreatedResponse({ type: SystemTenantOnboardingResponse })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiForbiddenResponse({
    description: 'Caller is not permitted to create tenants',
  })
  @ApiConflictResponse({
    description: 'A pending invite or account already exists for this email',
  })
  async createSystemTenant(
    @Body(BodyOrDataPipe) payload: CreateSystemTenantDto,
    @Headers('authorization') authorization?: string,
  ): Promise<SystemTenantOnboardingResponse> {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');

    try {
      const result = await this.createSystemTenantUseCase.execute({
        accessToken,
        company: payload.company,
        subscription: payload.subscription,
        deviceProvisioning: payload.deviceProvisioning,
        simAssignment: payload.simAssignment,
        features: payload.features,
      });
      await this.tryRecordActivityFromAccessToken(accessToken, {
        service: 'auth',
        action: 'tenant.onboarding.created',
        entityType: 'tenant',
        entityId: result.data.tenantId,
        summary: 'Tenant onboarding created',
        metadata: {
          onboardingId: result.data.onboardingId,
          adminInviteEmail: result.data.adminInviteEmail,
          bootstrapRole: result.data.bootstrapRole,
          planCode: result.data.subscription.planCode,
          organizationType: result.data.company.organizationType,
        },
      });
      return result as SystemTenantOnboardingResponse;
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError)
        throw new ForbiddenException(error.message);
      if (error instanceof InvalidSubscriptionPlanError)
        throw new BadRequestException(error.message);
      if (error instanceof TenantContactNameRequiredError)
        throw new BadRequestException(error.message);
      if (error instanceof EmailTakenError)
        throw new ConflictException(error.message);
      throw error;
    }
  }

  @Get('summary')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get system tenants summary',
    description:
      'Returns tenant management summary metrics for the super admin and system admin surface.',
  })
  @ApiOkResponse({ type: SystemTenantsSummaryResponse })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiForbiddenResponse({
    description: 'Caller is not permitted to view system tenants',
  })
  async getSystemTenantsSummary(
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');

    try {
      return await this.getSystemTenantsSummaryUseCase.execute(accessToken);
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError)
        throw new ForbiddenException(error.message);
      if (error instanceof UserNotFoundError)
        throw new NotFoundException(error.message);
      throw error;
    }
  }

  @Get('revenue-by-month')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get platform cash collected per month',
    description:
      'Returns naira collected per Africa/Lagos month for the last N months (default 6, max 12), oldest first. Same sources as collectedThisMonthNgn.',
  })
  @ApiQuery({ name: 'months', required: false, type: Number })
  @ApiOkResponse({ type: SystemRevenueByMonthResponse })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiForbiddenResponse({
    description: 'Caller is not permitted to view platform revenue',
  })
  async getSystemRevenueByMonth(
    @Headers('authorization') authorization?: string,
    @Query('months') months?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');

    try {
      return await this.getSystemRevenueByMonthUseCase.execute(
        accessToken,
        months ? Number(months) : undefined,
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

  @Get('growth')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get cumulative tenant count per month',
    description: 'Returns how many tenants existed at the end of each Africa/Lagos month for the last N months (default 6, max 12), oldest first. Creation date is the onboarding date, else the earliest user.',
  })
  @ApiQuery({ name: 'months', required: false, type: Number })
  @ApiOkResponse({ type: SystemTenantGrowthResponse })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiForbiddenResponse({
    description: 'Caller is not permitted to view tenant growth',
  })
  async getSystemTenantGrowth(
    @Headers('authorization') authorization?: string,
    @Query('months') months?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');

    try {
      return await this.getSystemTenantGrowthUseCase.execute(
        accessToken,
        months ? Number(months) : undefined,
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

  @Get()
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'List system tenants',
    description:
      'Returns tenant management rows for the super admin and system admin surface.',
  })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['active', 'pending', 'suspended', 'inactive'],
  })
  @ApiQuery({
    name: 'plan',
    required: false,
    enum: ['starter', 'professional', 'enterprise'],
  })
  @ApiQuery({
    name: 'planCode',
    required: false,
    type: String,
    description: 'Exact licence plan code. The legacy plan tier filter still works and combines with this one.',
  })
  @ApiQuery({
    name: 'organizationType',
    required: false,
    enum: ['fleet_provider', 'enterprise', 'aggregator', 'owner_operator'],
  })
  @ApiQuery({
    name: 'kycStatus',
    required: false,
    enum: ['not_submitted', 'pending', 'under_review', 'verified', 'rejected'],
  })
  @ApiQuery({ name: 'revenueFrom', required: false, type: Number })
  @ApiQuery({ name: 'revenueTo', required: false, type: Number })
  @ApiQuery({ name: 'lastActiveFrom', required: false, type: String })
  @ApiQuery({ name: 'lastActiveTo', required: false, type: String })
  @ApiOkResponse({ type: SystemTenantsListResponse })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiForbiddenResponse({
    description: 'Caller is not permitted to view system tenants',
  })
  async listSystemTenants(
    @Headers('authorization') authorization?: string,
    @Query('search') search?: string,
    @Query('status') status?: 'active' | 'pending' | 'suspended' | 'inactive',
    @Query('plan') plan?: 'starter' | 'professional' | 'enterprise',
    @Query('planCode') planCode?: string,
    @Query('organizationType')
    organizationType?:
      | 'fleet_provider'
      | 'enterprise'
      | 'aggregator'
      | 'owner_operator',
    @Query('kycStatus')
    kycStatus?:
      | 'not_submitted'
      | 'pending'
      | 'under_review'
      | 'verified'
      | 'rejected',
    @Query('revenueFrom') revenueFrom?: string,
    @Query('revenueTo') revenueTo?: string,
    @Query('lastActiveFrom') lastActiveFrom?: string,
    @Query('lastActiveTo') lastActiveTo?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');

    try {
      return await this.listSystemTenantsUseCase.execute(accessToken, {
        search,
        status,
        plan,
        planCode: planCode?.trim() || undefined,
        organizationType,
        kycStatus,
        revenueFrom: this.parseNumericQuery(revenueFrom),
        revenueTo: this.parseNumericQuery(revenueTo),
        lastActiveFrom,
        lastActiveTo,
      });
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError)
        throw new ForbiddenException(error.message);
      if (error instanceof UserNotFoundError)
        throw new NotFoundException(error.message);
      throw error;
    }
  }

  @Get('export')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Export system tenants',
    description:
      'Exports tenant management rows as a CSV file using the same filters as the tenant list endpoint.',
  })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['active', 'pending', 'suspended', 'inactive'],
  })
  @ApiQuery({
    name: 'plan',
    required: false,
    enum: ['starter', 'professional', 'enterprise'],
  })
  @ApiQuery({
    name: 'planCode',
    required: false,
    type: String,
    description: 'Exact licence plan code. The legacy plan tier filter still works and combines with this one.',
  })
  @ApiQuery({
    name: 'organizationType',
    required: false,
    enum: ['fleet_provider', 'enterprise', 'aggregator', 'owner_operator'],
  })
  @ApiQuery({
    name: 'kycStatus',
    required: false,
    enum: ['not_submitted', 'pending', 'under_review', 'verified', 'rejected'],
  })
  @ApiQuery({ name: 'revenueFrom', required: false, type: Number })
  @ApiQuery({ name: 'revenueTo', required: false, type: Number })
  @ApiQuery({ name: 'lastActiveFrom', required: false, type: String })
  @ApiQuery({ name: 'lastActiveTo', required: false, type: String })
  @ApiProduces('text/csv')
  @ApiOkResponse({
    description: 'CSV export of system tenants',
    schema: { type: 'string', format: 'binary' },
  })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiForbiddenResponse({
    description: 'Caller is not permitted to export system tenants',
  })
  async exportSystemTenants(
    @Headers('authorization') authorization: string | undefined,
    @Query('search') search: string | undefined,
    @Query('status')
    status: 'active' | 'pending' | 'suspended' | 'inactive' | undefined,
    @Query('plan') plan: 'starter' | 'professional' | 'enterprise' | undefined,
    @Query('planCode') planCode: string | undefined,
    @Query('organizationType')
    organizationType:
      | 'fleet_provider'
      | 'enterprise'
      | 'aggregator'
      | 'owner_operator'
      | undefined,
    @Query('kycStatus')
    kycStatus:
      | 'not_submitted'
      | 'pending'
      | 'under_review'
      | 'verified'
      | 'rejected'
      | undefined,
    @Query('revenueFrom') revenueFrom: string | undefined,
    @Query('revenueTo') revenueTo: string | undefined,
    @Query('lastActiveFrom') lastActiveFrom: string | undefined,
    @Query('lastActiveTo') lastActiveTo: string | undefined,
    @Res({ passthrough: true })
    response: { setHeader(name: string, value: string): void },
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');

    try {
      const exported = await this.exportSystemTenantsUseCase.execute(
        accessToken,
        {
          search,
          status,
          plan,
          planCode: planCode?.trim() || undefined,
          organizationType,
          kycStatus,
          revenueFrom: this.parseNumericQuery(revenueFrom),
          revenueTo: this.parseNumericQuery(revenueTo),
          lastActiveFrom,
          lastActiveTo,
        },
      );
      response.setHeader('Content-Type', 'text/csv; charset=utf-8');
      response.setHeader(
        'Content-Disposition',
        `attachment; filename="${exported.filename}"`,
      );
      await this.tryRecordActivityFromAccessToken(accessToken, {
        service: 'auth',
        action: 'system.tenants.exported',
        entityType: 'tenant',
        entityId: 'system-tenants',
        summary: 'Exported system tenants',
        metadata: {
          filters: {
            search: search ?? null,
            status: status ?? null,
            plan: plan ?? null,
          },
          exportedRowCount: exported.csv
            ? Math.max(exported.csv.split('\n').length - 1, 0)
            : 0,
        },
      });
      return new StreamableFile(Buffer.from(exported.csv, 'utf8'));
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError)
        throw new ForbiddenException(error.message);
      if (error instanceof UserNotFoundError)
        throw new NotFoundException(error.message);
      throw error;
    }
  }

  @Get(':tenantId')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get system tenant detail',
    description:
      'Returns the detailed tenant management payload for a single tenant.',
  })
  @ApiOkResponse({ type: SystemTenantDetailResponse })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiForbiddenResponse({
    description: 'Caller is not permitted to view system tenants',
  })
  @ApiNotFoundResponse({ description: 'Tenant not found' })
  async getSystemTenant(
    @Param('tenantId') tenantId: string,
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');

    try {
      return await this.getSystemTenantUseCase.execute(accessToken, tenantId);
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError)
        throw new ForbiddenException(error.message);
      if (error instanceof SystemTenantNotFoundError)
        throw new NotFoundException(error.message);
      if (error instanceof UserNotFoundError)
        throw new NotFoundException(error.message);
      throw error;
    }
  }

  @Patch(':tenantId')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Update system tenant',
    description:
      'Allows a super admin or system admin to update tenant onboarding metadata and branding. For activated tenants, login identity fields remain immutable.',
  })
  @ApiOkResponse({ type: SystemTenantDetailResponse })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiForbiddenResponse({
    description: 'Caller is not permitted to update tenants',
  })
  @ApiNotFoundResponse({ description: 'Tenant not found' })
  @ApiConflictResponse({
    description:
      'Requested changes are incompatible with the tenant current activation state',
  })
  async updateSystemTenant(
    @Param('tenantId') tenantId: string,
    @Body(BodyOrDataPipe) payload: UpdateSystemTenantDto,
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');

    try {
      const result = await this.updateSystemTenantUseCase.execute({
        accessToken,
        tenantId,
        company: payload.company,
        subscription: payload.subscription,
        deviceProvisioning: payload.deviceProvisioning,
        simAssignment: payload.simAssignment,
        features: payload.features,
      });
      await this.tryRecordActivityFromAccessToken(accessToken, {
        service: 'auth',
        action: 'system.tenant.updated',
        entityType: 'tenant',
        entityId: tenantId,
        summary: 'Tenant updated',
        metadata: {
          updatedSections: {
            company: Boolean(payload.company),
            subscription: Boolean(payload.subscription),
            deviceProvisioning: Boolean(payload.deviceProvisioning),
            simAssignment: Boolean(payload.simAssignment),
            features: Boolean(payload.features),
          },
        },
      });
      return result;
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError)
        throw new ForbiddenException(error.message);
      if (error instanceof SystemTenantNotFoundError)
        throw new NotFoundException(error.message);
      if (error instanceof InvalidSystemDeviceProvisioningError)
        throw new BadRequestException(error.message);
      if (
        error instanceof SystemTenantUpdateConflictError ||
        error instanceof EmailTakenError
      ) {
        throw new ConflictException(error.message);
      }
      if (error instanceof UserNotFoundError)
        throw new NotFoundException(error.message);
      throw error;
    }
  }

  @Post(':tenantId/invite/resend')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Resend tenant onboarding invite',
    description:
      'Reissues the bootstrap invite for a tenant that is still pending activation.',
  })
  @ApiOkResponse({ type: SystemTenantInviteActionResponse })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiForbiddenResponse({
    description: 'Caller is not permitted to resend tenant onboarding invites',
  })
  @ApiNotFoundResponse({ description: 'Tenant not found' })
  @ApiConflictResponse({
    description:
      'Tenant does not have a resendable onboarding invite in its current state',
  })
  async resendSystemTenantInvite(
    @Param('tenantId') tenantId: string,
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');

    try {
      const result = await this.resendSystemTenantInviteUseCase.execute({
        accessToken,
        tenantId,
      });
      await this.tryRecordActivityFromAccessToken(accessToken, {
        service: 'auth',
        action: 'tenant.onboarding.invite.resent',
        entityType: 'tenant',
        entityId: tenantId,
        summary: 'Tenant onboarding invitation resent',
        metadata: {
          email: result.data.email,
          role: result.data.role,
        },
      });
      return result;
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError)
        throw new ForbiddenException(error.message);
      if (error instanceof SystemTenantNotFoundError)
        throw new NotFoundException(error.message);
      if (error instanceof SystemTenantInviteResendConflictError)
        throw new ConflictException(error.message);
      if (error instanceof UserNotFoundError)
        throw new NotFoundException(error.message);
      throw error;
    }
  }

  @Patch(':tenantId/status')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Update system tenant status',
    description:
      'Allows a super admin or system admin to suspend or reactivate a tenant by updating all tenant user accounts.',
  })
  @ApiOkResponse({ type: SystemTenantDetailResponse })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiForbiddenResponse({
    description: 'Caller is not permitted to change tenant status',
  })
  @ApiNotFoundResponse({ description: 'Tenant not found' })
  @ApiConflictResponse({
    description:
      'Tenant status cannot be changed in its current onboarding state',
  })
  async updateSystemTenantStatus(
    @Param('tenantId') tenantId: string,
    @Body(BodyOrDataPipe) payload: UpdateSystemTenantStatusDto,
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');

    try {
      const result = await this.updateSystemTenantStatusUseCase.execute({
        accessToken,
        tenantId,
        status: payload.status,
        reason: payload.reason,
      });
      await this.tryRecordActivityFromAccessToken(accessToken, {
        service: 'auth',
        action:
          payload.status === 'active'
            ? 'system.tenant.reactivated'
            : 'system.tenant.suspended',
        entityType: 'tenant',
        entityId: tenantId,
        summary:
          payload.status === 'active'
            ? 'Tenant reactivated'
            : 'Tenant suspended',
        metadata: {
          requestedStatus: payload.status,
          resultingStatus: result.data.tenant.status,
          ...(payload.reason ? { reason: payload.reason } : {}),
          ...(result.assets ? { assets: result.assets } : {}),
        },
      });
      return result;
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError)
        throw new ForbiddenException(error.message);
      if (error instanceof SystemTenantNotFoundError)
        throw new NotFoundException(error.message);
      if (error instanceof SystemTenantStatusConflictError)
        throw new ConflictException(error.message);
      if (error instanceof SystemTenantStatusReasonRequiredError)
        throw new BadRequestException(error.message);
      if (error instanceof UserNotFoundError)
        throw new NotFoundException(error.message);
      throw error;
    }
  }

  @Get(':tenantId/billing')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'A tenant billing facts',
    description:
      'Plan, licence end, open invoice, last payment, enforcement stage, wallet and cash collected this month. Anything not on record is null.',
  })
  @ApiOkResponse({ description: 'The tenant billing facts' })
  @ApiNotFoundResponse({ description: 'Tenant not found' })
  async getTenantBilling(
    @Param('tenantId') tenantId: string,
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');

    try {
      return await this.getSystemTenantBillingUseCase.execute(accessToken, tenantId);
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      if (error instanceof SystemTenantNotFoundError) throw new NotFoundException(error.message);
      if (error instanceof UserNotFoundError) throw new NotFoundException(error.message);
      throw error;
    }
  }

  @Patch(':tenantId/quotas')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Set per-tenant limits',
    description:
      'Overrides the plan limit for vehicles, drivers, devices and SIMs for one tenant. null removes an override. Enforced by fleet and SIM registration. A reason of 5 to 500 characters is required and recorded.',
  })
  @ApiOkResponse({ description: 'The plan limits, overrides and effective limits' })
  @ApiBadRequestResponse({ description: 'Invalid limit or reason' })
  @ApiForbiddenResponse({ description: 'Caller is not permitted to change tenant limits' })
  @ApiNotFoundResponse({ description: 'Tenant not found' })
  async updateTenantQuotas(
    @Param('tenantId') tenantId: string,
    @Body(BodyOrDataPipe) payload: UpdateTenantQuotasDto,
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');

    try {
      const { audit, ...result } = await this.updateTenantQuotasUseCase.execute({
        accessToken,
        tenantId,
        changes: {
          vehicles: payload.vehicles,
          drivers: payload.drivers,
          devices: payload.devices,
          sims: payload.sims,
        },
        reason: payload.reason,
      });
      await this.tryRecordActivityFromAccessToken(accessToken, {
        service: 'auth',
        action: 'system.tenant.quotas_changed',
        entityType: 'tenant',
        entityId: tenantId,
        summary: 'Tenant limits changed',
        metadata: { before: audit.before, after: audit.after, reason: audit.reason },
      });
      return result;
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      if (error instanceof SystemTenantNotFoundError) throw new NotFoundException(error.message);
      if (error instanceof InvalidTenantQuotasError) throw new BadRequestException(error.message);
      throw error;
    }
  }

  @Post(':tenantId/trial/extend')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Extend a tenant trial',
    description: 'Adds 1 to 365 days to the trial end, counted from today when the trial already ended.',
  })
  @ApiOkResponse({ description: 'The trial after the change' })
  @ApiNotFoundResponse({ description: 'Tenant or trial not found' })
  @ApiConflictResponse({ description: 'The trial was already converted' })
  async extendTenantTrial(
    @Param('tenantId') tenantId: string,
    @Body(BodyOrDataPipe) payload: ExtendTenantTrialDto,
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');

    try {
      const { audit, ...result } = await this.extendTenantTrialUseCase.execute({
        accessToken,
        tenantId,
        days: payload.days,
        reason: payload.reason,
      });
      await this.tryRecordActivityFromAccessToken(accessToken, {
        service: 'auth',
        action: 'system.tenant.trial_extended',
        entityType: 'tenant',
        entityId: tenantId,
        summary: `Trial extended by ${audit.days} days`,
        metadata: audit,
      });
      return result;
    } catch (error) {
      this.rethrowTrialError(error);
    }
  }

  @Post(':tenantId/trial/convert')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Convert a tenant trial to paid',
    description: 'Marks the trial converted and records the plan the tenant is on. Needs a plan assigned.',
  })
  @ApiOkResponse({ description: 'The trial after the change' })
  @ApiNotFoundResponse({ description: 'Tenant or trial not found' })
  @ApiConflictResponse({ description: 'Already converted, or no plan assigned' })
  async convertTenantTrial(
    @Param('tenantId') tenantId: string,
    @Body(BodyOrDataPipe) payload: ConvertTenantTrialDto,
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');

    try {
      const { audit, ...result } = await this.convertTenantTrialUseCase.execute({
        accessToken,
        tenantId,
        reason: payload?.reason,
      });
      await this.tryRecordActivityFromAccessToken(accessToken, {
        service: 'auth',
        action: 'system.tenant.trial_converted',
        entityType: 'tenant',
        entityId: tenantId,
        summary: 'Trial converted to paid',
        metadata: audit,
      });
      return result;
    } catch (error) {
      this.rethrowTrialError(error);
    }
  }

  private rethrowTrialError(error: unknown): never {
    this.rethrowInvalidAccessToken(error);
    if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
    if (error instanceof SystemTenantNotFoundError || error instanceof TenantTrialNotFoundError) {
      throw new NotFoundException(error.message);
    }
    if (error instanceof InvalidTenantTrialError) throw new BadRequestException(error.message);
    if (error instanceof TenantTrialStateError) throw new ConflictException(error.message);
    throw error;
  }

  @Post(':tenantId/exports')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Export a tenant data',
    description:
      'Builds CSV files from the tenant records and keeps them for 7 days. One scope gives one CSV, all gives one zip. The result says ready or failed.',
  })
  @ApiCreatedResponse({ description: 'The export job' })
  @ApiBadRequestResponse({ description: 'Unknown scope' })
  @ApiNotFoundResponse({ description: 'Tenant not found' })
  async requestTenantExport(
    @Param('tenantId') tenantId: string,
    @Body(BodyOrDataPipe) payload: CreateTenantExportDto,
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');

    try {
      const result = await this.requestTenantExportUseCase.execute(accessToken, tenantId, payload?.scope);
      await this.tryRecordActivityFromAccessToken(accessToken, {
        service: 'auth',
        action: 'system.tenant.export_requested',
        entityType: 'tenant',
        entityId: tenantId,
        summary: `Data export ${result.data.status}`,
        metadata: {
          exportId: result.data.id,
          scope: result.data.scope,
          status: result.data.status,
          rowCounts: result.data.rowCounts,
        },
      });
      return result;
    } catch (error) {
      this.rethrowExportError(error);
    }
  }

  @Get(':tenantId/exports')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List tenant data exports', description: 'The twenty most recent exports for the tenant.' })
  @ApiOkResponse({ description: 'The export jobs' })
  async listTenantExports(
    @Param('tenantId') tenantId: string,
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');

    try {
      return await this.listTenantExportsUseCase.execute(accessToken, tenantId);
    } catch (error) {
      this.rethrowExportError(error);
    }
  }

  @Get(':tenantId/exports/:exportId/download')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Download a tenant data export',
    description: 'Streams the file to the signed-in system admin. There is no public link.',
  })
  @ApiProduces('text/csv', 'application/zip')
  @ApiOkResponse({ description: 'The export file', schema: { type: 'string', format: 'binary' } })
  @ApiNotFoundResponse({ description: 'Export not found' })
  async downloadTenantExport(
    @Param('tenantId') tenantId: string,
    @Param('exportId') exportId: string,
    @Res({ passthrough: true }) response: { setHeader(name: string, value: string): void },
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');

    try {
      const file = await this.downloadTenantExportUseCase.execute(accessToken, tenantId, exportId);
      await this.tryRecordActivityFromAccessToken(accessToken, {
        service: 'auth',
        action: 'system.tenant.export_downloaded',
        entityType: 'tenant',
        entityId: tenantId,
        summary: 'Data export downloaded',
        metadata: { exportId, scope: file.job.scope, fileName: file.job.fileName },
      });
      response.setHeader('Content-Type', file.contentType);
      response.setHeader('Content-Disposition', `attachment; filename="${file.job.fileName}"`);
      response.setHeader('Cache-Control', 'no-store');
      return new StreamableFile(file.body);
    } catch (error) {
      this.rethrowExportError(error);
    }
  }

  private rethrowExportError(error: unknown): never {
    this.rethrowInvalidAccessToken(error);
    if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
    if (error instanceof SystemTenantNotFoundError || error instanceof TenantExportNotFoundError) {
      throw new NotFoundException(error.message);
    }
    if (error instanceof InvalidTenantExportError) throw new BadRequestException(error.message);
    if (error instanceof TenantExportUnavailableError) throw new GoneException(error.message);
    throw error;
  }

  @Get(':tenantId/resources/:tab')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'A tenant resource tab',
    description:
      'Vehicles, drivers, devices or SIMs for the tenant drawer, with the plan limit for the usage bar. Capped at 25 rows.',
  })
  @ApiOkResponse({ description: 'The resource rows and usage' })
  @ApiBadRequestResponse({ description: 'Unknown tab' })
  async getTenantResource(
    @Param('tenantId') tenantId: string,
    @Param('tab') tab: string,
    @Query('planCode') planCode?: string,
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    if (!isTenantResourceTab(tab)) {
      throw new BadRequestException(`tab must be one of: ${TENANT_RESOURCE_TABS.join(', ')}`);
    }

    try {
      return await this.getTenantResourceUseCase.execute(
        accessToken,
        tenantId,
        tab,
        planCode ?? null,
      );
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      if (error instanceof SystemTenantNotFoundError)
        throw new NotFoundException(error.message);
      throw error;
    }
  }

  @Get(':tenantId/documents')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Documents a tenant submitted at onboarding',
    description: 'The Documents tab. Read from the onboarding application the tenant was approved from.',
  })
  @ApiOkResponse({ description: 'Submitted documents' })
  async getTenantDocuments(
    @Param('tenantId') tenantId: string,
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');

    try {
      return await this.getTenantDocumentsUseCase.execute(accessToken, tenantId);
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      throw error;
    }
  }

  @Get(':tenantId/audit-log')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Recent activity for one tenant',
    description: 'The Audit Log tab. The ten most recent entries.',
  })
  @ApiOkResponse({ description: 'Recent activity' })
  async getTenantAuditLog(
    @Param('tenantId') tenantId: string,
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');

    try {
      return await this.getTenantAuditLogUseCase.execute(accessToken, tenantId);
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      throw error;
    }
  }

  @Post(':tenantId/terminate')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Terminate a tenant',
    description:
      'Permanently ends a tenant. Irreversible: there is no reinstate. Requires a reason of at least 10 characters and the literal confirmation TERMINATE.',
  })
  @ApiOkResponse({ description: 'The tenant was terminated' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiForbiddenResponse({ description: 'Caller is not permitted to terminate tenants' })
  @ApiBadRequestResponse({ description: 'Missing reason or confirmation' })
  @ApiConflictResponse({ description: 'The tenant has already been terminated' })
  async terminateSystemTenant(
    @Param('tenantId') tenantId: string,
    @Body(BodyOrDataPipe) payload: TerminateTenantDto,
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');

    try {
      return await this.terminateSystemTenantUseCase.execute({
        accessToken,
        tenantId,
        reason: payload.reason,
        confirmation: payload.confirmation,
      });
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      if (error instanceof TenantAlreadyTerminatedError) {
        throw new ConflictException(error.message);
      }
      if (error instanceof TenantTerminationError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }

  @Delete(':tenantId')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Delete system tenant',
    description:
      'Deletes a tenant shell only when no tenant user accounts or operational fleet records exist.',
  })
  @ApiOkResponse({ type: SystemTenantDeleteResponse })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiForbiddenResponse({
    description: 'Caller is not permitted to delete tenants',
  })
  @ApiNotFoundResponse({ description: 'Tenant not found' })
  @ApiConflictResponse({
    description: 'Tenant cannot be deleted while it still owns platform data',
  })
  async deleteSystemTenant(
    @Param('tenantId') tenantId: string,
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');

    try {
      const result = await this.deleteSystemTenantUseCase.execute(
        accessToken,
        tenantId,
      );
      await this.tryRecordActivityFromAccessToken(accessToken, {
        service: 'auth',
        action: 'system.tenant.deleted',
        entityType: 'tenant',
        entityId: tenantId,
        summary: 'Tenant deleted',
        metadata: {
          deleted: true,
        },
      });
      return result;
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError)
        throw new ForbiddenException(error.message);
      if (error instanceof SystemTenantNotFoundError)
        throw new NotFoundException(error.message);
      if (error instanceof SystemTenantDeleteConflictError)
        throw new ConflictException(error.message);
      if (error instanceof UserNotFoundError)
        throw new NotFoundException(error.message);
      throw error;
    }
  }

  /* ── System SIM Management ─────────────────────────── */
}
