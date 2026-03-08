import {
  Body,
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
} from "./contexts/auth/session";
import { LoginDto } from "./dto/login.dto";
import { RefreshDto } from "./dto/refresh.dto";

@Controller("auth")
export class AuthController {
  constructor(
    // Explicit injections avoid hidden runtime coupling on decorator metadata emission.
    @Inject(LoginUseCase)
    private readonly loginUseCase: LoginUseCase,
    @Inject(RefreshUseCase)
    private readonly refreshUseCase: RefreshUseCase,
    @Inject(GetMeUseCase)
    private readonly getMeUseCase: GetMeUseCase,
  ) {}

  @Get("health")
  health() {
    return { status: "ok", service: "auth" };
  }

  @Post("login")
  async login(@Body() payload: LoginDto) {
    return this.runAuthUseCase(() => this.loginUseCase.execute(payload));
  }

  @Post("refresh")
  async refresh(@Body() payload: RefreshDto) {
    return this.runAuthUseCase(() =>
      this.refreshUseCase.execute(payload.refreshToken),
    );
  }

  @Get("me")
  me(@Headers("authorization") authorization?: string) {
    return this.getMeUseCase.execute(authorization);
  }

  private async runAuthUseCase<T>(fn: () => Promise<T>) {
    try {
      return await fn();
    } catch (error) {
      // Interface layer translates domain auth errors into HTTP semantics.
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
