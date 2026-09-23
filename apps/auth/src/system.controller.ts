import {
  ConflictException,
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
  Patch,
  UnauthorizedException,
  Query,
  UseGuards,
  Delete,
} from '@nestjs/common';
import {
  ApiUnauthorizedResponse,
  ApiOkResponse,
  ApiForbiddenResponse,
  ApiTags,
  ApiConflictResponse,
  ApiNotFoundResponse,
  ApiBearerAuth,
  ApiBadRequestResponse,
  ApiOperation,
  ApiQuery,
  ApiCreatedResponse,
} from '@nestjs/swagger';
import { ActivityLogService } from './activity-log.service';
import { BaseAuthController } from './base.controller';
import { BodyOrDataPipe } from './body-or-data.pipe';
import { CancelSystemAdminInviteUseCase } from './cancel-system-admin-invite.use-case';
import {
  UpdateSystemAdminStatusUseCase,
  EmailTakenError,
  DeleteSystemAdminUseCase,
  ListSystemAdminsUseCase,
  LoginUseCase,
  ChangeSystemPasswordUseCase,
  UserNotFoundError,
  ForbiddenError,
  InvalidSettingsError,
  InviteNotFoundError,
  CreateSystemAdminUseCase,
} from './contexts/auth/session';
import { CreateSystemAdminInviteUseCase } from './create-system-admin-invite.use-case';
import {
  SystemFeatureFlagResponse,
  OrganizationUserResponse,
  AuthResponse,
  SystemFeatureFlagsResponse,
  OrganizationUsersResponse,
  SystemSubscriptionPlansResponse,
  SystemDashboardResponse,
  SystemAdminInvitesResponse,
  RemoveOrganizationUserResponse,
  SystemAdminInviteCancelResponse,
  SystemHealthResponse,
  SystemSettingsResponse,
  SystemAdminInviteResponse,
  ActivityLogResponse,
} from './dto/auth.schema';
import { ChangeSystemPasswordDto } from './dto/change-system-password.dto';
import { CreateSystemAdminInviteDto } from './dto/create-system-admin-invite.dto';
import { CreateSystemAdminDto } from './dto/create-system-admin.dto';
import { LoginDto } from './dto/login.dto';
import { UpdateOrganizationUserStatusDto } from './dto/update-organization-user-status.dto';
import { UpdateSystemFeatureFlagDto } from './dto/update-system-feature-flag.dto';
import { UpdateSystemSettingsDto } from './dto/update-system-settings.dto';
import { GetSystemActivityLogUseCase } from './get-system-activity-log.use-case';
import { GetSystemDashboardUseCase } from './get-system-dashboard.use-case';
import { GetSystemHealthUseCase } from './get-system-health.use-case';
import { GetSystemSettingsUseCase } from './get-system-settings.use-case';
import { GetSystemSubscriptionPlansUseCase } from './get-system-subscription-plans.use-case';
import { Portals } from '@shared/access';
import {
  UpdateSubscriptionPlanPriceUseCase,
  SubscriptionPlanNotFoundError,
  InvalidSubscriptionPlanPriceError,
} from './update-subscription-plan-price.use-case';
import { UpdateSubscriptionPlanPriceDto } from './dto/subscription-plan.dto';
import { UpdatePlanEntitlementsDto } from './dto/update-plan-entitlements.dto';
import {
  InvalidPlanEntitlementsError,
  PlanEntitlementsNotFoundError,
  UpdatePlanEntitlementsUseCase,
} from './update-plan-entitlements.use-case';
import { ListSystemAdminInvitesUseCase } from './list-system-admin-invites.use-case';
import { ListMisplacedSystemAccountsUseCase } from './list-misplaced-system-accounts.use-case';
import { ListSystemFeatureFlagsUseCase } from './list-system-feature-flags.use-case';
import { LoginRateLimitGuard } from './login-rate-limit.guard';
import { ResendSystemAdminInviteUseCase } from './resend-system-admin-invite.use-case';
import { InvalidSystemDeviceProvisioningError } from './system-device-model.errors';
import { SystemFeatureFlagNotFoundError, UpdateSystemFeatureFlagUseCase } from './update-system-feature-flag.use-case';
import { UpdateSystemSettingsUseCase } from './update-system-settings.use-case';
import { UnsupportedPlatformCurrencyError } from './platform-currency.errors';

