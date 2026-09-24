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
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Portals, SignedIn } from '@shared/access';
import { uploadLimits } from '@shared/http';
import { INSTALLATION_ORDER_STATUSES } from './contexts/installation/domain/installation-order';
import { MAX_INSTALLER_PHOTO_BYTES } from './contexts/installation/domain/installer-photo';
import {
  InstallerJobsUseCases,
  type JobScope,
} from './contexts/installation/application/use-cases/installer-jobs.use-cases';
import { InstallerProfileUseCases } from './contexts/installation/application/use-cases/installer-profile.use-cases';
import type { UploadedDocumentFile } from './contexts/onboarding/domain/onboarding-document-file';
import { UpdateInstallerProfileDto } from './dto/installer-portal.dto';
import { bearer, jobStatusFilter, mapped, numeric, ok } from './installation-http';

const SCOPES: readonly JobScope[] = ['active', 'history'];

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
  @ApiOperation({ summary: "Counters, status overview and today's jobs, in Lagos time" })
  async dashboard(@Headers('authorization') authorization?: string) {
    return ok(await mapped(() => this.jobs.dashboard(bearer(authorization))));
  }

  @Get('options')
  @ApiOperation({ summary: 'Checklist definition, evidence categories and time slot labels' })
  async options(@Headers('authorization') authorization?: string) {
    return ok(await mapped(() => this.jobs.options(bearer(authorization))));
  }

  @Get('jobs')
  @ApiOperation({ summary: 'Active jobs, or past ones with scope=history, with counts by status' })
  @ApiQuery({ name: 'scope', required: false, enum: SCOPES })
  @ApiQuery({ name: 'status', required: false, enum: INSTALLATION_ORDER_STATUSES })
  @ApiQuery({ name: 'search', required: false, description: 'Job number, customer, vehicle registration, city or state' })
  @ApiQuery({ name: 'completedFrom', required: false, description: 'YYYY-MM-DD' })
  @ApiQuery({ name: 'completedTo', required: false, description: 'YYYY-MM-DD' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
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

  @Get('jobs/:jobId')
  @ApiOperation({ summary: 'Customer and site, each unit, the checklist, evidence, notes, completion summary and allowed actions' })
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
