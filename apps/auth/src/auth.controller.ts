import { randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import {
  ConflictException,
  Body,
  HttpException,
  HttpStatus,
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
  Req,
  UseInterceptors,
  UseGuards,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { MAX_DOCUMENT_UPLOAD_BYTES, resolveClientIp, uploadLimits } from '@shared/http';
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
  UserNotFoundError,
  ChangeRoleUseCase,
  RefreshUseCase,
  EmailTakenError,
  ForgotPasswordUseCase,
  ResendVerificationUseCase,
  TOKEN_SERVICE,
  ForbiddenError,
  InviteNotFoundError,
  FullNameRequiredError,
  InviteUserUseCase,
  InvalidVerificationTokenError,
  TokenBelongsToInviteError,
  GetMeUseCase,
  CompleteProfileUseCase,
  VerifyEmailUseCase,
  ResetPasswordUseCase,
  InvalidResetTokenError,
  LogoutUseCase,
  GetHealthUseCase,
  InvalidCredentialsError,
} from './contexts/auth/session';
import { Portals, Requires, SignedIn } from '@shared/access';
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
import { ResendVerificationDto } from './dto/resend-verification.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ValidateInviteDto } from './dto/validate-invite.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { VerifyResetDto } from './dto/verify-reset.dto';
import { GetActivityLogUseCase } from './get-activity-log.use-case';
import { GetTenantStatusUseCase } from './get-tenant-status.use-case';
import { StorageQuotaService } from './storage-quota.service';
import { StorageQuotaExceededError } from './storage-usage.repository';
import type { TokenService } from './contexts/auth/session/domain/ports/token-service.port';
import { LoginRateLimitGuard } from './login-rate-limit.guard';
import { IpBlockGuard } from './ip-block.guard';
import { RecordAuthEventUseCase } from './record-auth-event.use-case';
import { ApiErrorResponse, ApiValidationErrorBody, CodeAttemptsLimited } from './dto/api-error.dto';
import { ApiLoginResponse, LoginSessionResponse } from './dto/login-response.dto';
import { LoginTwoFactorDto } from './dto/two-factor.dto';
import { LoginEvents, loginOrigin, type LoginOrigin } from './login-events';
import { TwoFactorLogin, challengeBody, type SecondFactor, type Session } from './two-factor-login.use-case';

@ApiTags('Auth')
@Portals('tenant')
@SignedIn()
@Controller()
export class AuthController extends BaseAuthController {
  constructor(
    @Inject(TwoFactorLogin) private readonly twoFactorLogin: TwoFactorLogin,
    @Inject(LoginEvents) private readonly loginEvents: LoginEvents,
    @Inject(RefreshUseCase) private readonly refreshUseCase: RefreshUseCase,
    @Inject(GetMeUseCase) private readonly getMeUseCase: GetMeUseCase,
    @Inject(InviteUserUseCase) private readonly inviteUserUseCase: InviteUserUseCase,
    @Inject(CheckTenantSeatLimitUseCase) private readonly checkTenantSeatLimitUseCase: CheckTenantSeatLimitUseCase,
    @Inject(ValidateInviteUseCase) private readonly validateInviteUseCase: ValidateInviteUseCase,
    @Inject(RegisterInvitedUseCase) private readonly registerInvitedUseCase: RegisterInvitedUseCase,
    @Inject(ForgotPasswordUseCase) private readonly forgotPasswordUseCase: ForgotPasswordUseCase,
    @Inject(ResendVerificationUseCase) private readonly resendVerificationUseCase: ResendVerificationUseCase,
    @Inject(GetTenantStatusUseCase) private readonly getTenantStatusUseCase: GetTenantStatusUseCase,
    @Inject(StorageQuotaService) private readonly storageQuota: StorageQuotaService,
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
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
    @Inject(RecordAuthEventUseCase) private readonly recordAuthEventUseCase: RecordAuthEventUseCase,
  ) {
    super(activityLogService);
  }

  @Portals('public')
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

  @Portals('public')
  @Get('test-sentry')
  @ApiOperation({
    summary: 'Trigger a test Sentry error',
    description: 'Throws an unhandled error so Sentry capture can be verified.',
  })
  testSentry(): never {
    throw new Error('Sentry test error from auth service');
  }

  @Portals('tenant', 'admin')
  @Post('media/upload')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Upload media',
    description:
      'Uploads a media file to object storage and returns a link to it. The file is charged to the tenant named in the access token.',
  })
  @ApiBearerAuth()
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiCreatedResponse({ type: UploadedMediaResponse })
  @ApiBadRequestResponse({ description: 'Missing upload file' })
  @UseInterceptors(FileInterceptor('file', uploadLimits(MAX_DOCUMENT_UPLOAD_BYTES)))
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
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');

    // The tenant comes from the verified token. Without one the upload has no
    // owner: nobody is charged for the bytes and nothing stops a caller filling
    // the bucket.
    const tenantId = this.tokenService.resolveAccessToken(accessToken)?.tenantId;
    if (!tenantId) throw new UnauthorizedException('Invalid access token');

    return this.storeUploadedMedia('auth', tenantId, file);
  }

  /** Authenticate with email and password */

  // Rate limiter first: it's an in-memory token check, cheaper than the
  // block guard's DB read, and its own burst can be exhausted by the same
  // failures that trip auto-block — checking it first keeps that case a 429.
  @Portals('public')
  @Post('login')
  @UseGuards(LoginRateLimitGuard, IpBlockGuard)
  @ApiOperation({
    summary: 'Sign in to the tenant portal',
    description:
      'Answers with a session, or, for a user who turned two-factor on, with a challenge to finish at POST /auth/login/two-factor.',
  })
  @ApiLoginResponse()
  @ApiErrorResponse(400, 'The body failed validation', ApiValidationErrorBody)
  @ApiErrorResponse(401, '"Invalid credentials"')
  @ApiErrorResponse(403, '"This IP address is blocked"')
  @ApiErrorResponse(404, 'Not a tenant account, or the account is disabled or unverified. Answered as a missing route.')
  @ApiErrorResponse(429, '"Too many login attempts, please try again later"')
  async login(
    @Body(BodyOrDataPipe) payload: LoginDto,
    @Req() req: { ip?: string },
    @Headers('user-agent') userAgent?: string,
  ) {
    const origin = loginOrigin(req, userAgent);
    const started = await this.runAuthUseCase(() =>
      this.loginEvents.recordingFailure(origin, payload.email, () => this.twoFactorLogin.start('tenant', payload)),
    );
    if (started.kind !== 'session') return challengeBody(started);
    await this.signedIn(started.session, origin);
    return started.session;
  }

  @Portals('public')
  @Post('login/two-factor')
  @UseGuards(LoginRateLimitGuard, IpBlockGuard)
  @ApiOperation({
    summary: 'Finish tenant sign-in with a code',
    description:
      'Takes the challenge from POST /auth/login and a code from the authenticator, or a recovery code. Each challenge and each recovery code works once.',
  })
  @ApiCreatedResponse({ description: 'Signed in', type: LoginSessionResponse })
  @ApiErrorResponse(400, 'The body failed validation', ApiValidationErrorBody)
  @ApiErrorResponse(
    401,
    '"That code is not valid", or "This sign-in has expired; start again" for an expired, used, forged or other portal\'s challenge',
  )
  @ApiErrorResponse(403, '"This IP address is blocked"')
  @CodeAttemptsLimited()
  async loginTwoFactor(
    @Body(BodyOrDataPipe) payload: LoginTwoFactorDto,
    @Req() req: { ip?: string },
    @Headers('user-agent') userAgent?: string,
  ) {
    const origin = loginOrigin(req, userAgent);
    const { session, secondFactor } = await this.runAuthUseCase(() =>
      this.loginEvents.recordingFailure(origin, null, () =>
        this.twoFactorLogin.complete('tenant', payload.challengeToken, payload.code),
      ),
    );
    await this.signedIn(session, origin, secondFactor);
    return session;
  }

  private async signedIn(session: Session, origin: LoginOrigin, secondFactor?: SecondFactor) {
    const { user } = session;
    await this.loginEvents.succeeded(user, origin);
    await this.tryRecordActivity({
      tenantId: user.tenantId,
      service: 'auth',
      action: 'user.logged_in',
      entityType: 'user',
      entityId: user.id,
      summary: 'User signed in',
      actorId: user.id,
      actorRole: user.role,
      metadata: { email: user.email, ...(secondFactor && { secondFactor }) },
    });
  }

  /** Authenticate a system account with email and password */

  @Portals('public')
  @Post('refresh')
  @ApiOkResponse({ type: AuthResponse })
  async refresh(
    @Body(BodyOrDataPipe) payload: RefreshDto,
    @Req() req: { ip?: string },
    @Headers('user-agent') userAgent?: string,
  ): Promise<AuthResponse> {
    const ipAddress = resolveClientIp(req);
    const result = await this.runAuthUseCase(async () => {
      try {
        return await this.refreshUseCase.execute(payload.refreshToken);
      } catch (error) {
        await this.recordAuthEventUseCase.execute({
          tenantId: null,
          userId: null,
          email: null,
          eventType: 'refresh',
          status: 'failed',
          ipAddress,
          userAgent: userAgent ?? null,
        });
        throw error;
      }
    });
    const refreshedUser = this.tokenService.resolveAccessToken(result.accessToken);
    await this.recordAuthEventUseCase.execute({
      tenantId: refreshedUser?.tenantId ?? null,
      userId: refreshedUser?.id ?? null,
      email: refreshedUser?.email ?? null,
      eventType: 'refresh',
      status: 'success',
      ipAddress,
      userAgent: userAgent ?? null,
    });
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

  @Portals('tenant', 'admin', 'installer')
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

  @Requires('tenant.organization.manage')
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
      if (error instanceof EmailTakenError)
        throw new ConflictException(error.message);
      if (error instanceof TenantSeatLimitReachedError)
        throw new ConflictException(error.message);
      if (error instanceof ForbiddenError)
        throw new ForbiddenException(error.message);
      throw error;
    }
  }

  /** Super admin creates a system admin account */

  @Portals('public')
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

  @Portals('public')
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
      if (error instanceof FullNameRequiredError)
        throw new BadRequestException({ message: error.message, field: 'fullName' });
      throw error;
    }
  }

  /** Request a password reset via email or SMS */

  @Portals('public')
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

  /**
   * Asked by other services, which verify the access token locally and so have
   * no way to see a suspension that happened after the token was issued.
   */

  @Get('tenant-status')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Whether the token holder\'s tenant is still active',
    description:
      'Used by other services to refuse a token minted before the tenant was suspended.',
  })
  @ApiOkResponse({ description: 'Tenant status' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  async getTenantStatus(@Headers('authorization') authorization?: string) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');

    try {
      return {
        status: true,
        message: 'success',
        data: await this.getTenantStatusUseCase.execute(accessToken),
      };
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      throw error;
    }
  }

  /** Request a new email verification link */

  @Portals('public')
  @Post('resend-verification')
  @UseGuards(LoginRateLimitGuard)
  @ApiOkResponse({ type: MessageResponse })
  async resendVerification(@Body(BodyOrDataPipe) payload: ResendVerificationDto) {
    return await this.resendVerificationUseCase.execute(payload);
  }

  /** Verify a password reset token */

  @Portals('public')
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

  @Portals('public')
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
      if (error instanceof TokenBelongsToInviteError)
        throw new ConflictException(error.message);
      if (error instanceof InvalidVerificationTokenError)
        throw new BadRequestException(error.message);
      throw error;
    }
  }

  /** Reset password using a verified token */

  @Portals('public')
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

  @Requires('tenant.organization.manage')
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

  @Portals('public')
  @Post('logout')
  @ApiOkResponse({ type: MessageResponse })
  async logout(
    @Body(BodyOrDataPipe) payload: LogoutDto,
    @Req() req: { ip?: string },
    @Headers('authorization') authorization?: string,
    @Headers('user-agent') userAgent?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    const actor = accessToken ? this.tokenService.resolveAccessToken(accessToken) : null;
    const result = await this.logoutUseCase.execute({
      refreshToken: payload.refreshToken,
      accessToken: accessToken ?? undefined,
    });
    await this.recordAuthEventUseCase.execute({
      tenantId: actor?.tenantId ?? null,
      userId: actor?.id ?? result.userId ?? null,
      email: actor?.email ?? null,
      eventType: 'logout',
      status: 'success',
      ipAddress: resolveClientIp(req),
      userAgent: userAgent ?? null,
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

  /**
   * A hash chain nobody recomputes proves nothing, so the check is exposed
   * rather than left to a one-off script. Read-only, and it reads the whole
   * chain: a partial check cannot tell a removed entry from one never written.
   */

  @Requires('tenant.activity.read')
  @Get('activity-log/verify')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Verify the activity log has not been tampered with',
    description:
      "Recomputes the caller's own tenant chain and reports the first entry that fails.",
  })
  @ApiOkResponse({ description: 'Chain verification result' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiForbiddenResponse({
    description: 'Caller is not permitted to verify activity logs',
  })
  async verifyActivityLog(@Headers('authorization') authorization?: string) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');

    try {
      const result = await this.activityLogService.verifyChainForAccessToken(accessToken);
      return {
        status: true,
        message: result.intact ? 'activity chain intact' : 'activity chain broken',
        data: result,
      };
    } catch (error) {
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      this.rethrowInvalidAccessToken(error);
      throw error;
    }
  }

  @Requires('tenant.activity.read')
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
    tenantId: string,
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
    // The tenant is part of the key because object storage is the only record
    // a media upload leaves. Without it the bytes cannot be attributed to
    // anyone later, and the media subtotal could never be recomputed.
    const key = `${service}/media/${tenantId}/${new Date().toISOString().slice(0, 10)}/${randomUUID()}-${normalizedBaseName}${extension.toLowerCase()}`;
    const usePublicMediaUrl = this.objectStorageService.hasPublicBaseUrl();

    // Reserved before the bytes are written, so a refused upload leaves nothing
    // in the bucket to clean up.
    try {
      await this.storageQuota.assertRoomFor(tenantId, file.buffer.byteLength);
    } catch (error) {
      if (error instanceof StorageQuotaExceededError) {
        throw new HttpException(error.message, HttpStatus.PAYLOAD_TOO_LARGE);
      }
      throw error;
    }

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

      await this.storageQuota.record(tenantId, 'media', file.buffer.byteLength);

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
