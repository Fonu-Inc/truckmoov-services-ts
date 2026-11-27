import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Inject,
  Param,
  Patch,
  Post,
  Put,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Portals, SignedIn } from '@shared/access';
import { uploadLimits } from '@shared/http';
import { EVIDENCE_CATEGORIES, MAX_EVIDENCE_BYTES } from './contexts/installation/domain/installation-evidence';
import { INSTALLER_SUPPORT_CATEGORIES, MAX_TICKET_DESCRIPTION_LENGTH } from './contexts/installation/domain/installer-support';
import { ReportJobIssueUseCase } from './contexts/installation/application/use-cases/report-job-issue.use-case';
import { InstallerJobsUseCases } from './contexts/installation/application/use-cases/installer-jobs.use-cases';
import { InstallerJobActionsUseCases } from './contexts/installation/application/use-cases/installer-job-actions.use-cases';
import { InstallerJobRecordsUseCases } from './contexts/installation/application/use-cases/installer-job-records.use-cases';
import { RejectJobOfferUseCase } from './contexts/installation/application/use-cases/reject-job-offer.use-case';
import type { JobKnown } from './contexts/installation/application/use-cases/support/installation-job.views';
import type { UploadedDocumentFile } from './contexts/onboarding/domain/onboarding-document-file';
import { RejectJobOfferDto, SaveInstallerNotesDto, SetChecklistItemDto } from './dto/installer-portal.dto';
import { EvidenceLinkResponse, EvidenceUploadResponse, InstallerJobDetailResponse, RejectedOfferResponse } from './dto/installer-job-response.dto';
import { ApiErrorResponse } from './dto/api-error.dto';
import { bearer, mapped, ok } from './installation-http';
import { InstallerErrors, InvalidInstallerBody, JOB_CHANGED, JOB_NOT_FOUND } from './installer-openapi';

const JOB_CLOSED = '"A completed or cancelled installation cannot be changed"';
const Changed = (description: string) => ApiCreatedResponse({ description, type: InstallerJobDetailResponse });

/** Each change answers with the job as it now stands. */
@ApiTags('Installer portal')
@ApiBearerAuth()
@Portals('installer')
@SignedIn()
@Controller('installer/jobs/:jobId')
export class InstallerJobWorkController {
  constructor(
    @Inject(InstallerJobsUseCases) private readonly jobs: InstallerJobsUseCases,
    @Inject(InstallerJobActionsUseCases) private readonly actions: InstallerJobActionsUseCases,
    @Inject(InstallerJobRecordsUseCases) private readonly records: InstallerJobRecordsUseCases,
    @Inject(ReportJobIssueUseCase) private readonly issues: ReportJobIssueUseCase,
    @Inject(RejectJobOfferUseCase) private readonly rejections: RejectJobOfferUseCase,
  ) {}

  @Post('accept')
  @ApiOperation({ summary: 'Accept an offer: assigned becomes scheduled' })
  @Changed('The job, now scheduled. message is "Job accepted".')
  @InstallerErrors(JOB_NOT_FOUND)
  @ApiErrorResponse(409, `"A job that is <status> cannot be accepted", or ${JOB_CHANGED}`)
  async accept(@Param('jobId') jobId: string, @Headers('authorization') authorization?: string) {
    return this.changed(authorization, jobId, (token) => this.actions.accept(token, jobId), 'Job accepted');
  }

  @Post('reject')
  @ApiOperation({
    summary: 'Reject an offer with a reason; the job is offered to the next installer, never again to one who rejected it',
  })
  @ApiCreatedResponse({
    description: 'Offer rejected. message is "Offer rejected". The job is no longer the caller\'s, so only its id comes back.',
    type: RejectedOfferResponse,
  })
  @InvalidInstallerBody('"reason must be 3 to 500 characters" (after trimming).')
  @InstallerErrors(JOB_NOT_FOUND)
  @ApiErrorResponse(409, `"A job that is <status> cannot be rejected", or ${JOB_CHANGED}`)
  async reject(
    @Param('jobId') jobId: string,
    @Body() body: RejectJobOfferDto,
    @Headers('authorization') authorization?: string,
  ) {
    const token = bearer(authorization);
    return ok(await mapped(() => this.rejections.execute(token, jobId, body.reason)), 'Offer rejected');
  }

