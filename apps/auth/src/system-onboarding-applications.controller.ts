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
  Param,
  Patch,
  Post,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { ActivityLogService } from './activity-log.service';
import { BaseAuthController } from './base.controller';
import { BodyOrDataPipe } from './body-or-data.pipe';
import { ForbiddenError } from './contexts/auth/session';
import {
  ApplicationDocumentsIncompleteError,
  ApproveOnboardingApplicationUseCase,
  RejectOnboardingApplicationUseCase,
  RequestOnboardingApplicationChangesUseCase,
  ResendOnboardingSetupLinkUseCase,
  SetupLinkNotResendableError,
} from './decide-onboarding-application.use-cases';
import {
  ApplicationDocumentNotFoundError,
  ApplicationNotUnderReviewError,
  DecisionReasonRequiredError,
  GetOnboardingApplicationForReviewUseCase,
  ListOnboardingApplicationsUseCase,
  ReviewOnboardingApplicationDocumentUseCase,
} from './review-onboarding-application.use-cases';
import {
  ApplicationNotFoundError,
  BusinessEmailInUseError,
} from './onboarding-application.support';

@ApiTags('System Onboarding Applications')
@ApiBearerAuth()
@Controller('system/onboarding/applications')
export class SystemOnboardingApplicationsController extends BaseAuthController {
  constructor(
    @Inject(ActivityLogService) activityLogService: ActivityLogService,
    @Inject(ListOnboardingApplicationsUseCase)
    private readonly listApplications: ListOnboardingApplicationsUseCase,
    @Inject(GetOnboardingApplicationForReviewUseCase)
    private readonly getApplication: GetOnboardingApplicationForReviewUseCase,
    @Inject(ReviewOnboardingApplicationDocumentUseCase)
    private readonly reviewDocument: ReviewOnboardingApplicationDocumentUseCase,
    @Inject(ApproveOnboardingApplicationUseCase)
    private readonly approveApplication: ApproveOnboardingApplicationUseCase,
    @Inject(RejectOnboardingApplicationUseCase)
    private readonly rejectApplication: RejectOnboardingApplicationUseCase,
    @Inject(RequestOnboardingApplicationChangesUseCase)
    private readonly requestChanges: RequestOnboardingApplicationChangesUseCase,
    @Inject(ResendOnboardingSetupLinkUseCase)
    private readonly resendSetupLink: ResendOnboardingSetupLinkUseCase,
  ) {
    super(activityLogService);
  }

  @Get()
  @ApiOperation({
    summary: 'List onboarding applications',
    description:
      'Returns the review queue of landing-page applications, oldest first.',
  })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'applicantType', required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiOkResponse({ description: 'Queue returned' })
  @ApiForbiddenResponse({ description: 'Caller is not a platform admin' })
  async list(
    @Headers('authorization') authorization?: string,
    @Query('status') status?: string,
    @Query('applicantType') applicantType?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const accessToken = this.requireAccessToken(authorization);
    return this.run(() =>
      this.listApplications.execute(accessToken, {
        status,
        applicantType,
        search,
        page: this.parseNumericQuery(page),
        limit: this.parseNumericQuery(limit),
      }),
    );
  }

  @Get(':applicationId')
  @ApiOperation({
    summary: 'Get an application for review',
    description:
      'Returns the application with its documents and short-lived download links.',
  })
  @ApiOkResponse({ description: 'Application returned' })
  @ApiNotFoundResponse({ description: 'Application not found' })
  async get(
    @Param('applicationId') applicationId: string,
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.requireAccessToken(authorization);
    return this.run(() =>
      this.getApplication.execute(accessToken, applicationId),
    );
  }

  @Patch(':applicationId/documents/:documentId/approve')
  @ApiOperation({ summary: 'Approve one document' })
  @ApiOkResponse({ description: 'Document approved' })
  @ApiNotFoundResponse({ description: 'Application or document not found' })
  async approveDocument(
    @Param('applicationId') applicationId: string,
    @Param('documentId') documentId: string,
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.requireAccessToken(authorization);
    return this.run(async () => {
      const result = await this.reviewDocument.execute({
        accessToken,
        applicationId,
        documentId,
        decision: 'approved',
      });
      await this.recordDecision(accessToken, applicationId, 'document.approved');
      return result;
    });
  }

