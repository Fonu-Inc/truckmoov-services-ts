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
  applyDecorators,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { ApiErrorResponse } from './dto/api-error.dto';
import {
  ApplicationTimelineResponse,
  ApprovedApplicationResponse,
  ChangesRequestedResponse,
  DocumentDecisionResponse,
  ProvisionedResponse,
  RejectedApplicationResponse,
  ReviewApplicationResponse,
  ReviewCountersResponse,
  ReviewQueueResponse,
  SetupLinkResentResponse,
} from './dto/onboarding-review-response.dto';
import { ActivityLogService } from './activity-log.service';
import { BaseAuthController } from './base.controller';
import { BodyOrDataPipe } from './body-or-data.pipe';
import { ForbiddenError } from './contexts/auth/session';
import {
  ApplicationDocumentNotFoundError,
  ApplicationDocumentsIncompleteError,
  ApplicationNotFoundError,
  ApplicationNotUnderReviewError,
  ApproveOnboardingApplicationUseCase,
  BusinessEmailInUseError,
  DecisionReasonRequiredError,
  GetOnboardingApplicationForReviewUseCase,
  CompleteProvisioningUseCase,
  GetOnboardingApplicationTimelineUseCase,
  GetOnboardingReviewSummaryUseCase,
  ListOnboardingApplicationsUseCase,
  RejectOnboardingApplicationUseCase,
  RequestOnboardingApplicationChangesUseCase,
  ResendOnboardingSetupLinkUseCase,
  ReviewOnboardingApplicationDocumentUseCase,
  SetupLinkNotResendableError,
} from '@auth/onboarding';
import { Portals, OnResource } from '@shared/access';

const REFUSED_AS_NOT_FOUND =
  'Under PORTAL_ENFORCEMENT or PERMISSION_ENFORCEMENT=enforce, a refused caller gets "Cannot <METHOD> <path>" here instead of a 403.';

const AdminErrors = (notFound?: string) =>
  applyDecorators(
    ApiErrorResponse(
      401,
      '"Missing authorization" without a bearer token, "Invalid or expired access token" for a bad one. Under PORTAL_ENFORCEMENT=enforce the guard answers first with "missing or invalid authorization".',
    ),
    ApiErrorResponse(
      403,
      'Not a platform admin: "You are not permitted to access this resource", or "This account has been disabled".',
    ),
    ApiErrorResponse(404, notFound ? `${notFound}. ${REFUSED_AS_NOT_FOUND}` : REFUSED_AS_NOT_FOUND),
  );

const NOT_FOUND = '"Application not found"';
const NOT_REVIEWABLE = 'Not submitted or under review: "An application in <status> state cannot be reviewed"';
const REASON_REQUIRED = 'Missing or blank reason: "A reason is required"';

const ReasonBody = () =>
  ApiBody({
    required: false,
    schema: {
      type: 'object',
      properties: { reason: { type: 'string', example: 'The CAC certificate is unreadable' } },
      description: 'May also be sent wrapped as { data: { reason } }.',
    },
  });