  @Post('start')
  @ApiOperation({ summary: 'Start the installation; every unit must have its device bound' })
  @Changed('The job, now in progress. message is "Installation started".')
  @InstallerErrors(JOB_NOT_FOUND)
  @ApiErrorResponse(
    409,
    `"A job that is <status> cannot be started", "Every unit needs its device bound before the installation can start", or ${JOB_CHANGED}`,
  )
  async start(@Param('jobId') jobId: string, @Headers('authorization') authorization?: string) {
    return this.changed(authorization, jobId, (token) => this.actions.start(token, jobId), 'Installation started');
  }

  @Put('checklist/:itemKey')
  @ApiOperation({ summary: 'Tick or untick a checklist item while the installation is in progress' })
  @ApiOkResponse({ description: 'The job', type: InstallerJobDetailResponse })
  @InvalidInstallerBody('checked must be a boolean.')
  @InstallerErrors(`${JOB_NOT_FOUND}, or "Checklist item not found"`)
  @ApiErrorResponse(
    409,
    '"Checklist items can be changed only while the installation is in progress", "Every unit needs a bound device before communication can be confirmed", "Every device on this job must be verified before communication can be confirmed", or "Upload at least one photo for each vehicle first (<n> of <m> vehicles covered)"',
  )
  @ApiErrorResponse(503, '"The device service could not be reached"')
  async setChecklistItem(
    @Param('jobId') jobId: string,
    @Param('itemKey') itemKey: string,
    @Body() body: SetChecklistItemDto,
    @Headers('authorization') authorization?: string,
  ) {
    return this.changed(authorization, jobId, (token) => this.records.setChecklistItem(token, jobId, itemKey, body.checked));
  }

  @Patch('notes')
  @ApiOperation({ summary: 'Save the installer notes (autosave), until the job is completed or cancelled' })
  @ApiOkResponse({ description: 'The job. message is "Notes saved".', type: InstallerJobDetailResponse })
  @InvalidInstallerBody('"notes must be text", or "notes must be 2000 characters or fewer".')
  @InstallerErrors(JOB_NOT_FOUND)
  @ApiErrorResponse(409, JOB_CLOSED)
  async saveNotes(
    @Param('jobId') jobId: string,
    @Body() body: SaveInstallerNotesDto,
    @Headers('authorization') authorization?: string,
  ) {
    return this.changed(authorization, jobId, (token) => this.records.saveNotes(token, jobId, body.notes ?? null), 'Notes saved');
  }

