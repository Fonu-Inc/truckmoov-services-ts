import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { Portals, SignedIn } from '@shared/access';
import { uploadLimits } from '@shared/http';
import { INSTALLATION_ORDER_STATUSES } from './contexts/installation/domain/installation-order';
import { MAX_INSTALLER_PHOTO_BYTES } from './contexts/installation/domain/installer-photo';
import {
  InstallerJobsUseCases,
  type JobScope,
} from './contexts/installation/application/use-cases/installer-jobs.use-cases';
import {
  HISTORY_EXPORT_CAP,
  HISTORY_EXPORT_COLUMNS,
} from './contexts/installation/application/use-cases/support/installation-history-export';
import { InstallerProfileUseCases } from './contexts/installation/application/use-cases/installer-profile.use-cases';
import type { UploadedDocumentFile } from './contexts/onboarding/domain/onboarding-document-file';
import { UpdateInstallerProfileDto } from './dto/installer-portal.dto';
import { bearer, jobStatusFilter, mapped, numeric, ok } from './installation-http';
import { InstallerErrors, JOB_NOT_FOUND } from './installer-openapi';
import { ApiErrorResponse } from './dto/api-error.dto';
import {
  InstallerDashboardResponse,
  InstallerJobDetailResponse,
  InstallerJobPageResponse,
  InstallerOptionsResponse,
} from './dto/installer-job-response.dto';

const SCOPES: readonly JobScope[] = ['active', 'history'];
const SEARCH_FIELDS = 'Contained in the job number (FL-2201 or 2201), company name, address, city, state or a vehicle registration on the job';
const DATE_ERRORS = '"completedFrom must be a date (YYYY-MM-DD)" (likewise completedTo)';

type CsvResponse = { setHeader(name: string, value: string): void };

function scopeFilter(value?: string): JobScope | undefined {
  if (!value) return undefined;
  if (!SCOPES.includes(value as JobScope)) throw new BadRequestException(`scope must be one of: ${SCOPES.join(', ')}`);
  return value as JobScope;
}

/** The installer's own jobs and profile. Another installer's job answers as a missing one. */
@ApiTags('Installer portal')
@ApiBearerAuth()
@Portals('installer')
@SignedIn()
@Controller('installer')
export class InstallerPortalController {
  constructor(
    @Inject(InstallerJobsUseCases) private readonly jobs: InstallerJobsUseCases,
    @Inject(InstallerProfileUseCases) private readonly profile: InstallerProfileUseCases,
  ) {}

  @Get('dashboard')
  @ApiOperation({ summary: "Counters, offers, today's and upcoming jobs, monthly activity and recent events, in Lagos time" })
  @ApiOkResponse({ description: 'The dashboard', type: InstallerDashboardResponse })
  @InstallerErrors()
  async dashboard(@Headers('authorization') authorization?: string) {
    return ok(await mapped(() => this.jobs.dashboard(bearer(authorization))));
  }

  @Get('options')
  @ApiOperation({ summary: 'Checklist definition, evidence categories, support categories, tips, priorities and ticket statuses' })
  @ApiOkResponse({ description: 'The options', type: InstallerOptionsResponse })
  @InstallerErrors()
  async options(@Headers('authorization') authorization?: string) {
    return ok(await mapped(() => this.jobs.options(bearer(authorization))));
  }

  @Get('jobs')
  @ApiOperation({
    summary: 'Open jobs, or completed ones with scope=history, with the page counters',
    description: 'Offers: status=assigned. Issues Reported: status=issue_reported. Cancelled jobs are counted but listed in neither scope.',
  })
  @ApiQuery({ name: 'scope', required: false, enum: SCOPES, description: 'active (default): every status but completed and cancelled; history: completed' })
  @ApiQuery({ name: 'status', required: false, enum: INSTALLATION_ORDER_STATUSES, description: 'Narrows the scope; a status outside it lists nothing' })
  @ApiQuery({ name: 'search', required: false, description: SEARCH_FIELDS })
  @ApiQuery({ name: 'completedFrom', required: false, description: 'YYYY-MM-DD' })
  @ApiQuery({ name: 'completedTo', required: false, description: 'YYYY-MM-DD' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false, description: 'Default 20, at most 100' })
  @ApiOkResponse({ description: 'Page of jobs, soonest first; history by completion, newest first', type: InstallerJobPageResponse })
  @ApiErrorResponse(400, `"scope must be one of: active, history", "status must be one of: <statuses>", or ${DATE_ERRORS}.`)
  @InstallerErrors()
  async list(
    @Query('scope') scope?: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('completedFrom') completedFrom?: string,
    @Query('completedTo') completedTo?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Headers('authorization') authorization?: string,
  ) {
    const query = {
      scope: scopeFilter(scope),
      status: jobStatusFilter(status),
      search,
      completedFrom,
      completedTo,
      page: numeric(page),
      limit: numeric(limit),
    };
    return ok(await mapped(() => this.jobs.list(bearer(authorization), query)));
  }