@ApiTags('System Onboarding Applications')
@ApiBearerAuth()
@Portals('admin')
@OnResource('admin.onboarding_review')
@Controller('system/onboarding/applications')
export class SystemOnboardingApplicationsController extends BaseAuthController {
  constructor(
    @Inject(ActivityLogService) activityLogService: ActivityLogService,
    @Inject(GetOnboardingReviewSummaryUseCase)
    private readonly getOnboardingReviewSummaryUseCase: GetOnboardingReviewSummaryUseCase,
    @Inject(ListOnboardingApplicationsUseCase)
    private readonly listApplications: ListOnboardingApplicationsUseCase,
    @Inject(GetOnboardingApplicationForReviewUseCase)
    private readonly getApplication: GetOnboardingApplicationForReviewUseCase,
    @Inject(GetOnboardingApplicationTimelineUseCase)
    private readonly getTimeline: GetOnboardingApplicationTimelineUseCase,
    @Inject(CompleteProvisioningUseCase)
    private readonly completeProvisioning: CompleteProvisioningUseCase,
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
  @ApiOkResponse({ description: 'Queue returned', type: ReviewQueueResponse })
  @AdminErrors()
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

  @Get('summary')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'KYC review counters',
    description: 'The four cards above the review queue.',
  })
  @ApiOkResponse({ description: 'Review counters', type: ReviewCountersResponse })
  @AdminErrors()
  async summary(@Headers('authorization') authorization?: string) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');

    try {
      return await this.getOnboardingReviewSummaryUseCase.execute(accessToken);
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      throw error;
    }
  }

  @Get(':applicationId')
  @ApiOperation({
    summary: 'Get an application for review',
    description:
      'Returns the application with its documents and short-lived download links.',
  })
  @ApiOkResponse({ description: 'Application returned', type: ReviewApplicationResponse })
  @AdminErrors(NOT_FOUND)
  async get(
    @Param('applicationId') applicationId: string,
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.requireAccessToken(authorization);
    return this.run(() =>
      this.getApplication.execute(accessToken, applicationId),
    );
  }

  @Post(':applicationId/provisioned')
  @ApiOperation({
    summary: 'Mark provisioning complete',
    description:
      'Says the devices and SIMs are allocated, which is what opens payment for the applicant.',
  })
  @ApiCreatedResponse({ description: 'Provisioning complete', type: ProvisionedResponse })
  @AdminErrors(NOT_FOUND)
  @ApiErrorResponse(
    500,
    'Not at the provisioning stage. The stage error is not mapped to an HTTP status, so it answers { statusCode: 500, message: "Internal server error" }.',
  )
  async provisioned(
    @Param('applicationId') applicationId: string,
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.requireAccessToken(authorization);
    const result = await this.run(() =>
      this.completeProvisioning.execute({ accessToken, applicationId }),
    );
    await this.recordDecision(accessToken, applicationId, 'provisioned');
    return result;
  }

  @Get(':applicationId/timeline')
  @ApiOperation({
    summary: 'Get an application timeline',
    description:
      'Everything that has happened to this application, oldest first, read from the audit trail.',
  })
  @ApiOkResponse({ description: 'Timeline returned', type: ApplicationTimelineResponse })
  @AdminErrors(NOT_FOUND)
  async timeline(
    @Param('applicationId') applicationId: string,
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.requireAccessToken(authorization);
    return this.run(() => this.getTimeline.execute(accessToken, applicationId));
  }

  @Patch(':applicationId/documents/:documentId/approve')
  @ApiOperation({ summary: 'Approve one document' })
  @ApiOkResponse({ description: 'Document approved. message is "Document approved".', type: DocumentDecisionResponse })
  @AdminErrors(`${NOT_FOUND}, or "Application document not found"`)
  @ApiErrorResponse(409, NOT_REVIEWABLE)
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
  @ReasonBody()
  @ApiOkResponse({ description: 'Document rejected. message is "Document rejected".', type: DocumentDecisionResponse })
  @ApiErrorResponse(400, REASON_REQUIRED)
  @AdminErrors(`${NOT_FOUND}, or "Application document not found"`)
  @ApiErrorResponse(409, NOT_REVIEWABLE)
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
  @ApiCreatedResponse({ description: 'Application approved', type: ApprovedApplicationResponse })
  @ApiErrorResponse(
    400,
    '"<n> required document(s) are missing", or "Some documents are rejected. Request changes instead of approving."',
  )
  @AdminErrors(NOT_FOUND)
  @ApiErrorResponse(
    409,
    `${NOT_REVIEWABLE}, or the email was taken meanwhile: "An account or application already exists for this email"`,
  )
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
  @ReasonBody()
  @ApiCreatedResponse({ description: 'Application rejected', type: RejectedApplicationResponse })
  @ApiErrorResponse(400, REASON_REQUIRED)
  @AdminErrors(NOT_FOUND)
  @ApiErrorResponse(409, NOT_REVIEWABLE)
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
  @ReasonBody()
  @ApiCreatedResponse({ description: 'Changes requested', type: ChangesRequestedResponse })
  @ApiErrorResponse(400, REASON_REQUIRED)
  @AdminErrors(NOT_FOUND)
  @ApiErrorResponse(409, NOT_REVIEWABLE)
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
  @ApiCreatedResponse({
    description:
      'Setup link issued. A failed send is still a 201: message is "The setup link could not be delivered" and data.setupLinkStatus is failed.',
    type: SetupLinkResentResponse,
  })
  @AdminErrors(NOT_FOUND)
  @ApiErrorResponse(
    409,
    '"Only an approved application has a setup link", or "This account has already been set up. Use password reset instead."',
  )
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