  @Post('evidence')
  @ApiOperation({ summary: 'Upload an evidence photo: JPG, PNG or WebP, up to 10 MB' })
  @ApiCreatedResponse({ description: 'The stored photo. message is "Evidence uploaded".', type: EvidenceUploadResponse })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['category', 'vehicleId', 'file'],
      properties: {
        category: { type: 'string', enum: Object.keys(EVIDENCE_CATEGORIES) },
        vehicleId: { type: 'string', description: "One of the job's vehicle ids" },
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  @UseInterceptors(FileInterceptor('file', uploadLimits(MAX_EVIDENCE_BYTES)))
  async uploadEvidence(
    @Param('jobId') jobId: string,
    @Body('category') category?: string,
    @Body('vehicleId') vehicleId?: string,
    @UploadedFile() file?: UploadedDocumentFile,
    @Headers('authorization') authorization?: string,
  ) {
    const token = bearer(authorization);
    return ok(await mapped(() => this.records.uploadEvidence(token, jobId, category, vehicleId, file)), 'Evidence uploaded');
  }

  @Get('evidence/:evidenceId')
  @ApiOperation({ summary: 'A short-lived download link for one evidence photo' })
  @ApiOkResponse({ description: 'The photo with a download url', type: EvidenceLinkResponse })
  async evidenceLink(
    @Param('jobId') jobId: string,
    @Param('evidenceId') evidenceId: string,
    @Headers('authorization') authorization?: string,
  ) {
    const token = bearer(authorization);
    return ok(await mapped(() => this.records.evidenceLink(token, jobId, evidenceId)));
  }

  @Delete('evidence/:evidenceId')
  @ApiOperation({
    summary: 'Remove one evidence photo from an open job; removing the last photo of a vehicle also unticks the evidence checklist item',
  })
  @ApiOkResponse({ description: 'The job without the photo. message is "Evidence removed".', type: InstallerJobDetailResponse })
  @InstallerErrors(`${JOB_NOT_FOUND}, or "Evidence not found"`)
  @ApiErrorResponse(409, JOB_CLOSED)
  async deleteEvidence(
    @Param('jobId') jobId: string,
    @Param('evidenceId') evidenceId: string,
    @Headers('authorization') authorization?: string,
  ) {
    return this.changed(authorization, jobId, (token) => this.records.deleteEvidence(token, jobId, evidenceId), 'Evidence removed');
  }

  @Post('devices/verification')
  @ApiOperation({
    summary:
      'Start or restart device verification for every device on the job. The device must still report telemetry to become verified. Read the status from units[].device.verificationStatus.',
  })
  @Changed('The job. message is "Verification started".')
  @InstallerErrors(JOB_NOT_FOUND)
  @ApiErrorResponse(
    409,
    '"Device verification can be started only while the installation is in progress", "Every unit needs a bound device before verification can start", or a sentence saying fleet refused a device, such as one that is not configured yet',
  )
  @ApiErrorResponse(503, '"The device service could not be reached"')
  async verifyDevices(@Param('jobId') jobId: string, @Headers('authorization') authorization?: string) {
    return this.changed(authorization, jobId, (token) => this.actions.verifyDevices(token, jobId), 'Verification started');
  }

  @Post('issues')
  @ApiOperation({ summary: 'Report an issue: raises a ticket with the optional photo and moves the job to issue_reported' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['issueType', 'description'],
      properties: {
        issueType: { type: 'string', enum: Object.keys(INSTALLER_SUPPORT_CATEGORIES) },
        description: { type: 'string', maxLength: MAX_TICKET_DESCRIPTION_LENGTH },
        photo: { type: 'string', format: 'binary', description: 'JPG, PNG or WebP, up to 10 MB' },
      },
    },
  })
  @UseInterceptors(FileInterceptor('photo', uploadLimits(MAX_EVIDENCE_BYTES)))
  @Changed('The job, now issue_reported. message is "Issue reported".')
  @ApiErrorResponse(
    400,
    '"issueType must be one of: <categories>", "A description is required", "description must be <n> characters or fewer", or "Issue photo rejected: <reason>"',
  )
  @InstallerErrors(JOB_NOT_FOUND)
  @ApiErrorResponse(409, `"An issue cannot be reported on a job that is <status>", or ${JOB_CHANGED}`)
  @ApiErrorResponse(413, 'The photo is over 10 MB: { statusCode: 413, message: "File too large", error: "Payload Too Large" }')
  async reportIssue(
    @Param('jobId') jobId: string,
    @Body('issueType') issueType?: string,
    @Body('description') description?: string,
    @UploadedFile() photo?: UploadedDocumentFile,
    @Headers('authorization') authorization?: string,
  ) {
    return this.changed(authorization, jobId, async (token) => {
      await this.issues.execute(token, jobId, { issueType, description, photo });
    }, 'Issue reported');
  }

  @Post('complete')
  @ApiOperation({ summary: 'Complete the installation: all 15 checklist items, devices verified, evidence uploaded' })
  @Changed('The job, now completed. message is "Installation completed".')
  @InstallerErrors(`${JOB_NOT_FOUND}, or "The onboarding for this job no longer exists"`)
  @ApiErrorResponse(
    409,
    `"Only an installation in progress can be completed", "<n>/15 checklist items are complete", a checklist gate refusal, the onboarding stage refusal, "Unit <n> has no vehicle or device to hand over", or ${JOB_CHANGED}`,
  )
  @ApiErrorResponse(422, "Fleet refused the hand-over, such as a device outside the customer's fleet")
  @ApiErrorResponse(503, '"The device service could not be reached"')
  async complete(@Param('jobId') jobId: string, @Headers('authorization') authorization?: string) {
    return this.changed(authorization, jobId, (token) => this.actions.complete(token, jobId), 'Installation completed');
  }

  private async changed(
    authorization: string | undefined,
    jobId: string,
    change: (token: string) => Promise<JobKnown | void>,
    message = 'success',
  ) {
    const token = bearer(authorization);
    return ok(
      await mapped(async () => {
        const known = await change(token);
        return this.jobs.detail(token, jobId, known ?? {});
      }),
      message,
    );
  }
}