@ApiTags('System')
@Portals('admin')
@Controller('system')
export class SystemController extends BaseAuthController {
  constructor(
    @Inject(LoginUseCase) private readonly loginUseCase: LoginUseCase,
    @Inject(ChangeSystemPasswordUseCase) private readonly changeSystemPasswordUseCase: ChangeSystemPasswordUseCase,
    @Inject(CreateSystemAdminUseCase) private readonly createSystemAdminUseCase: CreateSystemAdminUseCase,
    @Inject(CreateSystemAdminInviteUseCase) private readonly createSystemAdminInviteUseCase: CreateSystemAdminInviteUseCase,
    @Inject(CancelSystemAdminInviteUseCase) private readonly cancelSystemAdminInviteUseCase: CancelSystemAdminInviteUseCase,
    @Inject(ListSystemAdminsUseCase) private readonly listSystemAdminsUseCase: ListSystemAdminsUseCase,
    @Inject(UpdateSystemAdminStatusUseCase) private readonly updateSystemAdminStatusUseCase: UpdateSystemAdminStatusUseCase,
    @Inject(DeleteSystemAdminUseCase) private readonly deleteSystemAdminUseCase: DeleteSystemAdminUseCase,
    @Inject(GetSystemSettingsUseCase) private readonly getSystemSettingsUseCase: GetSystemSettingsUseCase,
    @Inject(GetSystemDashboardUseCase) private readonly getSystemDashboardUseCase: GetSystemDashboardUseCase,
    @Inject(GetSystemSubscriptionPlansUseCase) private readonly getSystemSubscriptionPlansUseCase: GetSystemSubscriptionPlansUseCase,
    @Inject(UpdateSubscriptionPlanPriceUseCase) private readonly updateSubscriptionPlanPriceUseCase: UpdateSubscriptionPlanPriceUseCase,
    @Inject(UpdatePlanEntitlementsUseCase) private readonly updatePlanEntitlementsUseCase: UpdatePlanEntitlementsUseCase,
    @Inject(GetSystemActivityLogUseCase) private readonly getSystemActivityLogUseCase: GetSystemActivityLogUseCase,
    @Inject(ListSystemAdminInvitesUseCase) private readonly listSystemAdminInvitesUseCase: ListSystemAdminInvitesUseCase,
    @Inject(ListMisplacedSystemAccountsUseCase) private readonly listMisplacedSystemAccountsUseCase: ListMisplacedSystemAccountsUseCase,
    @Inject(ListSystemFeatureFlagsUseCase) private readonly listSystemFeatureFlagsUseCase: ListSystemFeatureFlagsUseCase,
    @Inject(ResendSystemAdminInviteUseCase) private readonly resendSystemAdminInviteUseCase: ResendSystemAdminInviteUseCase,
    @Inject(UpdateSystemFeatureFlagUseCase) private readonly updateSystemFeatureFlagUseCase: UpdateSystemFeatureFlagUseCase,
    @Inject(UpdateSystemSettingsUseCase) private readonly updateSystemSettingsUseCase: UpdateSystemSettingsUseCase,
    @Inject(ActivityLogService) activityLogService: ActivityLogService,
    @Inject(GetSystemHealthUseCase) private readonly getSystemHealthUseCase: GetSystemHealthUseCase,
  ) {
    super(activityLogService);
  }

