import {
  Body,
  Controller,
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
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Portals, SignedIn } from '@shared/access';
import { uploadLimits } from '@shared/http';
import { EVIDENCE_CATEGORIES, MAX_EVIDENCE_BYTES } from './contexts/installation/domain/installation-evidence';
import { INSTALLER_SUPPORT_CATEGORIES, MAX_TICKET_DESCRIPTION_LENGTH } from './contexts/installation/domain/installer-support';
import { ReportJobIssueUseCase } from './contexts/installation/application/use-cases/report-job-issue.use-case';
import { InstallerJobsUseCases } from './contexts/installation/application/use-cases/installer-jobs.use-cases';
import { InstallerJobActionsUseCases } from './contexts/installation/application/use-cases/installer-job-actions.use-cases';
import { InstallerJobRecordsUseCases } from './contexts/installation/application/use-cases/installer-job-records.use-cases';
import type { UploadedDocumentFile } from './contexts/onboarding/domain/onboarding-document-file';
import { SaveInstallerNotesDto, SetChecklistItemDto } from './dto/installer-portal.dto';
import { bearer, mapped, ok } from './installation-http';

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
  ) {}

  @Post('accept')
  @ApiOperation({ summary: 'Accept an assigned job' })
  async accept(@Param('jobId') jobId: string, @Headers('authorization') authorization?: string) {
    return this.changed(authorization, jobId, (token) => this.actions.accept(token, jobId), 'Job accepted');
  }

  @Post('start')
  @ApiOperation({ summary: 'Start the installation; every unit must have its device bound' })
  async start(@Param('jobId') jobId: string, @Headers('authorization') authorization?: string) {
    return this.changed(authorization, jobId, (token) => this.actions.start(token, jobId), 'Installation started');
  }

  @Put('checklist/:itemKey')
  @ApiOperation({ summary: 'Tick or untick a checklist item while the installation is in progress' })
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
  async saveNotes(
    @Param('jobId') jobId: string,
    @Body() body: SaveInstallerNotesDto,
    @Headers('authorization') authorization?: string,
  ) {
    return this.changed(authorization, jobId, (token) => this.records.saveNotes(token, jobId, body.notes ?? null), 'Notes saved');
  }

  @Post('evidence')
  @ApiOperation({ summary: 'Upload an evidence photo: JPG, PNG or WebP, up to 10 MB' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['category', 'file'],
      properties: {
        category: { type: 'string', enum: Object.keys(EVIDENCE_CATEGORIES) },
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  @UseInterceptors(FileInterceptor('file', uploadLimits(MAX_EVIDENCE_BYTES)))
  async uploadEvidence(
    @Param('jobId') jobId: string,
    @Body('category') category?: string,
    @UploadedFile() file?: UploadedDocumentFile,
    @Headers('authorization') authorization?: string,
  ) {
    const token = bearer(authorization);
    return ok(await mapped(() => this.records.uploadEvidence(token, jobId, category, file)), 'Evidence uploaded');
  }

  @Get('evidence/:evidenceId')
  @ApiOperation({ summary: 'A short-lived download link for one evidence photo' })
  async evidenceLink(
    @Param('jobId') jobId: string,
    @Param('evidenceId') evidenceId: string,
    @Headers('authorization') authorization?: string,
  ) {
    const token = bearer(authorization);
    return ok(await mapped(() => this.records.evidenceLink(token, jobId, evidenceId)));
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
  async complete(@Param('jobId') jobId: string, @Headers('authorization') authorization?: string) {
    return this.changed(authorization, jobId, (token) => this.actions.complete(token, jobId), 'Installation completed');
  }

  private async changed(
    authorization: string | undefined,
    jobId: string,
    change: (token: string) => Promise<void>,
    message = 'success',
  ) {
    const token = bearer(authorization);
    return ok(
      await mapped(async () => {
        await change(token);
        return this.jobs.detail(token, jobId);
      }),
      message,
    );
  }
}
