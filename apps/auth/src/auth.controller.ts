import {
  UploadedFile,
  UseInterceptors,
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  Inject,
  NotFoundException,
  Patch,
  Post,
  Query,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
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
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import { FileInterceptor } from "@nestjs/platform-express";
import { ObjectStorageService } from "@shared/object-storage";
import { randomUUID } from "node:crypto";
import { extname } from "node:path";
import {
  ChangeRoleUseCase,
  ForgotPasswordUseCase,
  GetHealthUseCase,
  GetMeUseCase,
  GetNotificationPreferencesUseCase,
  GetDispatcherPreferencesUseCase,
  GetOrganizationSettingsUseCase,
  GetProfileUseCase,
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
  ResetPasswordUseCase,
  UpdateDispatcherPreferencesUseCase,
  UpdateNotificationPreferencesUseCase,
  UpdateOrganizationSettingsUseCase,
  UpdateProfileUseCase,
  EmailTakenError,
  UserNotFoundError,
  ValidateInviteUseCase,
  VerifyResetUseCase,
  ForbiddenError,
} from "./contexts/auth/session";
import { LoginDto } from "./dto/login.dto";
import { RefreshDto } from "./dto/refresh.dto";
import { RegisterDto } from "./dto/register.dto";
import { InviteUserDto } from "./dto/invite-user.dto";
import { ValidateInviteDto } from "./dto/validate-invite.dto";
import { RegisterInvitedDto } from "./dto/register-invited.dto";
import { ForgotPasswordDto } from "./dto/forgot-password.dto";
import { VerifyResetDto } from "./dto/verify-reset.dto";
import { ResetPasswordDto } from "./dto/reset-password.dto";
import { ChangeRoleDto } from "./dto/change-role.dto";
import { LogoutDto } from "./dto/logout.dto";
import {
  AuthResponse,
  DispatcherPreferencesResponse,
  HealthResponse,
  MeResponse,
  NotificationPreferencesResponse,
  OrganizationSettingsResponse,
  ProfileResponse,
  UploadedMediaResponse,
} from "./dto/auth.schema";
import { UpdateProfileDto } from "./dto/update-profile.dto";
import { UpdateNotificationPreferencesDto } from "./dto/update-notification-preferences.dto";
import { UpdateDispatcherPreferencesDto } from "./dto/update-dispatcher-preferences.dto";
import { UpdateOrganizationSettingsDto } from "./dto/update-organization-settings.dto";
import { BodyOrDataPipe } from "./body-or-data.pipe";

@ApiTags("Auth")
@Controller("auth")
export class AuthController {
  constructor(
    @Inject(LoginUseCase)
    private readonly loginUseCase: LoginUseCase,
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
    @Inject(UpdateProfileUseCase)
    private readonly updateProfileUseCase: UpdateProfileUseCase,
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
    private readonly objectStorageService: ObjectStorageService,
  ) {}

  @Get("health")
  async health(): Promise<HealthResponse> {
    try {
      const data = await this.getHealthUseCase.execute();
      return {
        status: true,
        message: "success",
        data,
      };
    } catch {
      throw new ServiceUnavailableException("Database unavailable");
    }
  }

  @Get("test-sentry")
  @ApiOperation({
    summary: "Trigger a test Sentry error",
    description: "Throws an unhandled error so Sentry capture can be verified.",
  })
  testSentry(): never {
    throw new Error("Sentry test error from auth service");
  }

  @Post("media/upload")
  @ApiConsumes("multipart/form-data")
  @ApiOperation({
    summary: "Upload media",
    description: "Uploads a media file to object storage and returns a link to it.",
  })
  @ApiCreatedResponse({ type: UploadedMediaResponse })
  @ApiBadRequestResponse({ description: "Missing upload file" })
  @UseInterceptors(FileInterceptor("file"))
  @ApiBody({
    schema: {
      type: "object",
      required: ["file"],
      properties: {
        file: {
          type: "string",
          format: "binary",
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
    return this.storeUploadedMedia("auth", file);
  }

  /** Register an enterprise admin (creates new tenant) */
  @Post("register")
  async register(@Body(BodyOrDataPipe) payload: RegisterDto): Promise<AuthResponse> {
    try {
      return (await this.registerUseCase.execute(payload)) as unknown as AuthResponse;
    } catch (error) {
      if (error instanceof EmailTakenError)
        throw new ConflictException(error.message);
      throw error;
    }
  }

  /** Authenticate with email and password */
  @Post("login")
  async login(@Body(BodyOrDataPipe) payload: LoginDto): Promise<AuthResponse> {
    return this.runAuthUseCase(() =>
      this.loginUseCase.execute(payload),
    ) as unknown as Promise<AuthResponse>;
  }

  /** Exchange a refresh token for a new token pair */
  @Post("refresh")
  async refresh(@Body(BodyOrDataPipe) payload: RefreshDto): Promise<AuthResponse> {
    return this.runAuthUseCase(() =>
      this.refreshUseCase.execute(payload.refreshToken),
    ) as unknown as Promise<AuthResponse>;
  }

  /** Decode the bearer token and return the authenticated user's claims */
  @Get("me")
  async me(
    @Headers("authorization") authorization?: string,
  ): Promise<MeResponse> {
    return this.getMeUseCase.execute(
      authorization,
    ) as unknown as Promise<MeResponse>;
  }

  /** Enterprise admin invites a user via email */
  @Post("invite")
  async inviteUser(
    @Body(BodyOrDataPipe) payload: InviteUserDto,
    @Headers("authorization") authorization?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException("Missing authorization");

    try {
      return await this.inviteUserUseCase.execute({
        email: payload.email,
        role: payload.role,
        accessToken,
      });
    } catch (error) {
      if (error instanceof ForbiddenError)
        throw new ForbiddenException(error.message);
      throw error;
    }
  }

  /** Validate an invite token (called when user clicks the invite link) */
  @Get("invite/validate")
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
  @Post("register/invited")
  async registerInvited(@Body(BodyOrDataPipe) payload: RegisterInvitedDto): Promise<AuthResponse> {
    try {
      return (await this.registerInvitedUseCase.execute(payload)) as unknown as AuthResponse;
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
  @Post("forgot-password")
  async forgotPassword(@Body(BodyOrDataPipe) payload: ForgotPasswordDto) {
    try {
      return await this.forgotPasswordUseCase.execute(payload);
    } catch (error) {
      if (error instanceof UserNotFoundError)
        throw new NotFoundException(error.message);
      throw error;
    }
  }

  /** Verify a password reset token */
  @Post("verify-reset")
  async verifyReset(@Body(BodyOrDataPipe) payload: VerifyResetDto) {
    try {
      return await this.verifyResetUseCase.execute({ token: payload.token });
    } catch (error) {
      if (error instanceof InvalidResetTokenError)
        throw new BadRequestException(error.message);
      throw error;
    }
  }

  /** Reset password using a verified token */
  @Post("reset-password")
  async resetPassword(@Body(BodyOrDataPipe) payload: ResetPasswordDto) {
    try {
      return await this.resetPasswordUseCase.execute(payload);
    } catch (error) {
      if (error instanceof InvalidResetTokenError)
        throw new BadRequestException(error.message);
      throw error;
    }
  }

  /** Change a user's role (enterprise admin only) */
  @Post("change-role")
  async changeRole(
    @Body(BodyOrDataPipe) payload: ChangeRoleDto,
    @Headers("authorization") authorization?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException("Missing authorization");

    try {
      return await this.changeRoleUseCase.execute({
        targetUserId: payload.targetUserId,
        newRole: payload.newRole,
        accessToken,
      });
    } catch (error) {
      if (error instanceof ForbiddenError)
        throw new ForbiddenException(error.message);
      if (error instanceof UserNotFoundError)
        throw new NotFoundException(error.message);
      throw error;
    }
  }

  /** Logout – invalidate the refresh token (and access token if possible) */
  @Post("logout")
  async logout(
    @Body(BodyOrDataPipe) payload: LogoutDto,
    @Headers("authorization") authorization?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    return this.logoutUseCase.execute({
      refreshToken: payload.refreshToken,
      accessToken: accessToken ?? undefined,
    });
  }

  /** Returns current authenticated user's editable profile details */
  @Get("profile")
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Get current user profile",
    description: "Epic B (US-B01): view authenticated user name/contact details.",
  })
  @ApiOkResponse({ type: ProfileResponse })
  @ApiUnauthorizedResponse({ description: "Missing or invalid bearer token" })
  @ApiNotFoundResponse({ description: "User not found" })
  @ApiForbiddenResponse({ description: "Caller is not permitted" })
  async getProfile(@Headers("authorization") authorization?: string) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException("Missing authorization");

    try {
      return await this.getProfileUseCase.execute(accessToken);
    } catch (error) {
      if (error instanceof ForbiddenError)
        throw new ForbiddenException(error.message);
      if (error instanceof UserNotFoundError)
        throw new NotFoundException(error.message);
      throw error;
    }
  }

  /** Updates current authenticated user's name/contact details */
  @Patch("profile")
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Update current user profile",
    description: "Epic B (US-B01): edit authenticated user name/contact details.",
  })
  @ApiOkResponse({ type: ProfileResponse })
  @ApiUnauthorizedResponse({ description: "Missing or invalid bearer token" })
  @ApiNotFoundResponse({ description: "User not found" })
  @ApiForbiddenResponse({ description: "Caller is not permitted" })
  async updateProfile(
    @Body(BodyOrDataPipe) payload: UpdateProfileDto,
    @Headers("authorization") authorization?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException("Missing authorization");

    try {
      return await this.updateProfileUseCase.execute({
        accessToken,
        fullName: payload.fullName,
        phoneNumber: payload.phoneNumber,
      });
    } catch (error) {
      if (error instanceof ForbiddenError)
        throw new ForbiddenException(error.message);
      if (error instanceof UserNotFoundError)
        throw new NotFoundException(error.message);
      throw error;
    }
  }

  /** Gets current notification preferences */
  @Get("preferences/notifications")
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Get notification preferences",
    description: "Epic B (US-B02): retrieve current notification preference settings.",
  })
  @ApiOkResponse({ type: NotificationPreferencesResponse })
  @ApiUnauthorizedResponse({ description: "Missing or invalid bearer token" })
  @ApiNotFoundResponse({ description: "User not found" })
  @ApiForbiddenResponse({ description: "Caller is not permitted" })
  async getNotificationPreferences(
    @Headers("authorization") authorization?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException("Missing authorization");

    try {
      return await this.getNotificationPreferencesUseCase.execute(accessToken);
    } catch (error) {
      if (error instanceof ForbiddenError)
        throw new ForbiddenException(error.message);
      if (error instanceof UserNotFoundError)
        throw new NotFoundException(error.message);
      throw error;
    }
  }

  /** Updates current notification preferences */
  @Patch("preferences/notifications")
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Update notification preferences",
    description: "Epic B (US-B02): update alert channel preferences.",
  })
  @ApiOkResponse({ type: NotificationPreferencesResponse })
  @ApiUnauthorizedResponse({ description: "Missing or invalid bearer token" })
  @ApiNotFoundResponse({ description: "User not found" })
  @ApiForbiddenResponse({ description: "Caller is not permitted" })
  async updateNotificationPreferences(
    @Body(BodyOrDataPipe) payload: UpdateNotificationPreferencesDto,
    @Headers("authorization") authorization?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException("Missing authorization");

    try {
      return await this.updateNotificationPreferencesUseCase.execute({
        accessToken,
        emailAlerts: payload.emailAlerts,
        smsAlerts: payload.smsAlerts,
        pushAlerts: payload.pushAlerts,
        incidentAlerts: payload.incidentAlerts,
        jobUpdates: payload.jobUpdates,
        marketingAnnouncements: payload.marketingAnnouncements,
      });
    } catch (error) {
      if (error instanceof ForbiddenError)
        throw new ForbiddenException(error.message);
      if (error instanceof UserNotFoundError)
        throw new NotFoundException(error.message);
      throw error;
    }
  }

  /** Gets dispatcher working-hours and timezone preferences */
  @Get("preferences/dispatch")
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Get dispatcher schedule and timezone preferences",
    description: "Epic B (US-B03): retrieve dispatcher working-hours/timezone settings.",
  })
  @ApiOkResponse({ type: DispatcherPreferencesResponse })
  @ApiUnauthorizedResponse({ description: "Missing or invalid bearer token" })
  @ApiNotFoundResponse({ description: "User not found" })
  @ApiForbiddenResponse({ description: "Caller is not a dispatcher" })
  async getDispatcherPreferences(
    @Headers("authorization") authorization?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException("Missing authorization");

    try {
      return await this.getDispatcherPreferencesUseCase.execute(accessToken);
    } catch (error) {
      if (error instanceof ForbiddenError)
        throw new ForbiddenException(error.message);
      if (error instanceof UserNotFoundError)
        throw new NotFoundException(error.message);
      throw error;
    }
  }

  /** Updates dispatcher working-hours and timezone preferences */
  @Patch("preferences/dispatch")
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Update dispatcher schedule and timezone preferences",
    description: "Epic B (US-B03): update dispatcher working-hours/timezone settings.",
  })
  @ApiOkResponse({ type: DispatcherPreferencesResponse })
  @ApiUnauthorizedResponse({ description: "Missing or invalid bearer token" })
  @ApiNotFoundResponse({ description: "User not found" })
  @ApiForbiddenResponse({ description: "Caller is not a dispatcher" })
  @ApiBadRequestResponse({ description: "Invalid timezone/workday/shift format" })
  async updateDispatcherPreferences(
    @Body(BodyOrDataPipe) payload: UpdateDispatcherPreferencesDto,
    @Headers("authorization") authorization?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException("Missing authorization");

    try {
      return await this.updateDispatcherPreferencesUseCase.execute({
        accessToken,
        timezone: payload.timezone,
        shiftStart: payload.shiftStart,
        shiftEnd: payload.shiftEnd,
        workDays: payload.workDays,
      });
    } catch (error) {
      if (error instanceof ForbiddenError)
        throw new ForbiddenException(error.message);
      if (error instanceof UserNotFoundError)
        throw new NotFoundException(error.message);
      if (error instanceof InvalidSettingsError)
        throw new BadRequestException(error.message);
      throw error;
    }
  }

  /** Gets organization-level settings for current tenant (enterprise admin only) */
  @Get("organization/settings")
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Get organization settings",
    description: "Epic B (US-B04): retrieve tenant-level branding/default settings.",
  })
  @ApiOkResponse({ type: OrganizationSettingsResponse })
  @ApiUnauthorizedResponse({ description: "Missing or invalid bearer token" })
  @ApiNotFoundResponse({ description: "User not found" })
  @ApiForbiddenResponse({ description: "Caller is not an enterprise admin" })
  async getOrganizationSettings(
    @Headers("authorization") authorization?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException("Missing authorization");

    try {
      return await this.getOrganizationSettingsUseCase.execute(accessToken);
    } catch (error) {
      if (error instanceof ForbiddenError)
        throw new ForbiddenException(error.message);
      if (error instanceof UserNotFoundError)
        throw new NotFoundException(error.message);
      throw error;
    }
  }

  /** Updates organization-level settings for current tenant (enterprise admin only) */
  @Patch("organization/settings")
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Update organization settings",
    description: "Epic B (US-B04): update tenant-level branding/default settings.",
  })
  @ApiOkResponse({ type: OrganizationSettingsResponse })
  @ApiUnauthorizedResponse({ description: "Missing or invalid bearer token" })
  @ApiNotFoundResponse({ description: "User not found" })
  @ApiForbiddenResponse({ description: "Caller is not an enterprise admin" })
  @ApiBadRequestResponse({ description: "Invalid settings payload" })
  async updateOrganizationSettings(
    @Body(BodyOrDataPipe) payload: UpdateOrganizationSettingsDto,
    @Headers("authorization") authorization?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException("Missing authorization");

    try {
      return await this.updateOrganizationSettingsUseCase.execute({
        accessToken,
        branding: payload.branding,
        defaults: payload.defaults,
      });
    } catch (error) {
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
      throw error;
    }
  }

  private extractBearerToken(header?: string): string | null {
    if (!header) return null;
    const [scheme, token] = header.split(" ");
    if (scheme?.toLowerCase() !== "bearer" || !token) return null;
    return token;
  }

  private async storeUploadedMedia(
    service: "auth" | "fleet",
    file?: {
      originalname: string;
      mimetype: string;
      size: number;
      buffer: Buffer;
    },
  ) {
    if (!file?.buffer?.length) {
      throw new BadRequestException("Missing upload file");
    }

    const extension = extname(file.originalname);
    const baseName = file.originalname.slice(
      0,
      file.originalname.length - extension.length,
    );
    const normalizedBaseName =
      baseName.replace(/[^a-zA-Z0-9-_]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80)
      || "file";
    const key = `${service}/media/${new Date().toISOString().slice(0, 10)}/${randomUUID()}-${normalizedBaseName}${extension.toLowerCase()}`;

    try {
      await this.objectStorageService.putObject({
        key,
        body: file.buffer,
        contentType: file.mimetype,
      });

      const url =
        this.objectStorageService.publicUrl(key)
        ?? await this.objectStorageService.createPresignedDownloadUrl({ key });

      return {
        key,
        url,
        filename: file.originalname,
        contentType: file.mimetype,
        size: file.size,
      };
    } catch {
      throw new ServiceUnavailableException("Media upload failed");
    }
  }
}
