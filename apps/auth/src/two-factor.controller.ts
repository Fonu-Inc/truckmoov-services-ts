import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  Inject,
  Post,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ActivityLogService } from './activity-log.service';
import { BaseAuthController } from './base.controller';
import { BodyOrDataPipe } from './body-or-data.pipe';
import { ForbiddenError } from './contexts/auth/session';
import { LoginRateLimitGuard } from './login-rate-limit.guard';
import { ApiErrorBody, ApiErrorResponse, ApiValidationErrorBody, CodeAttemptsLimited } from './dto/api-error.dto';
import { TwoFactorCodeDto } from './dto/two-factor.dto';
import {
  TwoFactorDisabledResponse,
  TwoFactorEnrolmentResponse,
  TwoFactorRecoveryCodesResponse,
  TwoFactorStatusResponse,
} from './dto/two-factor-response.dto';
import {
  BeginTwoFactorEnrolmentUseCase,
  ConfirmTwoFactorEnrolmentUseCase,
  DisableTwoFactorUseCase,
  GetTwoFactorStatusUseCase,
  InvalidTwoFactorCodeError,
  TwoFactorAlreadyEnrolledError,
  TwoFactorNotEnrolledError,
  TwoFactorRequiredError,
} from './two-factor.use-cases';
import { Portals, SignedIn } from '@shared/access';

@ApiTags('Two-factor')
@Portals('tenant', 'admin', 'installer')
@SignedIn()
@Controller('two-factor')
export class TwoFactorController extends BaseAuthController {
  constructor(
    @Inject(ActivityLogService) activityLogService: ActivityLogService,
    @Inject(BeginTwoFactorEnrolmentUseCase) private readonly begin: BeginTwoFactorEnrolmentUseCase,
    @Inject(ConfirmTwoFactorEnrolmentUseCase) private readonly confirm: ConfirmTwoFactorEnrolmentUseCase,
    @Inject(DisableTwoFactorUseCase) private readonly disable: DisableTwoFactorUseCase,
    @Inject(GetTwoFactorStatusUseCase) private readonly status: GetTwoFactorStatusUseCase,
  ) {
    super(activityLogService);
  }

  @Get()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Whether two-factor is on for the signed-in account' })
  @ApiOkResponse({ description: 'Two-factor status', type: TwoFactorStatusResponse })
  @ApiErrorResponse(401, 'Missing or invalid bearer token')
  @ApiErrorResponse(404, 'Not open to the caller\'s portal')
  async getStatus(@Headers('authorization') authorization?: string) {
    return this.run(() => this.status.execute(this.requireToken(authorization)));
  }

  @Post('enrol')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Begin two-factor enrolment',
    description: 'Returns the secret and an otpauth URI to render as a QR code. Shown once.',
  })
  @ApiCreatedResponse({ description: 'The enrolment secret', type: TwoFactorEnrolmentResponse })
  @ApiErrorResponse(401, 'Missing or invalid bearer token')
  @ApiErrorResponse(404, 'Not open to the caller\'s portal')
  @ApiErrorResponse(409, '"Two-factor is already set up for this account"')
  async beginEnrolment(@Headers('authorization') authorization?: string) {
    return this.run(() => this.begin.execute(this.requireToken(authorization)));
  }

  // Rate limited like sign-in: a six-digit code is guessable without it.
  @Post('enrol/confirm')
  @UseGuards(LoginRateLimitGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Confirm enrolment with a code',
    description: 'Turns two-factor on and returns the recovery codes. They are shown once.',
  })
  @ApiCreatedResponse({ description: 'Recovery codes', type: TwoFactorRecoveryCodesResponse })
  @ApiErrorResponse(400, '"That code is not valid", "Two-factor has not been set up for this account", or a validation error', ApiErrorBody, ApiValidationErrorBody)
  @ApiErrorResponse(401, 'Missing or invalid bearer token')
  @ApiErrorResponse(404, 'Not open to the caller\'s portal')
  @ApiErrorResponse(409, '"Two-factor is already set up for this account"')
  @CodeAttemptsLimited()
  async confirmEnrolment(
    @Body(BodyOrDataPipe) payload: TwoFactorCodeDto,
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.requireToken(authorization);
    const result = await this.run(() => this.confirm.execute(accessToken, payload.code));
    await this.tryRecordActivityFromAccessToken(accessToken, {
      service: 'auth',
      action: 'auth.two_factor.enabled',
      entityType: 'user',
      entityId: 'self',
      summary: 'Two-factor enabled',
    });
    return result;
  }

  @Post('disable')
  @UseGuards(LoginRateLimitGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Turn two-factor off',
    description: 'Needs a current code, and is refused while the platform requires two-factor.',
  })
  @ApiCreatedResponse({ description: 'Two-factor disabled', type: TwoFactorDisabledResponse })
  @ApiErrorResponse(400, '"That code is not valid", "Two-factor has not been set up for this account", or a validation error', ApiErrorBody, ApiValidationErrorBody)
  @ApiErrorResponse(401, 'Missing or invalid bearer token')
  @ApiErrorResponse(404, 'Not open to the caller\'s portal, or refused while the platform requires two-factor')
  @CodeAttemptsLimited()
  async disableTwoFactor(
    @Body(BodyOrDataPipe) payload: TwoFactorCodeDto,
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.requireToken(authorization);
    const result = await this.run(() => this.disable.execute(accessToken, payload.code));
    await this.tryRecordActivityFromAccessToken(accessToken, {
      service: 'auth',
      action: 'auth.two_factor.disabled',
      entityType: 'user',
      entityId: 'self',
      summary: 'Two-factor disabled',
    });
    return result;
  }

  private requireToken(authorization?: string): string {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    return accessToken;
  }

  private async run<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      this.rethrowCodeCooldown(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      if (error instanceof TwoFactorAlreadyEnrolledError) {
        throw new ConflictException(error.message);
      }
      if (error instanceof TwoFactorRequiredError) throw new ForbiddenException(error.message);
      if (
        error instanceof InvalidTwoFactorCodeError
        || error instanceof TwoFactorNotEnrolledError
      ) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }
}