  @Get('health')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get system-wide service health status' })
  @ApiOkResponse({ type: SystemHealthResponse })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiForbiddenResponse({ description: 'Not a system actor' })
  async getSystemHealth(@Headers('authorization') authorization?: string) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      return await this.getSystemHealthUseCase.execute(accessToken);
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      throw error;
    }
  }

  @Portals('public')
  @Post('login')
  @UseGuards(LoginRateLimitGuard)
  @ApiOkResponse({ type: AuthResponse })
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

  @Patch('change-password')
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

  @Get('settings')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get system settings',
    description:
      'Returns global platform settings for the system admin surface.',
  })
  @ApiOkResponse({ type: SystemSettingsResponse })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiForbiddenResponse({
    description: 'Caller is not permitted to view system settings',
  })
  async getSystemSettings(@Headers('authorization') authorization?: string) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');

    try {
      return await this.getSystemSettingsUseCase.execute(accessToken);
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError)
        throw new ForbiddenException(error.message);
      if (error instanceof UserNotFoundError)
        throw new NotFoundException(error.message);
      throw error;
    }
  }

  @Patch('settings')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Update system settings',
    description:
      'Updates the global platform settings used by the system admin surface.',
  })
  @ApiOkResponse({ type: SystemSettingsResponse })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiForbiddenResponse({
    description: 'Caller is not permitted to update system settings',
  })
  @ApiBadRequestResponse({ description: 'Invalid system settings payload' })
  async updateSystemSettings(
    @Body(BodyOrDataPipe) payload: UpdateSystemSettingsDto,
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');

    try {
      const result = await this.updateSystemSettingsUseCase.execute({
        accessToken,
        platformName: payload.platformName,
        supportEmail: payload.supportEmail,
        defaults: payload.defaults,
        features: payload.features,
        retention: payload.retention,
        security: payload.security,
      });
      await this.tryRecordActivityFromAccessToken(accessToken, {
        service: 'auth',
        action: 'system.settings.updated',
        entityType: 'system_settings',
        entityId: 'system',
        summary: 'System settings updated',
        metadata: {
          updatedSections: {
            platformName: payload.platformName !== undefined,
            supportEmail: payload.supportEmail !== undefined,
            defaults: Boolean(payload.defaults),
            features: Boolean(payload.features),
            retention: Boolean(payload.retention),
            security: Boolean(payload.security),
          },
        },
      });
      return result;
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError)
        throw new ForbiddenException(error.message);
      if (
        error instanceof InvalidSettingsError ||
        error instanceof UnsupportedPlatformCurrencyError
      )
        throw new BadRequestException(error.message);
      if (error instanceof UserNotFoundError)
        throw new NotFoundException(error.message);
      throw error;
    }
  }

  /** Decode the bearer token and return the authenticated user's claims */

  @Post('admins')
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
      if (error instanceof InvalidSystemDeviceProvisioningError)
        throw new BadRequestException(error.message);
      if (error instanceof EmailTakenError)
        throw new ConflictException(error.message);
      throw error;
    }
  }

  /** System admin or super admin creates a tenant onboarding record and bootstrap invite */

  @Get('admins')
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

  @Patch('admins/:userId/status')
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

  /** Super admin permanently deletes a system admin account */

  @Delete('admins/:userId')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Delete system admin',
    description:
      'Allows the super admin to permanently delete another system admin account through the shared system admin endpoint surface.',
  })
  @ApiOkResponse({ type: RemoveOrganizationUserResponse })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiForbiddenResponse({
    description: 'Caller is not permitted to delete admin accounts',
  })
  @ApiNotFoundResponse({ description: 'Admin account not found' })
  async deleteSystemAdmin(
    @Param('userId') userId: string,
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');

    try {
      const result = await this.deleteSystemAdminUseCase.execute({
        accessToken,
        targetUserId: userId,
      });
      await this.tryRecordActivityFromAccessToken(accessToken, {
        service: 'auth',
        action: 'system.admin.deleted',
        entityType: 'user',
        entityId: userId,
        summary: 'System admin account deleted',
        metadata: {
          email: result.email,
          deleted: true,
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

  @Get('admin-invites')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'List system admin invites',
    description:
      'Returns active pending system admin invites for the super admin surface.',
  })
  @ApiOkResponse({ type: SystemAdminInvitesResponse })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiForbiddenResponse({
    description: 'Caller is not permitted to view system admin invites',
  })
  async listSystemAdminInvites(
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');

    try {
      return await this.listSystemAdminInvitesUseCase.execute(accessToken);
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError)
        throw new ForbiddenException(error.message);
      if (error instanceof UserNotFoundError)
        throw new NotFoundException(error.message);
      throw error;
    }
  }

  @Get('misplaced-system-accounts')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'List system-role accounts outside the system tenant',
    description:
      'Accounts holding a system role inside a customer tenant, for governance review. Nothing is changed.',
  })
  @ApiOkResponse({ description: 'Accounts returned' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiForbiddenResponse({ description: 'Caller is not a system admin' })
  async listMisplacedSystemAccounts(
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');

    try {
      return await this.listMisplacedSystemAccountsUseCase.execute(accessToken);
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError)
        throw new ForbiddenException(error.message);
      if (error instanceof UserNotFoundError)
        throw new NotFoundException(error.message);
      throw error;
    }
  }

  @Post('admin-invites')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Create system admin invite',
    description:
      'Creates and sends a pending invite for a new system admin account.',
  })
  @ApiCreatedResponse({ type: SystemAdminInviteResponse })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiForbiddenResponse({
    description: 'Caller is not permitted to invite system admins',
  })
  @ApiConflictResponse({
    description: 'An account or pending invite with this email already exists',
  })
  async createSystemAdminInvite(
    @Body(BodyOrDataPipe) payload: CreateSystemAdminInviteDto,
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');

    try {
      const result = await this.createSystemAdminInviteUseCase.execute({
        accessToken,
        email: payload.email,
      });
      await this.tryRecordActivityFromAccessToken(accessToken, {
        service: 'auth',
        action: 'system.admin.invited',
        entityType: 'invite',
        entityId: result.data.id,
        summary: 'System admin invitation sent',
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
      if (error instanceof EmailTakenError)
        throw new ConflictException(error.message);
      if (error instanceof UserNotFoundError)
        throw new NotFoundException(error.message);
      throw error;
    }
  }

  @Post('admin-invites/:inviteId/resend')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Resend system admin invite',
    description:
      'Resends a pending system admin invite and rotates the invite token.',
  })
  @ApiOkResponse({ type: SystemAdminInviteResponse })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiForbiddenResponse({
    description: 'Caller is not permitted to resend system admin invites',
  })
  @ApiNotFoundResponse({ description: 'System admin invite not found' })
  async resendSystemAdminInvite(
    @Param('inviteId') inviteId: string,
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');

    try {
      const result = await this.resendSystemAdminInviteUseCase.execute({
        accessToken,
        inviteId,
      });
      await this.tryRecordActivityFromAccessToken(accessToken, {
        service: 'auth',
        action: 'system.admin.invite.resent',
        entityType: 'invite',
        entityId: inviteId,
        summary: 'System admin invitation resent',
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
      if (error instanceof InviteNotFoundError)
        throw new NotFoundException(error.message);
      if (error instanceof UserNotFoundError)
        throw new NotFoundException(error.message);
      throw error;
    }
  }

  @Delete('admin-invites/:inviteId')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Cancel system admin invite',
    description:
      'Cancels a pending system admin invite so the recipient can no longer join using that link.',
  })
  @ApiOkResponse({ type: SystemAdminInviteCancelResponse })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiForbiddenResponse({
    description: 'Caller is not permitted to cancel system admin invites',
  })
  @ApiNotFoundResponse({ description: 'System admin invite not found' })
  async cancelSystemAdminInvite(
    @Param('inviteId') inviteId: string,
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');

    try {
      const result = await this.cancelSystemAdminInviteUseCase.execute(
        accessToken,
        inviteId,
      );
      await this.tryRecordActivityFromAccessToken(accessToken, {
        service: 'auth',
        action: 'system.admin.invite.cancelled',
        entityType: 'invite',
        entityId: inviteId,
        summary: 'System admin invitation cancelled',
        metadata: {
          email: result.data.email,
        },
      });
      return result;
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError)
        throw new ForbiddenException(error.message);
      if (error instanceof InviteNotFoundError)
        throw new NotFoundException(error.message);
      if (error instanceof UserNotFoundError)
        throw new NotFoundException(error.message);
      throw error;
    }
  }

  /** Resend a pending invite to a user who has not accepted yet */

  @Get('activity-log')
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

  @Get('dashboard')
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

  @Get('subscription-plans')
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

  @Patch('subscription-plans/:id')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Update a subscription plan\'s price',
    description:
      'Changes the plan\'s listed monthly and/or yearly-equivalent NGN price. Applies immediately to every subscriber — nothing on the platform yet locks in the price an existing subscriber was sold at.',
  })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiForbiddenResponse({ description: 'Caller is not permitted to change subscription plan pricing' })
  @ApiNotFoundResponse({ description: 'Plan not found' })
  async updateSubscriptionPlanPrice(
    @Param('id') id: string,
    @Body(BodyOrDataPipe) payload: UpdateSubscriptionPlanPriceDto,
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');

    try {
      const data = await this.updateSubscriptionPlanPriceUseCase.execute({
        accessToken,
        planId: id,
        monthlyPriceNgn: payload.monthlyPriceNgn,
        yearlyMonthlyEquivalentNgn: payload.yearlyMonthlyEquivalentNgn,
      });
      return { status: true, message: 'success', data };
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      if (error instanceof SubscriptionPlanNotFoundError) throw new NotFoundException(error.message);
      if (error instanceof InvalidSubscriptionPlanPriceError) throw new BadRequestException(error.message);
      throw error;
    }
  }

  @Patch('subscription-plans/:id/entitlements')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update a subscription plan entitlements policy' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiForbiddenResponse({ description: 'Caller is not permitted to change plan entitlements' })
  @ApiBadRequestResponse({ description: 'Invalid quota, feature, allowance, or policy value' })
  @ApiNotFoundResponse({ description: 'Plan or plan entitlements not found' })
  async updateSubscriptionPlanEntitlements(
    @Param('id') id: string,
    @Body(BodyOrDataPipe) payload: UpdatePlanEntitlementsDto,
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');

    try {
      const data = await this.updatePlanEntitlementsUseCase.execute({
        accessToken,
        planId: id,
        patch: payload,
      });
      return { status: true, message: 'success', data };
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      if (error instanceof PlanEntitlementsNotFoundError) throw new NotFoundException(error.message);
      if (error instanceof InvalidPlanEntitlementsError) throw new BadRequestException(error.message);
      throw error;
    }
  }

  @Get('feature-flags')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'List system feature flags',
    description:
      'Returns platform-scoped feature flags for the system admin surface.',
  })
  @ApiOkResponse({ type: SystemFeatureFlagsResponse })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiForbiddenResponse({
    description: 'Caller is not permitted to view system feature flags',
  })
  async listSystemFeatureFlags(
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');

    try {
      return await this.listSystemFeatureFlagsUseCase.execute(accessToken);
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError)
        throw new ForbiddenException(error.message);
      if (error instanceof UserNotFoundError)
        throw new NotFoundException(error.message);
      throw error;
    }
  }

  @Patch('feature-flags/:featureKey')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Update system feature flag',
    description:
      'Updates a platform-scoped feature flag for the system admin surface.',
  })
  @ApiOkResponse({ type: SystemFeatureFlagResponse })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiForbiddenResponse({
    description: 'Caller is not permitted to update system feature flags',
  })
  @ApiNotFoundResponse({ description: 'Feature flag not found' })
  async updateSystemFeatureFlag(
    @Param('featureKey') featureKey: string,
    @Body(BodyOrDataPipe) payload: UpdateSystemFeatureFlagDto,
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');

    try {
      const result = await this.updateSystemFeatureFlagUseCase.execute({
        accessToken,
        featureKey,
        isEnabled: payload.isEnabled,
        rolloutPercentage: payload.rolloutPercentage,
      });
      await this.tryRecordActivityFromAccessToken(accessToken, {
        service: 'auth',
        action: 'system.feature_flag.updated',
        entityType: 'feature_flag',
        entityId: featureKey,
        summary: 'System feature flag updated',
        metadata: {
          isEnabled: result.data.isEnabled,
          rolloutPercentage: result.data.rolloutPercentage,
        },
      });
      return result;
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError)
        throw new ForbiddenException(error.message);
      if (error instanceof SystemFeatureFlagNotFoundError)
        throw new NotFoundException(error.message);
      if (error instanceof UserNotFoundError)
        throw new NotFoundException(error.message);
      throw error;
    }
  }
}
