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
  Post,
  Query,
  UnauthorizedException,
} from "@nestjs/common";
import {
  ChangeRoleUseCase,
  ForgotPasswordUseCase,
  GetMeUseCase,
  InviteUserUseCase,
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
