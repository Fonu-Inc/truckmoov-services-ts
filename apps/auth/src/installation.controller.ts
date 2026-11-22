import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  Headers,
  Inject,
  NotFoundException,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { rethrowActorError } from './base.controller';
import { ApiErrorResponse } from './dto/api-error.dto';
import {
  CancelInstallationDto,
  InstallationCancellationResponse,
  InstallationConfirmationResponse,
  InstallationFeedbackResponse,
  InstallationStatusResponse,
  SubmitInstallationFeedbackDto,
} from './dto/installation-response.dto';
import {
  CancelInstallationUseCase,
  InstallationJobConflictError,
  InstallationNotCancellableError,
  ConfirmInstallationUseCase,
  FeedbackAlreadySubmittedError,
  GetInstallationStatusUseCase,
  InstallationNotCompletedError,
  SubmitInstallationFeedbackUseCase,
  InstallationNotConfirmableError,
  InvalidInstallationDateError,
  NoInstallationOrderError,
} from '@auth/installation';
import { OnboardingValidationError } from '@auth/onboarding/domain/onboarding-application.validation';
import { Portals, OnResource } from '@shared/access';

const MissingToken = () =>
  ApiErrorResponse(
    401,
    '"Missing authorization" without a bearer token, "Invalid or expired access token" for a bad one, "User not found" when the account is gone. Under PORTAL_ENFORCEMENT=enforce the guard answers first with "missing or invalid authorization".',
  );

const Disabled = () =>
  ApiErrorResponse(
    403,
    `"This account has been disabled". Under PORTAL_ENFORCEMENT or PERMISSION_ENFORCEMENT=enforce it is a 404 "Cannot <METHOD> <path>" instead.`,
  );

const OTHER_PORTAL = 'a caller outside the tenant portal, or a disabled account, gets "Cannot <METHOD> <path>"';

/**
 * The customer's view of their own installation, once they have an account.
 *
 * Separate from the application endpoints: those are reached with a draft
 * token by somebody who has not signed in, and these are reached with a bearer
 * token by a tenant who has.
 */
@ApiTags('Installation')
@Portals('tenant')
@OnResource('tenant.onboarding')
@Controller('installation')
export class InstallationController {
  constructor(
    @Inject(GetInstallationStatusUseCase)
    private readonly getStatus: GetInstallationStatusUseCase,
    @Inject(ConfirmInstallationUseCase)
    private readonly confirm: ConfirmInstallationUseCase,
    @Inject(CancelInstallationUseCase)
    private readonly cancel: CancelInstallationUseCase,
    @Inject(SubmitInstallationFeedbackUseCase)
    private readonly feedback: SubmitInstallationFeedbackUseCase,
  ) {}

  @Get('status')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get the installation status',
    description:
      'The booking, the assigned installer and how far the onboarding has reached.',
  })
  @ApiOkResponse({
    description: 'Status returned. Nothing booked is still a 200 with data.order null.',
    type: InstallationStatusResponse,
  })
  @MissingToken()
  @Disabled()
  @ApiErrorResponse(404, `Only under access enforcement: ${OTHER_PORTAL}`)
  async status(@Headers('authorization') authorization?: string) {
    return this.run(() => this.getStatus.execute(this.token(authorization)));
  }

  @Post('confirm')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Confirm the installation',
    description:
      'Checks every fitted device is reporting before the onboarding closes. A device that is silent is named, so the customer knows which vehicle to go back to.',
  })
  @ApiCreatedResponse({
    description:
      'Checked. data.stage is fleet_ready when every device reports; otherwise connectivity_verification, with the silent devices in data.failures and the reason in message.',
    type: InstallationConfirmationResponse,
  })
  @MissingToken()
  @Disabled()
  @ApiErrorResponse(404, `"No installation is scheduled for this account". Under access enforcement: ${OTHER_PORTAL}`)
  @ApiErrorResponse(
    409,
    '"The installer has not completed this installation yet", or "An onboarding at the <stage> stage cannot be confirmed"',
  )
  async confirmInstallation(@Headers('authorization') authorization?: string) {
    return this.run(() => this.confirm.execute(this.token(authorization)));
  }

  @Post('cancel')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Cancel the installation',
    description:
      'The customer calls off their booking before the installer starts. Only the order is cancelled; the onboarding and any payment are settled by the platform. Repeating it on a cancelled order returns the same answer.',
  })
  @ApiCreatedResponse({ description: 'Cancelled, or already was.', type: InstallationCancellationResponse })
  @ApiErrorResponse(400, '"reason must be 1000 characters or fewer"')
  @MissingToken()
  @ApiErrorResponse(403, '"You are not permitted to cancel this installation" for a role other than OWNER_OPERATOR or ENTERPRISE_ADMIN, or "This account has been disabled"')
  @ApiErrorResponse(404, `"No installation is scheduled for this account". Under access enforcement: ${OTHER_PORTAL}`)
  @ApiErrorResponse(409, '"An installation that is in_progress cannot be cancelled" (or completed), or the job changed while the request was in flight')
  async cancelInstallation(
    @Body() body: CancelInstallationDto,
    @Headers('authorization') authorization?: string,
  ) {
    return this.run(() => this.cancel.execute(this.token(authorization), body?.reason));
  }

  @Post('feedback')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Rate the installation',
    description:
      'The customer rates a completed installation, once. This closes the request and tells the installer.',
  })
  @ApiCreatedResponse({ description: 'Saved.', type: InstallationFeedbackResponse })
  @ApiErrorResponse(400, '"rating must be a whole number from 1 to 5", or "comment must be 1000 characters or fewer"')
  @MissingToken()
  @ApiErrorResponse(403, '"You are not permitted to rate this installation" for a role other than OWNER_OPERATOR or ENTERPRISE_ADMIN, or "This account has been disabled"')
  @ApiErrorResponse(404, `"No installation is scheduled for this account". Under access enforcement: ${OTHER_PORTAL}`)
  @ApiErrorResponse(409, '"Feedback can be given once the installation is completed", or "Feedback has already been given for this installation"')
  async submitFeedback(
    @Body() body: SubmitInstallationFeedbackDto,
    @Headers('authorization') authorization?: string,
  ) {
    return this.run(() => this.feedback.execute(this.token(authorization), { rating: body?.rating, comment: body?.comment }));
  }

  private token(authorization?: string): string {
    const [scheme, token] = (authorization ?? '').split(' ');
    if (scheme?.toLowerCase() !== 'bearer' || !token) {
      throw new UnauthorizedException('Missing authorization');
    }
    return token;
  }

  private async run<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      rethrowActorError(error);
      if (error instanceof NoInstallationOrderError) {
        throw new NotFoundException(error.message);
      }
      if (error instanceof OnboardingValidationError) {
        throw new BadRequestException(error.message);
      }
      if (
        error instanceof InstallationNotConfirmableError ||
        error instanceof InstallationNotCancellableError ||
        error instanceof InstallationNotCompletedError ||
        error instanceof FeedbackAlreadySubmittedError ||
        error instanceof InstallationJobConflictError
      ) {
        throw new ConflictException(error.message);
      }
      if (error instanceof InvalidInstallationDateError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }
}
