import {
  UploadedFile,
  UseInterceptors,
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Headers,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
  Res,
  StreamableFile,
} from '@nestjs/common';
import {
  ApiBody,
  ApiBadRequestResponse,
  ApiConsumes,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiProduces,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { ObjectStorageService } from '@shared/object-storage';
import { randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import {
  ChangeRoleUseCase,
  ChangeSystemPasswordUseCase,
  CreateSystemAdminUseCase,
  ForgotPasswordUseCase,
  GetHealthUseCase,
  GetMeUseCase,
  GetNotificationPreferencesUseCase,
  GetDispatcherPreferencesUseCase,
  GetOrganizationSettingsUseCase,
  GetProfileUseCase,
  ListSystemAdminsUseCase,
  InviteUserUseCase,
  InvalidSettingsError,
  InvalidCredentialsError,
  InvalidRefreshTokenError,
  InvalidResetTokenError,
  InviteNotFoundError,
  LoginUseCase,
  LogoutUseCase,
  RefreshUseCase,
  RegisterInvitedUseCase,
  RegisterUseCase,
  RemoveOrganizationUserUseCase,
  ResendPendingInviteUseCase,
  ResetPasswordUseCase,
  ListOrganizationUsersUseCase,
  UpdateDispatcherPreferencesUseCase,
  UpdateNotificationPreferencesUseCase,
  UpdateOrganizationUserStatusUseCase,
  UpdateSystemAdminStatusUseCase,
  UpdateOrganizationUserUseCase,
  UpdateOrganizationSettingsUseCase,
  UpdateProfileUseCase,
  EmailTakenError,
  UserNotFoundError,
  ValidateInviteUseCase,
  VerifyResetUseCase,
  ForbiddenError,
  InvalidVerificationTokenError,
  InvalidAccessTokenError,
  VerifyEmailUseCase,
  CompleteProfileUseCase,
} from './contexts/auth/session';
import { LoginDto } from './dto/login.dto';
import { ChangeSystemPasswordDto } from './dto/change-system-password.dto';
import { CreateSystemAdminDto } from './dto/create-system-admin.dto';
import { CreateSystemTenantDto } from './dto/create-system-tenant.dto';
import { UpdateSystemTenantDto } from './dto/update-system-tenant.dto';
import { RefreshDto } from './dto/refresh.dto';
import { RegisterDto } from './dto/register.dto';
import { InviteUserDto } from './dto/invite-user.dto';
import { ValidateInviteDto } from './dto/validate-invite.dto';
import { RegisterInvitedDto } from './dto/register-invited.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { VerifyResetDto } from './dto/verify-reset.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { CompleteProfileDto } from './dto/complete-profile.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ChangeRoleDto } from './dto/change-role.dto';
import { LogoutDto } from './dto/logout.dto';
import {
  AuthResponse,
  SystemDashboardResponse,
  SystemTenantDetailResponse,
  SystemTenantOnboardingReferenceDataResponse,
  SystemSubscriptionPlansResponse,
  SystemTenantsListResponse,
  SystemTenantsSummaryResponse,
  SystemTenantDeleteResponse,
  DispatcherPreferencesResponse,
  HealthResponse,
  InviteActionResponse,
  MeResponse,
  NotificationPreferencesResponse,
  ActivityLogResponse,
  OrganizationUserResponse,
  OrganizationSettingsResponse,
  OrganizationUsersResponse,
  ProfileResponse,
  RemoveOrganizationUserResponse,
  SystemTenantOnboardingResponse,
  UploadedMediaResponse,
} from './dto/auth.schema';
import { ResendInviteDto } from './dto/resend-invite.dto';
import { UpdateOrganizationUserDto } from './dto/update-organization-user.dto';
import { UpdateOrganizationUserStatusDto } from './dto/update-organization-user-status.dto';
import { UpdateSystemTenantStatusDto } from './dto/update-system-tenant-status.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UpdateNotificationPreferencesDto } from './dto/update-notification-preferences.dto';
import { UpdateDispatcherPreferencesDto } from './dto/update-dispatcher-preferences.dto';
import { UpdateOrganizationSettingsDto } from './dto/update-organization-settings.dto';
import { BodyOrDataPipe } from './body-or-data.pipe';
import { ActivityLogService } from './activity-log.service';
import { CreateSystemTenantUseCase } from './create-system-tenant.use-case';
import { ExportSystemTenantsUseCase } from './export-system-tenants.use-case';
import { GetActivityLogUseCase } from './get-activity-log.use-case';
import { GetSystemDashboardUseCase } from './get-system-dashboard.use-case';
import { GetSystemSubscriptionPlansUseCase } from './get-system-subscription-plans.use-case';
import { GetSystemActivityLogUseCase } from './get-system-activity-log.use-case';
import { GetSystemTenantsSummaryUseCase } from './get-system-tenants-summary.use-case';
import {
  GetSystemTenantUseCase,
  SystemTenantNotFoundError,
} from './get-system-tenant.use-case';
import { GetSystemTenantOnboardingReferenceDataUseCase } from './get-system-tenant-onboarding-reference-data.use-case';
import { ListSystemTenantsUseCase } from './list-system-tenants.use-case';
import {
  SystemTenantStatusConflictError,
  UpdateSystemTenantStatusUseCase,
} from './update-system-tenant-status.use-case';
import {
  SystemTenantUpdateConflictError,
  UpdateSystemTenantUseCase,
} from './update-system-tenant.use-case';
import {
  DeleteSystemTenantUseCase,
  SystemTenantDeleteConflictError,
} from './delete-system-tenant.use-case';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    @Inject(LoginUseCase)
    private readonly loginUseCase: LoginUseCase,
    @Inject(ChangeSystemPasswordUseCase)
    private readonly changeSystemPasswordUseCase: ChangeSystemPasswordUseCase,
    @Inject(CreateSystemAdminUseCase)
    private readonly createSystemAdminUseCase: CreateSystemAdminUseCase,
    @Inject(CreateSystemTenantUseCase)
    private readonly createSystemTenantUseCase: CreateSystemTenantUseCase,
    @Inject(ExportSystemTenantsUseCase)
    private readonly exportSystemTenantsUseCase: ExportSystemTenantsUseCase,
    @Inject(RefreshUseCase)
    private readonly refreshUseCase: RefreshUseCase,
    @Inject(GetMeUseCase)
    private readonly getMeUseCase: GetMeUseCase,
    @Inject(RegisterUseCase)
    private readonly registerUseCase: RegisterUseCase,
    @Inject(InviteUserUseCase)
    private readonly inviteUserUseCase: InviteUserUseCase,
    @Inject(ValidateInviteUseCase)
    private readonly validateInviteUseCase: ValidateInviteUseCase,
    @Inject(RegisterInvitedUseCase)
    private readonly registerInvitedUseCase: RegisterInvitedUseCase,
    @Inject(ForgotPasswordUseCase)
    private readonly forgotPasswordUseCase: ForgotPasswordUseCase,
    @Inject(VerifyResetUseCase)
    private readonly verifyResetUseCase: VerifyResetUseCase,
    @Inject(GetHealthUseCase)
    private readonly getHealthUseCase: GetHealthUseCase,
    @Inject(ResetPasswordUseCase)
    private readonly resetPasswordUseCase: ResetPasswordUseCase,
    @Inject(ChangeRoleUseCase)
    private readonly changeRoleUseCase: ChangeRoleUseCase,
    @Inject(LogoutUseCase)
    private readonly logoutUseCase: LogoutUseCase,
    @Inject(GetProfileUseCase)
    private readonly getProfileUseCase: GetProfileUseCase,
    @Inject(ListSystemAdminsUseCase)
    private readonly listSystemAdminsUseCase: ListSystemAdminsUseCase,
    @Inject(ListOrganizationUsersUseCase)
    private readonly listOrganizationUsersUseCase: ListOrganizationUsersUseCase,
    @Inject(UpdateProfileUseCase)
    private readonly updateProfileUseCase: UpdateProfileUseCase,
    @Inject(UpdateOrganizationUserUseCase)
    private readonly updateOrganizationUserUseCase: UpdateOrganizationUserUseCase,
    @Inject(UpdateOrganizationUserStatusUseCase)
    private readonly updateOrganizationUserStatusUseCase: UpdateOrganizationUserStatusUseCase,
    @Inject(UpdateSystemAdminStatusUseCase)
    private readonly updateSystemAdminStatusUseCase: UpdateSystemAdminStatusUseCase,
    @Inject(GetNotificationPreferencesUseCase)
    private readonly getNotificationPreferencesUseCase: GetNotificationPreferencesUseCase,
    @Inject(UpdateNotificationPreferencesUseCase)
    private readonly updateNotificationPreferencesUseCase: UpdateNotificationPreferencesUseCase,
    @Inject(GetDispatcherPreferencesUseCase)
    private readonly getDispatcherPreferencesUseCase: GetDispatcherPreferencesUseCase,
    @Inject(UpdateDispatcherPreferencesUseCase)
    private readonly updateDispatcherPreferencesUseCase: UpdateDispatcherPreferencesUseCase,
    @Inject(GetOrganizationSettingsUseCase)
    private readonly getOrganizationSettingsUseCase: GetOrganizationSettingsUseCase,
    @Inject(UpdateOrganizationSettingsUseCase)
    private readonly updateOrganizationSettingsUseCase: UpdateOrganizationSettingsUseCase,
    @Inject(GetActivityLogUseCase)
    private readonly getActivityLogUseCase: GetActivityLogUseCase,
    @Inject(GetSystemDashboardUseCase)
    private readonly getSystemDashboardUseCase: GetSystemDashboardUseCase,
    @Inject(GetSystemSubscriptionPlansUseCase)
    private readonly getSystemSubscriptionPlansUseCase: GetSystemSubscriptionPlansUseCase,
    @Inject(GetSystemActivityLogUseCase)
    private readonly getSystemActivityLogUseCase: GetSystemActivityLogUseCase,
    @Inject(GetSystemTenantsSummaryUseCase)
    private readonly getSystemTenantsSummaryUseCase: GetSystemTenantsSummaryUseCase,
    @Inject(GetSystemTenantUseCase)
    private readonly getSystemTenantUseCase: GetSystemTenantUseCase,
    @Inject(GetSystemTenantOnboardingReferenceDataUseCase)
    private readonly getSystemTenantOnboardingReferenceDataUseCase: GetSystemTenantOnboardingReferenceDataUseCase,
    @Inject(ListSystemTenantsUseCase)
    private readonly listSystemTenantsUseCase: ListSystemTenantsUseCase,
    @Inject(UpdateSystemTenantStatusUseCase)
    private readonly updateSystemTenantStatusUseCase: UpdateSystemTenantStatusUseCase,
    @Inject(UpdateSystemTenantUseCase)
    private readonly updateSystemTenantUseCase: UpdateSystemTenantUseCase,
    @Inject(DeleteSystemTenantUseCase)
    private readonly deleteSystemTenantUseCase: DeleteSystemTenantUseCase,
    @Inject(ResendPendingInviteUseCase)
    private readonly resendPendingInviteUseCase: ResendPendingInviteUseCase,
    @Inject(RemoveOrganizationUserUseCase)
    private readonly removeOrganizationUserUseCase: RemoveOrganizationUserUseCase,
    @Inject(VerifyEmailUseCase)
    private readonly verifyEmailUseCase: VerifyEmailUseCase,
    @Inject(CompleteProfileUseCase)
    private readonly completeProfileUseCase: CompleteProfileUseCase,
    @Inject(ActivityLogService)
    private readonly activityLogService: ActivityLogService,
    @Inject(ObjectStorageService)
    private readonly objectStorageService: ObjectStorageService,
  ) {}

  @Get('health')
  async health(): Promise<HealthResponse> {
    try {
      const data = await this.getHealthUseCase.execute();
      return {
        status: true,
        message: 'success',
        data,
      };
    } catch {
      throw new ServiceUnavailableException('Database unavailable');
    }
  }

  @Get('test-sentry')
  @ApiOperation({
    summary: 'Trigger a test Sentry error',
    description: 'Throws an unhandled error so Sentry capture can be verified.',
  })
  testSentry(): never {
    throw new Error('Sentry test error from auth service');
  }

  @Post('media/upload')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Upload media',
    description:
      'Uploads a media file to object storage and returns a link to it.',
  })
  @ApiCreatedResponse({ type: UploadedMediaResponse })
  @ApiBadRequestResponse({ description: 'Missing upload file' })
  @UseInterceptors(FileInterceptor('file'))
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  async uploadMedia(
    @UploadedFile()
    file?: {
      originalname: string;
      mimetype: string;
      size: number;
      buffer: Buffer;
    },
  ) {
    return this.storeUploadedMedia('auth', file);
  }

  /** Register an enterprise admin (creates new tenant) */
  @Post('register')
  async register(
    @Body(BodyOrDataPipe) payload: RegisterDto,
  ): Promise<AuthResponse> {
    try {
      const result = await this.registerUseCase.execute(payload);
      await this.tryRecordActivity({
        tenantId: result.user.tenantId,
        service: 'auth',
        action: 'user.registered',
        entityType: 'user',
        entityId: result.user.id,
        summary: 'Enterprise admin account registered',
        actorId: result.user.id,
        actorRole: result.user.role,
        metadata: { email: result.user.email },
      });
      return result as unknown as AuthResponse;
    } catch (error) {
      if (error instanceof EmailTakenError)
        throw new ConflictException(error.message);
      throw error;
    }
  }

  /** Authenticate with email and password */
  @Post('login')
  async login(@Body(BodyOrDataPipe) payload: LoginDto): Promise<AuthResponse> {
    const result = await this.runAuthUseCase(() =>
      this.loginUseCase.execute(payload),
    );
    await this.tryRecordActivity({
      tenantId: result.user.tenantId,
      service: 'auth',
      action: 'user.logged_in',
      entityType: 'user',
      entityId: result.user.id,
      summary: 'User signed in',
      actorId: result.user.id,
      actorRole: result.user.role,
      metadata: { email: result.user.email },
    });
    return result as unknown as AuthResponse;
  }

  /** Authenticate a system account with email and password */
  @Post('system/login')
  async systemLogin(
    @Body(BodyOrDataPipe) payload: LoginDto,
  ): Promise<AuthResponse> {
    const result = await this.runAuthUseCase(() =>
      this.loginUseCase.executeForAudience(payload, 'system'),
    );
    await this.tryRecordActivity({
      tenantId: result.user.tenantId,
      service: 'auth',
      action:
        result.user.role === 'SUPER_ADMIN'
          ? 'superadmin.logged_in'
          : 'admin.logged_in',
      entityType: 'user',
      entityId: result.user.id,
      summary:
        result.user.role === 'SUPER_ADMIN'
          ? 'Super admin signed in'
          : 'System admin signed in',
      actorId: result.user.id,
      actorRole: result.user.role,
      metadata: { email: result.user.email },
    });
    return result as unknown as AuthResponse;
  }
  /** Exchange a refresh token for a new token pair */
  @Post('refresh')
  async refresh(
    @Body(BodyOrDataPipe) payload: RefreshDto,
  ): Promise<AuthResponse> {
    const result = await this.runAuthUseCase(() =>
      this.refreshUseCase.execute(payload.refreshToken),
    );
    await this.tryRecordActivityFromAccessToken(result.accessToken, {
      service: 'auth',
      action: 'user.session.refreshed',
      entityType: 'user',
      entityId: 'self',
      summary: 'User session refreshed',
    });
    return result as unknown as AuthResponse;
  }

  /** Change password for an authenticated system account */
  @Patch('system/change-password')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Change system account password',
    description:
      'Allows a logged-in super admin or system admin to rotate their own password.',
  })
  @ApiOkResponse({ type: AuthResponse })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiForbiddenResponse({ description: 'Caller is not a system account' })
  async changeSystemPassword(
    @Body(BodyOrDataPipe) payload: ChangeSystemPasswordDto,
    @Headers('authorization') authorization?: string,
  ): Promise<AuthResponse> {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');

    const result = await this.runAuthUseCase(() =>
      this.changeSystemPasswordUseCase.execute({
        accessToken,
        currentPassword: payload.currentPassword,
        newPassword: payload.newPassword,
      }),
    );
    await this.tryRecordActivityFromAccessToken(accessToken, {
      service: 'auth',
      action:
        result.user.role === 'SUPER_ADMIN'
          ? 'superadmin.password.changed'
          : 'admin.password.changed',
      entityType: 'user',
      entityId: result.user.id,
      summary: 'System account password changed',
      metadata: { email: result.user.email },
    });
    return result as unknown as AuthResponse;
  }

  /** Decode the bearer token and return the authenticated user's claims */
  @Get('me')
  async me(
    @Headers('authorization') authorization?: string,
  ): Promise<MeResponse> {
    try {
      return (await this.getMeUseCase.execute(
        authorization,
      )) as unknown as Promise<MeResponse>;
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) {
        throw new ForbiddenException(error.message);
      }
      if (error instanceof UserNotFoundError) {
        throw new NotFoundException(error.message);
      }
      throw error;
    }
  }

  /** Enterprise admin invites a user via email */
  @Post('invite')
  async inviteUser(
    @Body(BodyOrDataPipe) payload: InviteUserDto,
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');

    try {
      const result = await this.inviteUserUseCase.execute({
        email: payload.email,
        role: payload.role,
        accessToken,
      });
      await this.tryRecordActivityFromAccessToken(accessToken, {
        service: 'auth',
        action: 'organization.invite.sent',
        entityType: 'invite',
        entityId: payload.email,
        summary: 'Organization invite sent',
        metadata: { email: payload.email, role: payload.role },
      });
      return result;
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError)
        throw new ForbiddenException(error.message);
      throw error;
    }
  }

  /** Super admin creates a system admin account */
  @Post('system/admins')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Create system admin',
    description:
      'Allows the single super admin to create additional system admin accounts using the shared system admin endpoint surface.',
  })
  @ApiCreatedResponse({ type: OrganizationUserResponse })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiForbiddenResponse({
    description: 'Caller is not permitted to create admin accounts',
  })
  @ApiConflictResponse({
    description: 'An account with this email already exists',
  })
  async createSystemAdmin(
    @Body(BodyOrDataPipe) payload: CreateSystemAdminDto,
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');

    try {
      const result = await this.createSystemAdminUseCase.execute({
        accessToken,
        fullName: payload.fullName,
        email: payload.email,
        password: payload.password,
      });
      await this.tryRecordActivityFromAccessToken(accessToken, {
        service: 'auth',
        action: 'system.admin.created',
        entityType: 'user',
        entityId: result.user.userId,
        summary: 'System admin account created',
        metadata: { email: result.user.email },
      });
      return result;
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError)
        throw new ForbiddenException(error.message);
      if (error instanceof EmailTakenError)
        throw new ConflictException(error.message);
      throw error;
    }
  }

  /** System admin or super admin creates a tenant onboarding record and bootstrap invite */
  @Post('system/tenants')
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
      if (error instanceof EmailTakenError)
        throw new ConflictException(error.message);
      throw error;
    }
  }

  /** Super admin lists all system admin accounts */
  @Get('system/admins')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'List system admins',
    description:
      'Returns all system admin accounts through the shared system admin endpoint surface.',
  })
  @ApiOkResponse({ type: OrganizationUsersResponse })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiForbiddenResponse({
    description: 'Caller is not permitted to view admin accounts',
  })
  async listSystemAdmins(@Headers('authorization') authorization?: string) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');

    try {
      return await this.listSystemAdminsUseCase.execute(accessToken);
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError)
        throw new ForbiddenException(error.message);
      if (error instanceof UserNotFoundError)
        throw new NotFoundException(error.message);
      throw error;
    }
  }

  /** Super admin suspends or reactivates a system admin account */
  @Patch('system/admins/:userId/status')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Update system admin account status',
    description:
      'Allows the super admin to suspend or reactivate another system admin account through the shared system admin endpoint surface.',
  })
  @ApiOkResponse({ type: OrganizationUserResponse })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiForbiddenResponse({
    description: 'Caller is not permitted to change admin account status',
  })
  @ApiNotFoundResponse({ description: 'Admin account not found' })
  async updateSystemAdminStatus(
    @Param('userId') userId: string,
    @Body(BodyOrDataPipe) payload: UpdateOrganizationUserStatusDto,
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');

    try {
      const result = await this.updateSystemAdminStatusUseCase.execute({
        accessToken,
        targetUserId: userId,
        accountStatus: payload.accountStatus,
      });
      await this.tryRecordActivityFromAccessToken(accessToken, {
        service: 'auth',
        action:
          payload.accountStatus === 'disabled'
            ? 'system.admin.disabled'
            : 'system.admin.reactivated',
        entityType: 'user',
        entityId: userId,
        summary:
          payload.accountStatus === 'disabled'
            ? 'System admin account suspended'
            : 'System admin account reactivated',
        metadata: {
          email: result.user.email,
          accountStatus: payload.accountStatus,
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

  /** Resend a pending invite to a user who has not accepted yet */
  @Post('organization/invites/resend')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Resend pending invite',
    description:
      'Enterprise admin action: reissue an invite email for a still-pending tenant invite.',
  })
  @ApiCreatedResponse({ type: InviteActionResponse })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiNotFoundResponse({ description: 'Pending invite not found' })
  @ApiForbiddenResponse({
    description: 'Caller is not permitted to resend invites',
  })
  async resendInvite(
    @Body(BodyOrDataPipe) payload: ResendInviteDto,
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');

    try {
      const result = await this.resendPendingInviteUseCase.execute({
        accessToken,
        email: payload.email,
      });
      await this.tryRecordActivityFromAccessToken(accessToken, {
        service: 'auth',
        action: 'organization.invite.resent',
        entityType: 'invite',
        entityId: payload.email,
        summary: 'Pending organization invite resent',
        metadata: { email: payload.email },
      });
      return result;
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError)
        throw new ForbiddenException(error.message);
      if (error instanceof InviteNotFoundError)
        throw new NotFoundException(error.message);
      throw error;
    }
  }

  /** Validate an invite token (called when user clicks the invite link) */
  @Get('invite/validate')
  async validateInvite(@Query() query: ValidateInviteDto) {
    try {
      return await this.validateInviteUseCase.execute(query.token);
    } catch (error) {
      if (error instanceof InviteNotFoundError)
        throw new NotFoundException(error.message);
      throw error;
    }
  }

  /** Register from an invitation link */
  @Post('register/invited')
  async registerInvited(
    @Body(BodyOrDataPipe) payload: RegisterInvitedDto,
  ): Promise<AuthResponse> {
    try {
      const result = await this.registerInvitedUseCase.execute(payload);
      await this.tryRecordActivity({
        tenantId: result.user.tenantId,
        service: 'auth',
        action: 'user.registered_from_invite',
        entityType: 'user',
        entityId: result.user.id,
        summary: 'Invited user completed registration',
        actorId: result.user.id,
        actorRole: result.user.role,
        metadata: { email: result.user.email },
      });
      return result as unknown as AuthResponse;
    } catch (error) {
      if (error instanceof InviteNotFoundError)
        throw new NotFoundException(error.message);
      if (error instanceof EmailTakenError)
        throw new ConflictException(error.message);
      if (error instanceof ForbiddenError)
        throw new ForbiddenException(error.message);
      throw error;
    }
  }

  /** Request a password reset via email or SMS */
  @Post('forgot-password')
  async forgotPassword(@Body(BodyOrDataPipe) payload: ForgotPasswordDto) {
    try {
      const result = await this.forgotPasswordUseCase.execute(payload);
      await this.tryRecordActivity({
        tenantId: result.tenantId,
        service: 'auth',
        action: 'user.password_reset.requested',
        entityType: 'user',
        entityId: result.userId,
        summary: 'Password reset requested',
        metadata: { email: result.email },
      });
      return { message: result.message };
    } catch (error) {
      if (error instanceof UserNotFoundError)
        throw new NotFoundException(error.message);
      throw error;
    }
  }

  /** Verify a password reset token */
  @Post('verify-reset')
  async verifyReset(@Body(BodyOrDataPipe) payload: VerifyResetDto) {
    try {
      return await this.verifyResetUseCase.execute({ token: payload.token });
    } catch (error) {
      if (error instanceof InvalidResetTokenError)
        throw new BadRequestException(error.message);
      throw error;
    }
  }

  /** Verify new-user email token */
  @Post('verify-email')
  async verifyEmail(@Body(BodyOrDataPipe) payload: VerifyEmailDto) {
    try {
      const result = await this.verifyEmailUseCase.execute({
        token: payload.token,
      });
      await this.tryRecordActivity({
        tenantId: result.tenantId,
        service: 'auth',
        action: 'user.email.verified',
        entityType: 'user',
        entityId: result.userId,
        summary: 'User email verified',
        actorId: result.userId,
        actorRole: result.role,
        metadata: { email: result.email },
      });
      return { message: result.message };
    } catch (error) {
      if (error instanceof InvalidVerificationTokenError)
        throw new BadRequestException(error.message);
      throw error;
    }
  }

  /** Complete invited-user profile (fullName + password) */
  @Post('complete-profile')
  async completeProfile(@Body(BodyOrDataPipe) payload: CompleteProfileDto) {
    try {
      const result = await this.completeProfileUseCase.execute(payload);
      await this.tryRecordActivity({
        tenantId: result.tenantId,
        service: 'auth',
        action: 'user.profile.completed',
        entityType: 'user',
        entityId: result.userId,
        summary: 'User completed profile setup',
        actorId: result.userId,
        actorRole: result.role,
        metadata: { email: result.email },
      });
      return { message: result.message };
    } catch (error) {
      if (error instanceof InvalidVerificationTokenError)
        throw new BadRequestException(error.message);
      throw error;
    }
  }

  /** Reset password using a verified token */
  @Post('reset-password')
  async resetPassword(@Body(BodyOrDataPipe) payload: ResetPasswordDto) {
    try {
      const result = await this.resetPasswordUseCase.execute(payload);
      if (result.tenantId) {
        await this.tryRecordActivity({
          tenantId: result.tenantId,
          service: 'auth',
          action: 'user.password.reset',
          entityType: 'user',
          entityId: result.userId,
          summary: 'User password reset completed',
          actorId: result.userId,
          actorRole: result.role,
          metadata: { email: result.email },
        });
      }
      return { message: result.message };
    } catch (error) {
      if (error instanceof InvalidResetTokenError)
        throw new BadRequestException(error.message);
      throw error;
    }
  }

  /** Change a user's role (enterprise admin only) */
  @Post('change-role')
  async changeRole(
    @Body(BodyOrDataPipe) payload: ChangeRoleDto,
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');

    try {
      const result = await this.changeRoleUseCase.execute({
        targetUserId: payload.targetUserId,
        newRole: payload.newRole,
        accessToken,
      });
      await this.tryRecordActivityFromAccessToken(accessToken, {
        service: 'auth',
        action: 'organization.user.role_changed',
        entityType: 'user',
        entityId: payload.targetUserId,
        summary: 'Organization user role changed',
        metadata: { newRole: payload.newRole },
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

  /** Logout – invalidate the refresh token (and access token if possible) */
  @Post('logout')
  async logout(
    @Body(BodyOrDataPipe) payload: LogoutDto,
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    const result = await this.logoutUseCase.execute({
      refreshToken: payload.refreshToken,
      accessToken: accessToken ?? undefined,
    });
    if (accessToken) {
      await this.tryRecordActivityFromAccessToken(accessToken, {
        service: 'auth',
        action: 'user.logged_out',
        entityType: 'user',
        entityId: result.userId ?? 'self',
        summary: 'User signed out',
      });
    }
    return result;
  }

  /** Returns current authenticated user's editable profile details */
  @Get('profile')
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
  @Patch('profile')
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
        emailAlerts: payload.emailAlerts,
        smsAlerts: payload.smsAlerts,
        pushAlerts: payload.pushAlerts,
        incidentAlerts: payload.incidentAlerts,
        jobUpdates: payload.jobUpdates,
        marketingAnnouncements: payload.marketingAnnouncements,
      });
      await this.tryRecordActivityFromAccessToken(accessToken, {
        service: 'auth',
        action: 'preferences.notifications.updated',
        entityType: 'user',
        entityId: result.userId,
        summary: 'Notification preferences updated',
        metadata: {
          emailAlerts: payload.emailAlerts,
          smsAlerts: payload.smsAlerts,
          pushAlerts: payload.pushAlerts,
          incidentAlerts: payload.incidentAlerts,
          jobUpdates: payload.jobUpdates,
          marketingAnnouncements: payload.marketingAnnouncements,
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

  /** Lists accepted users for the current tenant */
  @Get('organization/users')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'List organization users',
    description:
      "Admin user management: fetch all accepted users that belong to the caller's tenant.",
  })
  @ApiOkResponse({ type: OrganizationUsersResponse })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiNotFoundResponse({ description: 'User not found' })
  @ApiForbiddenResponse({
    description: 'Caller is not permitted to read users',
  })
  async listOrganizationUsers(
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');

    try {
      return await this.listOrganizationUsersUseCase.execute(accessToken);
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError)
        throw new ForbiddenException(error.message);
      if (error instanceof UserNotFoundError)
        throw new NotFoundException(error.message);
      throw error;
    }
  }

  /** Admin-only update of another tenant user's profile details */
  @Patch('organization/users/:userId')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Update organization user profile',
    description:
      "Admin user management: update another user's profile/contact details within the current tenant.",
  })
  @ApiOkResponse({ type: OrganizationUserResponse })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiNotFoundResponse({ description: 'User not found' })
  @ApiForbiddenResponse({
    description: 'Caller is not permitted to update users',
  })
  async updateOrganizationUser(
    @Param('userId') userId: string,
    @Body(BodyOrDataPipe) payload: UpdateOrganizationUserDto,
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');

    try {
      const result = await this.updateOrganizationUserUseCase.execute({
        accessToken,
        targetUserId: userId,
        fullName: payload.fullName,
        phoneNumber: payload.phoneNumber,
        address: payload.address,
        profilePictureUrl: payload.profilePictureUrl,
      });
      await this.tryRecordActivityFromAccessToken(accessToken, {
        service: 'auth',
        action: 'organization.user.updated',
        entityType: 'user',
        entityId: userId,
        summary: 'Organization user profile updated',
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

  /** Enterprise-admin-only disabling or re-enabling of a tenant user */
  @Patch('organization/users/:userId/status')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Update organization user account status',
    description:
      'Enterprise admin action: enable or disable a user account within the current tenant. Disabling revokes active sessions immediately.',
  })
  @ApiOkResponse({ type: OrganizationUserResponse })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiNotFoundResponse({ description: 'User not found' })
  @ApiForbiddenResponse({
    description: 'Caller is not permitted to change account status',
  })
  async updateOrganizationUserStatus(
    @Param('userId') userId: string,
    @Body(BodyOrDataPipe) payload: UpdateOrganizationUserStatusDto,
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');

    try {
      const result = await this.updateOrganizationUserStatusUseCase.execute({
        accessToken,
        targetUserId: userId,
        accountStatus: payload.accountStatus,
      });
      await this.tryRecordActivityFromAccessToken(accessToken, {
        service: 'auth',
        action: 'organization.user.account_status_changed',
        entityType: 'user',
        entityId: userId,
        summary: `Organization user account ${payload.accountStatus}`,
        metadata: { accountStatus: payload.accountStatus },
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

  /** Admin-only removal of a tenant user */
  @Delete('organization/users/:userId')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Remove organization user',
    description:
      'Admin user management: remove a user from the current tenant and revoke their sessions.',
  })
  @ApiOkResponse({ type: RemoveOrganizationUserResponse })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiNotFoundResponse({ description: 'User not found' })
  @ApiForbiddenResponse({
    description: 'Caller is not permitted to remove users',
  })
  async removeOrganizationUser(
    @Param('userId') userId: string,
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');

    try {
      const result = await this.removeOrganizationUserUseCase.execute({
        accessToken,
        targetUserId: userId,
      });
      await this.tryRecordActivityFromAccessToken(accessToken, {
        service: 'auth',
        action: 'organization.user.removed',
        entityType: 'user',
        entityId: userId,
        summary: 'Organization user removed',
        metadata: { email: result.email },
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

  /** Gets organization-level settings for the caller's tenant (read-only for authenticated tenant users). */
  @Get('organization/settings')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get organization settings',
    description:
      'Epic B (US-B04): retrieve tenant-level branding/default settings for the current tenant.',
  })
  @ApiOkResponse({ type: OrganizationSettingsResponse })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiNotFoundResponse({ description: 'User not found' })
  async getOrganizationSettings(
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');

    try {
      return await this.getOrganizationSettingsUseCase.execute(accessToken);
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError)
        throw new ForbiddenException(error.message);
      if (error instanceof UserNotFoundError)
        throw new NotFoundException(error.message);
      throw error;
    }
  }

  @Get('activity-log')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get tenant activity log',
    description:
      "Returns the persisted cross-service activity log for the caller's tenant.",
  })
  @ApiQuery({ name: 'service', required: false, type: String })
  @ApiQuery({ name: 'entityType', required: false, type: String })
  @ApiQuery({ name: 'entityId', required: false, type: String })
  @ApiQuery({ name: 'action', required: false, type: String })
  @ApiQuery({ name: 'actorId', required: false, type: String })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiOkResponse({ type: ActivityLogResponse })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiForbiddenResponse({
    description: 'Caller is not permitted to view activity logs',
  })
  async getActivityLog(
    @Headers('authorization') authorization?: string,
    @Query('service') service?: string,
    @Query('entityType') entityType?: string,
    @Query('entityId') entityId?: string,
    @Query('action') action?: string,
    @Query('actorId') actorId?: string,
    @Query('limit') limit?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');

    try {
      return await this.getActivityLogUseCase.execute(accessToken, {
        service,
        entityType,
        entityId,
        action,
        actorId,
        limit: limit ? parseInt(limit, 10) : undefined,
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

  @Get('system/activity-log')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get system activity log',
    description:
      'Returns the persisted activity log for the system admin surface only.',
  })
  @ApiQuery({ name: 'service', required: false, type: String })
  @ApiQuery({ name: 'entityType', required: false, type: String })
  @ApiQuery({ name: 'entityId', required: false, type: String })
  @ApiQuery({ name: 'action', required: false, type: String })
  @ApiQuery({ name: 'actorId', required: false, type: String })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiOkResponse({ type: ActivityLogResponse })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiForbiddenResponse({
    description: 'Caller is not permitted to view system activity logs',
  })
  async getSystemActivityLog(
    @Headers('authorization') authorization?: string,
    @Query('service') service?: string,
    @Query('entityType') entityType?: string,
    @Query('entityId') entityId?: string,
    @Query('action') action?: string,
    @Query('actorId') actorId?: string,
    @Query('limit') limit?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');

    try {
      return await this.getSystemActivityLogUseCase.execute(accessToken, {
        service,
        entityType,
        entityId,
        action,
        actorId,
        limit: limit ? parseInt(limit, 10) : undefined,
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

  @Get('system/dashboard')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get system dashboard',
    description:
      'Returns system-wide dashboard metrics for super admin and system admin users.',
  })
  @ApiOkResponse({ type: SystemDashboardResponse })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiForbiddenResponse({
    description: 'Caller is not permitted to view the system dashboard',
  })
  async getSystemDashboard(@Headers('authorization') authorization?: string) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');

    try {
      return await this.getSystemDashboardUseCase.execute(accessToken);
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError)
        throw new ForbiddenException(error.message);
      if (error instanceof UserNotFoundError)
        throw new NotFoundException(error.message);
      throw error;
    }
  }

  @Get('system/subscription-plans')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get system subscription plans',
    description:
      'Returns the hardcoded subscription plan catalog used by the system admin and super admin tenant onboarding flow.',
  })
  @ApiOkResponse({ type: SystemSubscriptionPlansResponse })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiForbiddenResponse({
    description: 'Caller is not permitted to view subscription plans',
  })
  async getSystemSubscriptionPlans(
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');

    try {
      return await this.getSystemSubscriptionPlansUseCase.execute(accessToken);
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError)
        throw new ForbiddenException(error.message);
      if (error instanceof UserNotFoundError)
        throw new NotFoundException(error.message);
      throw error;
    }
  }

  @Get('system/tenants/summary')
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

  @Get('system/tenants')
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
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');

    try {
      return await this.listSystemTenantsUseCase.execute(accessToken, {
        search,
        status,
        plan,
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

  @Get('system/tenants/export')
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
    @Res({ passthrough: true })
    response: { setHeader(name: string, value: string): void },
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');

    try {
      const exported = await this.exportSystemTenantsUseCase.execute(
        accessToken,
        { search, status, plan },
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
  @Get('system/reference-data/tenant-onboarding')
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

  @Get('system/tenants/:tenantId')
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

  @Patch('system/tenants/:tenantId')
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

  @Patch('system/tenants/:tenantId/status')
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
      if (error instanceof UserNotFoundError)
        throw new NotFoundException(error.message);
      throw error;
    }
  }

  @Delete('system/tenants/:tenantId')
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

  /** Updates organization-level settings for current tenant (enterprise admin only). */
  @Patch('organization/settings')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Update organization settings',
    description:
      'Epic B (US-B04): update tenant-level branding/default settings.',
  })
  @ApiOkResponse({ type: OrganizationSettingsResponse })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiNotFoundResponse({ description: 'User not found' })
  @ApiForbiddenResponse({ description: 'Caller is not an enterprise admin' })
  @ApiBadRequestResponse({ description: 'Invalid settings payload' })
  async updateOrganizationSettings(
    @Body(BodyOrDataPipe) payload: UpdateOrganizationSettingsDto,
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');

    try {
      const result = await this.updateOrganizationSettingsUseCase.execute({
        accessToken,
        branding: payload.branding,
        defaults: payload.defaults,
      });
      await this.tryRecordActivityFromAccessToken(accessToken, {
        service: 'auth',
        action: 'organization.settings.updated',
        entityType: 'organization',
        entityId: 'settings',
        summary: 'Organization settings updated',
        metadata: {
          branding: payload.branding,
          defaults: payload.defaults,
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

  private async runAuthUseCase<T>(fn: () => Promise<T>) {
    try {
      return await fn();
    } catch (error) {
      if (
        error instanceof InvalidCredentialsError ||
        error instanceof InvalidRefreshTokenError
      ) {
        throw new UnauthorizedException(error.message);
      }
      if (error instanceof ForbiddenError) {
        throw new ForbiddenException(error.message);
      }
      throw error;
    }
  }

  private rethrowInvalidAccessToken(error: unknown): void {
    if (error instanceof InvalidAccessTokenError) {
      throw new UnauthorizedException(error.message);
    }
  }

  private extractBearerToken(header?: string): string | null {
    if (!header) return null;
    const [scheme, token] = header.split(' ');
    if (scheme?.toLowerCase() !== 'bearer' || !token) return null;
    return token;
  }

  private async tryRecordActivity(
    command: Parameters<ActivityLogService['record']>[0],
  ): Promise<void> {
    try {
      await this.activityLogService.record(command);
    } catch (error) {
      this.logger.warn(
        `activity_log_record_failed:${command.action}:${(error as Error).message}`,
      );
    }
  }

  private async tryRecordActivityFromAccessToken(
    accessToken: string,
    command: Parameters<ActivityLogService['recordFromAccessToken']>[1],
  ): Promise<void> {
    try {
      await this.activityLogService.recordFromAccessToken(accessToken, command);
    } catch (error) {
      this.logger.warn(
        `activity_log_record_failed:${command.action}:${(error as Error).message}`,
      );
    }
  }

  private async storeUploadedMedia(
    service: 'auth' | 'fleet',
    file?: {
      originalname: string;
      mimetype: string;
      size: number;
      buffer: Buffer;
    },
  ) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Missing upload file');
    }

    const extension = extname(file.originalname);
    const baseName = file.originalname.slice(
      0,
      file.originalname.length - extension.length,
    );
    const normalizedBaseName =
      baseName
        .replace(/[^a-zA-Z0-9-_]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 80) || 'file';
    const key = `${service}/media/${new Date().toISOString().slice(0, 10)}/${randomUUID()}-${normalizedBaseName}${extension.toLowerCase()}`;
    const usePublicMediaUrl = this.objectStorageService.hasPublicBaseUrl();

    try {
      await this.objectStorageService.putObject({
        key,
        body: file.buffer,
        contentType: file.mimetype,
        // Profile and organization branding images are display media, so they can
        // live in a public bucket/root when configured. Private business documents
        // such as fleet attachments still use presigned URLs elsewhere.
        visibility: usePublicMediaUrl ? 'public' : 'private',
      });

      const url =
        (usePublicMediaUrl ? this.objectStorageService.publicUrl(key) : null) ??
        (await this.objectStorageService.createPresignedDownloadUrl({ key }));

      return {
        key,
        url,
        filename: file.originalname,
        contentType: file.mimetype,
        size: file.size,
      };
    } catch {
      throw new ServiceUnavailableException('Media upload failed');
    }
  }
}
