import {
  Body,
  ConflictException,
  Controller,
  Get,
  Headers,
  Inject,
  Post,
  UnauthorizedException,
} from "@nestjs/common";
import {
  GetMeUseCase,
  InvalidCredentialsError,
  InvalidRefreshTokenError,
  LoginUseCase,
  RefreshUseCase,
  RegisterUseCase,
  UsernameTakenError,
} from "./contexts/auth/session";
import { LoginDto } from "./dto/login.dto";
import { RefreshDto } from "./dto/refresh.dto";
import { RegisterDto } from "./dto/register.dto";
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
  ) {}

  /** Health check */
  @Get("health")
  health(): HealthResponse {
    return { status: true, message: "success", data: { service: "auth" } };
  }

  @Post("register")
  async register(@Body() payload: RegisterDto): Promise<AuthResponse> {
    try {
      return await this.registerUseCase.execute(payload) as unknown as AuthResponse;
    } catch (error) {
      if (error instanceof UsernameTakenError) throw new ConflictException(error.message);
      throw error;
    }
  }

  /** Authenticate with email and password; returns JWT access + refresh tokens */
  @Post("login")
  async login(@Body() payload: LoginDto): Promise<AuthResponse> {
    return this.runAuthUseCase(() => this.loginUseCase.execute(payload)) as unknown as Promise<AuthResponse>;
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
  async me(@Headers("authorization") authorization?: string): Promise<MeResponse> {
    return this.getMeUseCase.execute(authorization) as unknown as Promise<MeResponse>;
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
}
