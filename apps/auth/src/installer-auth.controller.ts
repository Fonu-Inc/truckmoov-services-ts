import { Body, Controller, Headers, Inject, Post, Req, UseGuards } from '@nestjs/common';
import { ApiCreatedResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Portals } from '@shared/access';
import { ActivityLogService } from './activity-log.service';
import { BaseAuthController } from './base.controller';
import { BodyOrDataPipe } from './body-or-data.pipe';
import { InstallerLoginUseCase } from './contexts/installation/application/use-cases/installer-login.use-case';
import { ApiErrorResponse, ApiValidationErrorBody, CodeAttemptsLimited } from './dto/api-error.dto';
import { ApiLoginResponse, LoginSessionResponse } from './dto/login-response.dto';
import { LoginDto } from './dto/login.dto';
import { LoginTwoFactorDto } from './dto/two-factor.dto';
import { IpBlockGuard } from './ip-block.guard';
import { LoginEvents, loginOrigin, type LoginOrigin } from './login-events';
import { LoginRateLimitGuard } from './login-rate-limit.guard';
import { challengeBody, type SecondFactor, type Session } from './two-factor-login.use-case';

@ApiTags('Installer')
@Portals('public')
@Controller('installer')
export class InstallerAuthController extends BaseAuthController {
  constructor(
    @Inject(InstallerLoginUseCase) private readonly installerLogin: InstallerLoginUseCase,
    @Inject(LoginEvents) private readonly loginEvents: LoginEvents,
    @Inject(ActivityLogService) activityLogService: ActivityLogService,
  ) {
    super(activityLogService);
  }

  // Rate limiter first, as on the tenant login: cheaper than the block guard's read.
  @Post('login')
  @UseGuards(LoginRateLimitGuard, IpBlockGuard)
  @ApiOperation({
    summary: 'Sign in to the installer portal',
    description:
      'Answers with a session, or, for an installer who turned two-factor on, with a challenge to finish at POST /auth/installer/login/two-factor.',
  })
  @ApiLoginResponse()
  @ApiErrorResponse(400, 'The body failed validation', ApiValidationErrorBody)
  @ApiErrorResponse(401, '"Invalid credentials"')
  @ApiErrorResponse(403, '"This IP address is blocked"')
  @ApiErrorResponse(404, 'Not an active installer, or the account is disabled or unverified. Answered as a missing route.')
  @ApiErrorResponse(429, '"Too many login attempts, please try again later"')
  async login(
    @Body(BodyOrDataPipe) payload: LoginDto,
    @Req() req: { ip?: string },
    @Headers('user-agent') userAgent?: string,
  ) {
    const origin = loginOrigin(req, userAgent);
    const started = await this.runAuthUseCase(() =>
      this.loginEvents.recordingFailure(origin, payload.email, () => this.installerLogin.execute(payload)),
    );
    if (started.kind !== 'session') return challengeBody(started);
    await this.signedIn(started.session, origin);
    return started.session;
  }

  @Post('login/two-factor')
  @UseGuards(LoginRateLimitGuard, IpBlockGuard)
  @ApiOperation({
    summary: 'Finish installer sign-in with a code',
    description:
      'Takes the challenge from POST /auth/installer/login and a code from the authenticator, or a recovery code. Each challenge and each recovery code works once.',
  })
  @ApiCreatedResponse({ description: 'Signed in', type: LoginSessionResponse })
  @ApiErrorResponse(400, 'The body failed validation', ApiValidationErrorBody)
  @ApiErrorResponse(
    401,
    '"That code is not valid", or "This sign-in has expired; start again" for an expired, used, forged or other portal\'s challenge',
  )
  @ApiErrorResponse(403, '"This IP address is blocked"')
  @ApiErrorResponse(404, 'The installer was suspended since the password step. Answered as a missing route.')
  @CodeAttemptsLimited()
  async loginTwoFactor(
    @Body(BodyOrDataPipe) payload: LoginTwoFactorDto,
    @Req() req: { ip?: string },
    @Headers('user-agent') userAgent?: string,
  ) {
    const origin = loginOrigin(req, userAgent);
    const { session, secondFactor } = await this.runAuthUseCase(() =>
      this.loginEvents.recordingFailure(origin, null, () =>
        this.installerLogin.completeTwoFactor(payload.challengeToken, payload.code),
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
      action: 'installer.logged_in',
      entityType: 'user',
      entityId: user.id,
      summary: 'Installer signed in',
      actorId: user.id,
      actorRole: user.role,
      metadata: { email: user.email, ...(secondFactor && { secondFactor }) },
    });
  }
}
