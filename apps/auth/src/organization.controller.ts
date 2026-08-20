import {
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
  Delete,
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
  ApiQuery,
  ApiCreatedResponse,
} from '@nestjs/swagger';
import { ActivityLogService } from './activity-log.service';
import { BaseAuthController } from './base.controller';
import { BodyOrDataPipe } from './body-or-data.pipe';
import {
  ListOrganizationUsersUseCase,
  RemoveOrganizationUserUseCase,
  UpdateOrganizationSettingsUseCase,
  GetOrganizationSettingsUseCase,
  UpdateOrganizationUserStatusUseCase,
  UserNotFoundError,
  ForbiddenError,
  UpdateOrganizationUserUseCase,
  InvalidSettingsError,
  ResendPendingInviteUseCase,
  InviteNotFoundError,
} from './contexts/auth/session';
import {
  OrganizationSettingsResponse,
  OrganizationUsersResponse,
  InviteActionResponse,
  RemoveOrganizationUserResponse,
  OrganizationUserResponse,
} from './dto/auth.schema';
import { ResendInviteDto } from './dto/resend-invite.dto';
import { UpdateOrganizationSettingsDto } from './dto/update-organization-settings.dto';
import { UpdateOrganizationUserStatusDto } from './dto/update-organization-user-status.dto';
import { UpdateOrganizationUserDto } from './dto/update-organization-user.dto';

@ApiTags('Organization')
@Controller('organization')
export class OrganizationController extends BaseAuthController {
  constructor(
    @Inject(ListOrganizationUsersUseCase) private readonly listOrganizationUsersUseCase: ListOrganizationUsersUseCase,
    @Inject(UpdateOrganizationUserUseCase) private readonly updateOrganizationUserUseCase: UpdateOrganizationUserUseCase,
    @Inject(UpdateOrganizationUserStatusUseCase) private readonly updateOrganizationUserStatusUseCase: UpdateOrganizationUserStatusUseCase,
    @Inject(GetOrganizationSettingsUseCase) private readonly getOrganizationSettingsUseCase: GetOrganizationSettingsUseCase,
    @Inject(UpdateOrganizationSettingsUseCase) private readonly updateOrganizationSettingsUseCase: UpdateOrganizationSettingsUseCase,
    @Inject(ResendPendingInviteUseCase) private readonly resendPendingInviteUseCase: ResendPendingInviteUseCase,
    @Inject(RemoveOrganizationUserUseCase) private readonly removeOrganizationUserUseCase: RemoveOrganizationUserUseCase,
    @Inject(ActivityLogService) activityLogService: ActivityLogService,
  ) {
    super(activityLogService);
  }

  @Post('invites/resend')
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

  @Get('users')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'List organization users',
    description: "Admin user management: fetch users and pending invitations for the caller's tenant.",
  })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'role', required: false, type: String })
  @ApiQuery({ name: 'status', required: false, description: 'active | inactive | invited' })
  @ApiOkResponse({ type: OrganizationUsersResponse })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiForbiddenResponse({ description: 'Caller is not permitted to read users' })
  async listOrganizationUsers(
    @Query('search') search?: string,
    @Query('role') role?: string,
    @Query('status') status?: string,
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');

    try {
      return await this.listOrganizationUsersUseCase.execute(accessToken, { search, role, status });
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError)
        throw new ForbiddenException(error.message);
      throw error;
    }
  }

  /** Admin-only update of another tenant user's profile details */

  @Patch('users/:userId')
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

  @Patch('users/:userId/status')
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

  @Delete('users/:userId')
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

  @Get('settings')
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

  @Patch('settings')
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
}
