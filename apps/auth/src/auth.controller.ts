import { randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import {
  ConflictException,
  Body,
  BadRequestException,
  Post,
  Headers,
  UnauthorizedException,
  UploadedFile,
  ForbiddenException,
  Get,
  Inject,
  ServiceUnavailableException,
  Controller,
  NotFoundException,
  Query,
  UseInterceptors,
  UseGuards,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiConsumes,
  ApiForbiddenResponse,
  ApiBody,
  ApiQuery,
  ApiCreatedResponse,
  ApiUnauthorizedResponse,
  ApiOkResponse,
  ApiBadRequestResponse,
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
} from '@nestjs/swagger';
import { ObjectStorageService } from '@shared/object-storage';
import { ActivityLogService } from './activity-log.service';
import { BaseAuthController } from './base.controller';
import { BodyOrDataPipe } from './body-or-data.pipe';
import { TenantSeatLimitReachedError, CheckTenantSeatLimitUseCase } from './check-tenant-seat-limit.use-case';
import {
  ValidateInviteUseCase,
  RegisterInvitedUseCase,
  VerifyResetUseCase,
  RegisterUseCase,
  LoginUseCase,
  UserNotFoundError,
  ChangeRoleUseCase,
  RefreshUseCase,
  EmailTakenError,
  ForgotPasswordUseCase,
  ForbiddenError,
  InviteNotFoundError,
  InviteUserUseCase,
  InvalidVerificationTokenError,
  GetMeUseCase,
  CompleteProfileUseCase,
  VerifyEmailUseCase,
  ResetPasswordUseCase,
  InvalidResetTokenError,
  LogoutUseCase,
  GetHealthUseCase,
} from './contexts/auth/session';
import {
  MessageResponse,
  ActivityLogResponse,
  InviteActionResponse,
  ValidateInviteResponse,
  HealthResponse,
  MeResponse,
  AuthResponse,
  UploadedMediaResponse,
  ChangeRoleResponse,
} from './dto/auth.schema';
import { ChangeRoleDto } from './dto/change-role.dto';
import { CompleteProfileDto } from './dto/complete-profile.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { InviteUserDto } from './dto/invite-user.dto';
import { LoginDto } from './dto/login.dto';
import { LogoutDto } from './dto/logout.dto';
import { RefreshDto } from './dto/refresh.dto';
import { RegisterInvitedDto } from './dto/register-invited.dto';
import { RegisterDto } from './dto/register.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ValidateInviteDto } from './dto/validate-invite.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { VerifyResetDto } from './dto/verify-reset.dto';
import { GetActivityLogUseCase } from './get-activity-log.use-case';
import { LoginRateLimitGuard } from './login-rate-limit.guard';

@ApiTags('Auth')
@Controller()
export class AuthController extends BaseAuthController {
  constructor(
    @Inject(LoginUseCase) private readonly loginUseCase: LoginUseCase,
    @Inject(RefreshUseCase) private readonly refreshUseCase: RefreshUseCase,
    @Inject(GetMeUseCase) private readonly getMeUseCase: GetMeUseCase,
    @Inject(RegisterUseCase) private readonly registerUseCase: RegisterUseCase,
    @Inject(InviteUserUseCase) private readonly inviteUserUseCase: InviteUserUseCase,
    @Inject(CheckTenantSeatLimitUseCase) private readonly checkTenantSeatLimitUseCase: CheckTenantSeatLimitUseCase,
    @Inject(ValidateInviteUseCase) private readonly validateInviteUseCase: ValidateInviteUseCase,
    @Inject(RegisterInvitedUseCase) private readonly registerInvitedUseCase: RegisterInvitedUseCase,
    @Inject(ForgotPasswordUseCase) private readonly forgotPasswordUseCase: ForgotPasswordUseCase,
    @Inject(VerifyResetUseCase) private readonly verifyResetUseCase: VerifyResetUseCase,
    @Inject(GetHealthUseCase) private readonly getHealthUseCase: GetHealthUseCase,
    @Inject(ResetPasswordUseCase) private readonly resetPasswordUseCase: ResetPasswordUseCase,
    @Inject(ChangeRoleUseCase) private readonly changeRoleUseCase: ChangeRoleUseCase,
    @Inject(LogoutUseCase) private readonly logoutUseCase: LogoutUseCase,
    @Inject(GetActivityLogUseCase) private readonly getActivityLogUseCase: GetActivityLogUseCase,
    @Inject(VerifyEmailUseCase) private readonly verifyEmailUseCase: VerifyEmailUseCase,
    @Inject(CompleteProfileUseCase) private readonly completeProfileUseCase: CompleteProfileUseCase,
    @Inject(ActivityLogService) activityLogService: ActivityLogService,
    @Inject(ObjectStorageService) private readonly objectStorageService: ObjectStorageService,
  ) {
    super(activityLogService);
  }

  @Get('health')
  @ApiOkResponse({ type: HealthResponse })
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
  @ApiCreatedResponse({ type: AuthResponse })
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
  @UseGuards(LoginRateLimitGuard)
  @ApiOkResponse({ type: AuthResponse })
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

  @Post('refresh')
  @ApiOkResponse({ type: AuthResponse })
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

  @Get('me')
  @ApiOkResponse({ type: MeResponse })
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
  @ApiCreatedResponse({ type: InviteActionResponse })
  async inviteUser(
    @Body(BodyOrDataPipe) payload: InviteUserDto,
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');

    try {
      await this.checkTenantSeatLimitUseCase.ensureSeatAvailable(accessToken);
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
      if (error instanceof TenantSeatLimitReachedError)
        throw new ConflictException(error.message);
      if (error instanceof ForbiddenError)
        throw new ForbiddenException(error.message);
      throw error;
    }
  }

  /** Super admin creates a system admin account */

  @Get('invite/validate')
  @ApiOkResponse({ type: ValidateInviteResponse })
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
  @ApiCreatedResponse({ type: AuthResponse })
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
  @UseGuards(LoginRateLimitGuard)
  @ApiOkResponse({ type: MessageResponse })
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
  @ApiOkResponse({ type: MessageResponse })
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
  @ApiOkResponse({ type: MessageResponse })
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
  @ApiOkResponse({ type: MessageResponse })
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
  @ApiOkResponse({ type: MessageResponse })
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
  @ApiOkResponse({ type: ChangeRoleResponse })
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
  @ApiOkResponse({ type: MessageResponse })
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
