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
  Patch,
  Post,
  Query,
  UnauthorizedException,
} from "@nestjs/common";
import {
  ChangeRoleUseCase,
  ForgotPasswordUseCase,
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
  UsernameTakenError,
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
import { AuthResponse, HealthResponse, MeResponse } from "./dto/auth.schema";
import { UpdateProfileDto } from "./dto/update-profile.dto";
import { UpdateNotificationPreferencesDto } from "./dto/update-notification-preferences.dto";
import { UpdateDispatcherPreferencesDto } from "./dto/update-dispatcher-preferences.dto";
import { UpdateOrganizationSettingsDto } from "./dto/update-organization-settings.dto";

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
  ) {}

  @Get("health")
  health(): HealthResponse {
    return { status: true, message: "success", data: { service: "auth" } };
  }

  /** Register an enterprise admin (creates new tenant) */
  @Post("register")
  async register(@Body() payload: RegisterDto): Promise<AuthResponse> {
    try {
      return (await this.registerUseCase.execute(payload)) as unknown as AuthResponse;
    } catch (error) {
      if (error instanceof UsernameTakenError)
        throw new ConflictException(error.message);
      throw error;
    }
  }

  /** Authenticate with email and password */
  @Post("login")
  async login(@Body() payload: LoginDto): Promise<AuthResponse> {
    return this.runAuthUseCase(() =>
      this.loginUseCase.execute(payload),
    ) as unknown as Promise<AuthResponse>;
  }

  /** Exchange a refresh token for a new token pair */
  @Post("refresh")
  async refresh(@Body() payload: RefreshDto): Promise<AuthResponse> {
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
    @Body() payload: InviteUserDto,
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
  async registerInvited(@Body() payload: RegisterInvitedDto): Promise<AuthResponse> {
    try {
      return (await this.registerInvitedUseCase.execute(payload)) as unknown as AuthResponse;
    } catch (error) {
      if (error instanceof InviteNotFoundError)
        throw new NotFoundException(error.message);
      if (error instanceof UsernameTakenError)
        throw new ConflictException(error.message);
      if (error instanceof ForbiddenError)
        throw new ForbiddenException(error.message);
      throw error;
    }
  }

  /** Request a password reset via email or SMS */
  @Post("forgot-password")
  async forgotPassword(@Body() payload: ForgotPasswordDto) {
    try {
      return await this.forgotPasswordUseCase.execute(payload);
    } catch (error) {
      if (error instanceof UserNotFoundError)
        throw new NotFoundException(error.message);
      throw error;
    }
  }

  /** Verify a password reset token or SMS code */
  @Post("verify-reset")
  async verifyReset(@Body() payload: VerifyResetDto) {
    try {
      if (payload.method === "email") {
        return await this.verifyResetUseCase.execute({
          method: "email",
          token: payload.token!,
        });
      }
      return await this.verifyResetUseCase.execute({
        method: "sms",
        identifier: payload.identifier!,
        code: payload.code!,
      });
    } catch (error) {
      if (error instanceof InvalidResetTokenError)
        throw new BadRequestException(error.message);
      if (error instanceof UserNotFoundError)
        throw new NotFoundException(error.message);
      throw error;
    }
  }

  /** Reset password using a verified token */
  @Post("reset-password")
  async resetPassword(@Body() payload: ResetPasswordDto) {
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
    @Body() payload: ChangeRoleDto,
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
    @Body() payload: LogoutDto,
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
  async updateProfile(
    @Body() payload: UpdateProfileDto,
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
  async updateNotificationPreferences(
    @Body() payload: UpdateNotificationPreferencesDto,
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
  async updateDispatcherPreferences(
    @Body() payload: UpdateDispatcherPreferencesDto,
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
  async updateOrganizationSettings(
    @Body() payload: UpdateOrganizationSettingsDto,
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
}