  @Patch(':applicationId/documents/:documentId/reject')
  @ApiOperation({
    summary: 'Reject one document',
    description:
      'Marks a single document rejected with a reason. Use "request changes" to send the application back to the applicant.',
  })
  @ApiOkResponse({ description: 'Document rejected' })
  @ApiBadRequestResponse({ description: 'A reason is required' })
  async rejectDocument(
    @Param('applicationId') applicationId: string,
    @Param('documentId') documentId: string,
    @Body(BodyOrDataPipe) payload: { reason?: string },
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.requireAccessToken(authorization);
    return this.run(async () => {
      const result = await this.reviewDocument.execute({
        accessToken,
        applicationId,
        documentId,
        decision: 'rejected',
        reason: payload?.reason,
      });
      await this.recordDecision(accessToken, applicationId, 'document.rejected');
      return result;
    });
  }

  @Post(':applicationId/approve')
  @ApiOperation({
    summary: 'Approve an application',
    description:
      'Creates the tenant, transfers document ownership and emails the account setup link. Refused while any document is rejected or missing.',
  })
  @ApiOkResponse({ description: 'Application approved' })
  @ApiConflictResponse({
    description: 'Application is not reviewable, or the email is now taken',
  })
  @ApiBadRequestResponse({ description: 'Documents are missing or rejected' })
  async approve(
    @Param('applicationId') applicationId: string,
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.requireAccessToken(authorization);
    return this.run(async () => {
      const result = await this.approveApplication.execute({
        accessToken,
        applicationId,
      });
      await this.recordDecision(accessToken, applicationId, 'application.approved');
      return result;
    });
  }

  @Post(':applicationId/reject')
  @ApiOperation({
    summary: 'Reject an application',
    description:
      'Terminal decision. No tenant is created and the applicant is emailed the reason.',
  })
  @ApiOkResponse({ description: 'Application rejected' })
  @ApiBadRequestResponse({ description: 'A reason is required' })
  async reject(
    @Param('applicationId') applicationId: string,
    @Body(BodyOrDataPipe) payload: { reason?: string },
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.requireAccessToken(authorization);
    return this.run(async () => {
      const result = await this.rejectApplication.execute({
        accessToken,
        applicationId,
        reason: payload?.reason,
      });
      await this.recordDecision(accessToken, applicationId, 'application.rejected');
      return result;
    });
  }

  @Post(':applicationId/request-changes')
  @ApiOperation({
    summary: 'Send an application back for correction',
    description:
      'Returns the application to the applicant with a reason and a fresh resume link. Not terminal.',
  })
  @ApiOkResponse({ description: 'Changes requested' })
  @ApiBadRequestResponse({ description: 'A reason is required' })
  async changes(
    @Param('applicationId') applicationId: string,
    @Body(BodyOrDataPipe) payload: { reason?: string },
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.requireAccessToken(authorization);
    return this.run(async () => {
      const result = await this.requestChanges.execute({
        accessToken,
        applicationId,
        reason: payload?.reason,
      });
      await this.recordDecision(
        accessToken,
        applicationId,
        'application.changes_requested',
      );
      return result;
    });
  }

  @Post(':applicationId/setup-link/resend')
  @ApiOperation({
    summary: 'Resend the account setup link',
    description:
      'Issues a new setup link for an approved application and invalidates the previous one. Refused once the account exists.',
  })
  @ApiOkResponse({ description: 'Setup link resent' })
  @ApiConflictResponse({
    description: 'Application is not approved, or the account already exists',
  })
  async resend(
    @Param('applicationId') applicationId: string,
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.requireAccessToken(authorization);
    return this.run(async () => {
      const result = await this.resendSetupLink.execute({
        accessToken,
        applicationId,
      });
      await this.recordDecision(
        accessToken,
        applicationId,
        'application.setup_link_resent',
      );
      return result;
    });
  }

  private requireAccessToken(authorization?: string): string {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    return accessToken;
  }

  private async recordDecision(
    accessToken: string,
    applicationId: string,
    action: string,
  ): Promise<void> {
    await this.tryRecordActivity({
      tenantId: 'system',
      service: 'auth',
      action: `onboarding.${action}`,
      entityType: 'onboarding_application',
      entityId: applicationId,
      summary: `Onboarding ${action.replace(/[._]/g, ' ')}`,
      actorId: null,
      actorRole: null,
      metadata: { applicationId },
    });
  }

  private async run<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) {
        throw new ForbiddenException(error.message);
      }
      if (
        error instanceof DecisionReasonRequiredError ||
        error instanceof ApplicationDocumentsIncompleteError
      ) {
        throw new BadRequestException(error.message);
      }
      if (
        error instanceof ApplicationNotFoundError ||
        error instanceof ApplicationDocumentNotFoundError
      ) {
        throw new NotFoundException(error.message);
      }
      if (
        error instanceof ApplicationNotUnderReviewError ||
        error instanceof BusinessEmailInUseError ||
        error instanceof SetupLinkNotResendableError
      ) {
        throw new ConflictException(error.message);
      }
      throw error;
    }
  }
}
