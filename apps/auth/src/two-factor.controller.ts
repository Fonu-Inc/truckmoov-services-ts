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
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ActivityLogService } from './activity-log.service';
import { BaseAuthController } from './base.controller';
import { BodyOrDataPipe } from './body-or-data.pipe';
import { ForbiddenError } from './contexts/auth/session';
import { TwoFactorCodeDto } from './dto/two-factor.dto';
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
import { Portals } from '@shared/access';

@ApiTags('Two-factor')
@Portals('tenant', 'admin')
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
  @ApiOkResponse({ description: 'Two-factor status' })
  async getStatus(@Headers('authorization') authorization?: string) {
    return this.run(() => this.status.execute(this.requireToken(authorization)));
  }

  @Post('enrol')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Begin two-factor enrolment',
    description: 'Returns the secret and an otpauth URI to render as a QR code. Shown once.',
  })
  @ApiOkResponse({ description: 'The enrolment secret' })
  async beginEnrolment(@Headers('authorization') authorization?: string) {
    return this.run(() => this.begin.execute(this.requireToken(authorization)));
  }

  @Post('enrol/confirm')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Confirm enrolment with a code',
    description: 'Turns two-factor on and returns the recovery codes. They are shown once.',
  })
  @ApiOkResponse({ description: 'Recovery codes' })
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
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Turn two-factor off',
    description: 'Needs a current code, and is refused while the platform requires two-factor.',
  })
  @ApiOkResponse({ description: 'Two-factor disabled' })
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