  @Get('jobs/export')
  @ApiOperation({
    summary: 'Installation History as CSV',
    description: `The completed jobs the history tab lists, newest completion first, capped at ${HISTORY_EXPORT_CAP} rows. Completion Date (YYYY-MM-DD) and Time (HH:mm, 24-hour) are written in timezone.`,
  })
  @ApiQuery({ name: 'search', required: false, description: SEARCH_FIELDS })
  @ApiQuery({ name: 'completedFrom', required: false, description: 'YYYY-MM-DD, Lagos day' })
  @ApiQuery({ name: 'completedTo', required: false, description: 'YYYY-MM-DD, Lagos day, inclusive' })
  @ApiQuery({ name: 'timezone', required: false, description: 'IANA time zone, default Africa/Lagos', example: 'Africa/Lagos' })
  @ApiProduces('text/csv')
  @ApiOkResponse({
    description: `CSV with the columns ${HISTORY_EXPORT_COLUMNS.join(', ')}. Text starting with =, +, -, @ is prefixed with an apostrophe.`,
    schema: { type: 'string', format: 'binary' },
  })
  @ApiErrorResponse(400, `${DATE_ERRORS}, or "timezone must be an IANA time zone, such as Africa/Lagos".`)
  @InstallerErrors()
  async exportHistory(
    @Res({ passthrough: true }) response: CsvResponse,
    @Query('search') search?: string,
    @Query('completedFrom') completedFrom?: string,
    @Query('completedTo') completedTo?: string,
    @Query('timezone') timezone?: string,
    @Headers('authorization') authorization?: string,
  ) {
    const query = { search, completedFrom, completedTo, timezone };
    const csv = await mapped(() => this.jobs.exportHistory(bearer(authorization), query));
    response.setHeader('Content-Type', 'text/csv; charset=utf-8');
    response.setHeader('Content-Disposition', 'attachment; filename="installation-history.csv"');
    return new StreamableFile(Buffer.from(csv, 'utf8'));
  }

  @Get('jobs/:jobId')
  @ApiOperation({ summary: 'Customer and site, each unit, the checklist, evidence, notes, completion summary and allowed actions' })
  @ApiOkResponse({ description: 'The job', type: InstallerJobDetailResponse })
  @InstallerErrors(JOB_NOT_FOUND)
  async detail(@Param('jobId') jobId: string, @Headers('authorization') authorization?: string) {
    return ok(await mapped(() => this.jobs.detail(bearer(authorization), jobId)));
  }

  @Get('profile')
  @ApiOperation({ summary: 'Personal details and the read-only installer record' })
  async getProfile(@Headers('authorization') authorization?: string) {
    return ok(await mapped(() => this.profile.get(bearer(authorization))));
  }

  @Patch('profile')
  @ApiOperation({ summary: 'Update name, phone, state and city' })
  async updateProfile(@Body() body: UpdateInstallerProfileDto, @Headers('authorization') authorization?: string) {
    return ok(await mapped(() => this.profile.update(bearer(authorization), body)), 'Profile updated');
  }

  @Post('profile/photo')
  @ApiOperation({ summary: 'Upload a profile photo: JPG or PNG, up to 2 MB' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', required: ['file'], properties: { file: { type: 'string', format: 'binary' } } } })
  @UseInterceptors(FileInterceptor('file', uploadLimits(MAX_INSTALLER_PHOTO_BYTES)))
  async uploadPhoto(@UploadedFile() file?: UploadedDocumentFile, @Headers('authorization') authorization?: string) {
    return ok(await mapped(() => this.profile.uploadPhoto(bearer(authorization), file)), 'Photo updated');
  }
}
