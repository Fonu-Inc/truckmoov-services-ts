import {
  BadRequestException,
  ConflictException,
  Res,
  ForbiddenException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Inject,
  Headers,
  StreamableFile,
  Patch,
  Delete,
  UnauthorizedException,
  Query,
} from '@nestjs/common';
import {
  ApiUnauthorizedResponse,
  ApiOkResponse,
  ApiForbiddenResponse,
  ApiTags,
  ApiProduces,
  ApiConflictResponse,
  ApiNotFoundResponse,
  ApiBearerAuth,
  ApiBadRequestResponse,
  ApiOperation,
  ApiQuery,
} from '@nestjs/swagger';
import { ActivityLogService } from './activity-log.service';
import { SimRequestAlreadyProcessedError, SimRequestNotFoundError, ApproveSystemSimRequestUseCase } from './approve-system-sim-request.use-case';
import { BaseAuthController } from './base.controller';
import { BodyOrDataPipe } from './body-or-data.pipe';
import { ForbiddenError } from './contexts/auth/session';
import {
  SystemSimSummaryResponse,
  SystemSimCarrierBreakdownResponse,
  SystemSimDataUsageResponse,
  SimBatchRetryResponse,
  SystemSimRequestsSummaryResponse,
  SystemSimBatchesSummaryResponse,
  SystemSimRequestActionResponse,
  SystemSimDetailResponse,
  SystemSimRequestsListResponse,
  SystemSimBatchDetailResponse,
  SystemSimBatchesListResponse,
  SystemSimsListResponse,
  SystemSimImportResponse,
  SystemSimBulkStatusResponse,
  SystemSimDeleteResponse,
} from './dto/auth.schema';
import {
  BulkSystemSimStatusDto,
  CreateSystemSimDto,
  ImportSystemSimsDto,
  UpdateSystemSimDto,
  SuspendSystemSimDto,
  ReassignSystemSimDto,
  RejectSimRequestDto,
} from './dto/system-sim.dto';
import { BulkSystemSimStatusUseCase, SimStatusNotAllowedError } from './bulk-system-sim-status.use-case';
import { CreateSystemSimUseCase } from './create-system-sim.use-case';
import { DeleteSystemSimUseCase } from './delete-system-sim.use-case';
import { ImportSystemSimsUseCase } from './import-system-sims.use-case';
import { simStatusVerb } from './sim-status-action';
import { DuplicateSimIccidError, SimInUseError } from './system-sim-input';
import { GetSystemSimImportTemplateUseCase } from './get-system-sim-import-template.use-case';
import { normalizeBatchStatus } from './sim-activation-batch.repository';
import { ExportSystemSimBatchesUseCase } from './export-system-sim-batches.use-case';
import { ExportSystemSimRequestsUseCase } from './export-system-sim-requests.use-case';
import { ExportSystemSimsUseCase } from './export-system-sims.use-case';
import { GetSystemSimBatchDetailUseCase } from './get-system-sim-batch-detail.use-case';
import { GetSystemSimBatchesSummaryUseCase } from './get-system-sim-batches-summary.use-case';
import { GetSystemSimDetailUseCase, SimNotFoundError } from './get-system-sim-detail.use-case';
import { GetSystemSimRequestsSummaryUseCase } from './get-system-sim-requests-summary.use-case';
import { GetSystemSimSummaryUseCase } from './get-system-sim-summary.use-case';
import { GetSystemSimCarrierBreakdownUseCase } from './get-system-sim-carrier-breakdown.use-case';
import { parseSnapshotPeriod } from './system-snapshot-period';
import { GetSystemSimDataUsageUseCase } from './get-system-sim-data-usage.use-case';
import { ListSystemSimBatchesUseCase } from './list-system-sim-batches.use-case';
import { ListSystemSimRequestsUseCase } from './list-system-sim-requests.use-case';
import { ListSystemSimsUseCase } from './list-system-sims.use-case';
import { ReassignSystemSimUseCase } from './reassign-system-sim.use-case';
import { RejectSystemSimRequestUseCase } from './reject-system-sim-request.use-case';
import { SimBatchNotFoundError, RetrySystemSimBatchUseCase, SimBatchNotRetryableError } from './retry-system-sim-batch.use-case';
import { SuspendSystemSimUseCase } from './suspend-system-sim.use-case';
import { UpdateSystemSimUseCase } from './update-system-sim.use-case';
import { Portals, OnResource } from '@shared/access';

@ApiTags('System SIMs')
@Portals('admin')
@OnResource('admin.sims')
@Controller('system/sims')
export class SystemSimsController extends BaseAuthController {
  constructor(
    @Inject(ActivityLogService) activityLogService: ActivityLogService,
    @Inject(GetSystemSimSummaryUseCase) private readonly getSystemSimSummaryUseCase: GetSystemSimSummaryUseCase,
    @Inject(GetSystemSimCarrierBreakdownUseCase)
    private readonly getSystemSimCarrierBreakdownUseCase: GetSystemSimCarrierBreakdownUseCase,
    @Inject(GetSystemSimDataUsageUseCase) private readonly getSystemSimDataUsageUseCase: GetSystemSimDataUsageUseCase,
    @Inject(ListSystemSimsUseCase) private readonly listSystemSimsUseCase: ListSystemSimsUseCase,
    @Inject(ExportSystemSimsUseCase) private readonly exportSystemSimsUseCase: ExportSystemSimsUseCase,
    @Inject(ListSystemSimRequestsUseCase) private readonly listSystemSimRequestsUseCase: ListSystemSimRequestsUseCase,
    @Inject(ListSystemSimBatchesUseCase) private readonly listSystemSimBatchesUseCase: ListSystemSimBatchesUseCase,
    @Inject(GetSystemSimDetailUseCase) private readonly getSystemSimDetailUseCase: GetSystemSimDetailUseCase,
    @Inject(UpdateSystemSimUseCase) private readonly updateSystemSimUseCase: UpdateSystemSimUseCase,
    @Inject(ReassignSystemSimUseCase) private readonly reassignSystemSimUseCase: ReassignSystemSimUseCase,
    @Inject(SuspendSystemSimUseCase) private readonly suspendSystemSimUseCase: SuspendSystemSimUseCase,
    @Inject(GetSystemSimRequestsSummaryUseCase) private readonly getSystemSimRequestsSummaryUseCase: GetSystemSimRequestsSummaryUseCase,
    @Inject(ExportSystemSimRequestsUseCase) private readonly exportSystemSimRequestsUseCase: ExportSystemSimRequestsUseCase,
    @Inject(ApproveSystemSimRequestUseCase) private readonly approveSystemSimRequestUseCase: ApproveSystemSimRequestUseCase,
    @Inject(RejectSystemSimRequestUseCase) private readonly rejectSystemSimRequestUseCase: RejectSystemSimRequestUseCase,
    @Inject(GetSystemSimBatchesSummaryUseCase) private readonly getSystemSimBatchesSummaryUseCase: GetSystemSimBatchesSummaryUseCase,
    @Inject(GetSystemSimBatchDetailUseCase) private readonly getSystemSimBatchDetailUseCase: GetSystemSimBatchDetailUseCase,
    @Inject(ExportSystemSimBatchesUseCase) private readonly exportSystemSimBatchesUseCase: ExportSystemSimBatchesUseCase,
    @Inject(RetrySystemSimBatchUseCase) private readonly retrySystemSimBatchUseCase: RetrySystemSimBatchUseCase,
    @Inject(CreateSystemSimUseCase) private readonly createSystemSimUseCase: CreateSystemSimUseCase,
    @Inject(ImportSystemSimsUseCase) private readonly importSystemSimsUseCase: ImportSystemSimsUseCase,
    @Inject(DeleteSystemSimUseCase) private readonly deleteSystemSimUseCase: DeleteSystemSimUseCase,
    @Inject(BulkSystemSimStatusUseCase) private readonly bulkSystemSimStatusUseCase: BulkSystemSimStatusUseCase,
    @Inject(GetSystemSimImportTemplateUseCase) private readonly getSystemSimImportTemplateUseCase: GetSystemSimImportTemplateUseCase,
  ) {
    super(activityLogService);
  }

  @Get('data-usage')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get SIM data usage per day',
    description: 'Daily SIM data usage (growth between daily snapshots of stored usage), usage so far today and total bundle megabytes bought. Days default 7, max 90.',
  })
  @ApiQuery({ name: 'days', required: false, type: Number })
  @ApiOkResponse({ type: SystemSimDataUsageResponse })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiForbiddenResponse({
    description: 'Caller is not permitted to view SIM data usage',
  })
  async getSystemSimDataUsage(
    @Headers('authorization') authorization?: string,
    @Query('days') days?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');

    try {
      return await this.getSystemSimDataUsageUseCase.execute(accessToken, days ? Number(days) : undefined);
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      throw error;
    }
  }

  @Get('summary')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get system SIM summary', description: 'Platform-wide SIM metrics.' })
  @ApiOkResponse({ type: SystemSimSummaryResponse })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiForbiddenResponse({ description: 'Caller is not permitted to view SIM summary' })
  async getSystemSimSummary(@Headers('authorization') authorization?: string) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      return await this.getSystemSimSummaryUseCase.execute(accessToken);
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      throw error;
    }
  }

  @Get('by-carrier')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get SIM count per carrier',
    description: 'SIMs per carrier, optionally only those added within the period.',
  })
  @ApiQuery({ name: 'period', required: false, enum: ['7d', '30d', '90d', 'all'], description: 'Only SIMs added in this window; default all' })
  @ApiOkResponse({ type: SystemSimCarrierBreakdownResponse })
  @ApiBadRequestResponse({ description: 'Invalid period' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiForbiddenResponse({ description: 'Caller is not permitted to view SIM summary' })
  async getSystemSimCarrierBreakdown(
    @Headers('authorization') authorization?: string,
    @Query('period') periodParam?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    const period = parseSnapshotPeriod(periodParam);
    if (!period) throw new BadRequestException('period must be one of 7d, 30d, 90d, all');
    try {
      return await this.getSystemSimCarrierBreakdownUseCase.execute(accessToken, period);
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      throw error;
    }
  }

  @Get()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List system SIM inventory', description: 'Platform-wide SIM inventory.' })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'status', required: false, type: String })
  @ApiQuery({ name: 'carrier', required: false, type: String })
  @ApiQuery({ name: 'tenantId', required: false, type: String })
  @ApiQuery({ name: 'page', required: false, type: Number, description: '1-based; with limit enables paging' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Default 25, max 100' })
  @ApiOkResponse({ type: SystemSimsListResponse })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiForbiddenResponse({ description: 'Caller is not permitted to view SIM inventory' })
  async listSystemSims(
    @Headers('authorization') authorization?: string,
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('carrier') carrier?: string,
    @Query('tenantId') tenantId?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      return await this.listSystemSimsUseCase.execute(accessToken, {
        search,
        status,
        carrier,
        tenantId,
        ...this.parsePaging(page, limit),
      });
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      throw error;
    }
  }

  @Get('export')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Export system SIM inventory', description: 'CSV export of platform SIM inventory.' })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'status', required: false, type: String })
  @ApiQuery({ name: 'carrier', required: false, type: String })
  @ApiQuery({ name: 'tenantId', required: false, type: String })
  @ApiProduces('text/csv')
  @ApiOkResponse({ description: 'CSV export', schema: { type: 'string', format: 'binary' } })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiForbiddenResponse({ description: 'Caller is not permitted to export SIM inventory' })
  async exportSystemSims(
    @Headers('authorization') authorization: string | undefined,
    @Query('search') search: string | undefined,
    @Query('status') status: string | undefined,
    @Query('carrier') carrier: string | undefined,
    @Query('tenantId') tenantId: string | undefined,
    @Res({ passthrough: true }) response: { setHeader(name: string, value: string): void },
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      const exported = await this.exportSystemSimsUseCase.execute(accessToken, { search, status, carrier, tenantId });
      response.setHeader('Content-Type', 'text/csv; charset=utf-8');
      response.setHeader('Content-Disposition', `attachment; filename="${exported.filename}"`);
      await this.tryRecordActivityFromAccessToken(accessToken, {
        service: 'auth',
        action: 'system.sims.exported',
        entityType: 'sim',
        entityId: 'system-sim-inventory',
        summary: 'Exported system SIM inventory',
      });
      return new StreamableFile(Buffer.from(exported.csv, 'utf8'));
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      throw error;
    }
  }

  @Get('requests')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List SIM provisioning requests', description: 'Approval queue for tenant SIM requests.' })
  @ApiQuery({ name: 'status', required: false, enum: ['pending', 'approved', 'rejected'] })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'organisation', required: false, type: String, description: 'Tenant id or name' })
  @ApiQuery({ name: 'carrier', required: false, type: String, description: 'Preferred operator' })
  @ApiQuery({ name: 'useCase', required: false, type: String })
  @ApiOkResponse({ type: SystemSimRequestsListResponse })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiForbiddenResponse({ description: 'Caller is not permitted to view SIM requests' })
  async listSystemSimRequests(
    @Headers('authorization') authorization?: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('organisation') organisation?: string,
    @Query('carrier') carrier?: string,
    @Query('useCase') useCase?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      return await this.listSystemSimRequestsUseCase.execute(accessToken, {
        status,
        search,
        organisation,
        carrier,
        useCase,
      });
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      throw error;
    }
  }

  @Get('requests/summary')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'SIM approval queue summary', description: 'Counts for the SIM provisioning approval queue cards.' })
  @ApiOkResponse({ type: SystemSimRequestsSummaryResponse })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiForbiddenResponse({ description: 'Caller is not permitted to view SIM requests' })
  async getSystemSimRequestsSummary(@Headers('authorization') authorization?: string) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      return await this.getSystemSimRequestsSummaryUseCase.execute(accessToken);
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      throw error;
    }
  }

  @Get('requests/export')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Export SIM provisioning requests', description: 'CSV export of the SIM approval queue.' })
  @ApiQuery({ name: 'status', required: false, enum: ['pending', 'approved', 'rejected'] })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'organisation', required: false, type: String })
  @ApiQuery({ name: 'carrier', required: false, type: String })
  @ApiQuery({ name: 'useCase', required: false, type: String })
  @ApiProduces('text/csv')
  @ApiOkResponse({ description: 'CSV export', schema: { type: 'string', format: 'binary' } })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiForbiddenResponse({ description: 'Caller is not permitted to export SIM requests' })
  async exportSystemSimRequests(
    @Headers('authorization') authorization: string | undefined,
    @Query('status') status: string | undefined,
    @Query('search') search: string | undefined,
    @Query('organisation') organisation: string | undefined,
    @Query('carrier') carrier: string | undefined,
    @Query('useCase') useCase: string | undefined,
    @Res({ passthrough: true }) response: { setHeader(name: string, value: string): void },
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      const exported = await this.exportSystemSimRequestsUseCase.execute(accessToken, {
        status,
        search,
        organisation,
        carrier,
        useCase,
      });
      response.setHeader('Content-Type', 'text/csv; charset=utf-8');
      response.setHeader('Content-Disposition', `attachment; filename="${exported.filename}"`);
      return new StreamableFile(Buffer.from(exported.csv, 'utf8'));
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      throw error;
    }
  }

  @Post('requests/:requestId/approve')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Approve SIM provisioning request', description: 'Approves a pending request and queues an activation batch.' })
  @ApiOkResponse({ type: SystemSimRequestActionResponse })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiForbiddenResponse({ description: 'Caller is not permitted to approve SIM requests' })
  @ApiNotFoundResponse({ description: 'SIM request not found' })
  @ApiConflictResponse({ description: 'SIM request already processed' })
  async approveSystemSimRequest(
    @Param('requestId') requestId: string,
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      const result = await this.approveSystemSimRequestUseCase.execute(accessToken, requestId);
      await this.tryRecordActivityFromAccessToken(accessToken, {
        service: 'auth',
        action: 'system.sim_request.approved',
        entityType: 'sim_request',
        entityId: requestId,
        summary: 'SIM provisioning request approved',
        metadata: { batchId: result.data.batchId },
      });
      return result;
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      if (error instanceof SimRequestNotFoundError) throw new NotFoundException(error.message);
      if (error instanceof SimRequestAlreadyProcessedError) throw new ConflictException(error.message);
      throw error;
    }
  }

  @Post('requests/:requestId/reject')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Reject SIM provisioning request', description: 'Rejects a pending request with a reason.' })
  @ApiOkResponse({ type: SystemSimRequestActionResponse })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiForbiddenResponse({ description: 'Caller is not permitted to reject SIM requests' })
  @ApiNotFoundResponse({ description: 'SIM request not found' })
  @ApiConflictResponse({ description: 'SIM request already processed' })
  @ApiBadRequestResponse({ description: 'Missing rejection reason' })
  async rejectSystemSimRequest(
    @Param('requestId') requestId: string,
    @Body(BodyOrDataPipe) payload: RejectSimRequestDto,
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      const result = await this.rejectSystemSimRequestUseCase.execute(accessToken, requestId, payload.reason);
      await this.tryRecordActivityFromAccessToken(accessToken, {
        service: 'auth',
        action: 'system.sim_request.rejected',
        entityType: 'sim_request',
        entityId: requestId,
        summary: 'SIM provisioning request rejected',
        metadata: { reason: payload.reason },
      });
      return result;
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      if (error instanceof SimRequestNotFoundError) throw new NotFoundException(error.message);
      if (error instanceof SimRequestAlreadyProcessedError) throw new ConflictException(error.message);
      throw error;
    }
  }

  @Get('batches')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List SIM activation batches', description: 'Monitor batch activation progress.' })
  @ApiQuery({ name: 'status', required: false, type: String })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'operator', required: false, type: String })
  @ApiQuery({ name: 'mode', required: false, enum: ['single', 'bulk'] })
  @ApiOkResponse({ type: SystemSimBatchesListResponse })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiForbiddenResponse({ description: 'Caller is not permitted to view SIM batches' })
  async listSystemSimBatches(
    @Headers('authorization') authorization?: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('operator') operator?: string,
    @Query('mode') mode?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      return await this.listSystemSimBatchesUseCase.execute(accessToken, { status: normalizeBatchStatus(status), search, operator, mode });
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      throw error;
    }
  }

  @Get('batches/summary')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'SIM activation batches summary', description: 'Counts for the batch activation overview cards.' })
  @ApiOkResponse({ type: SystemSimBatchesSummaryResponse })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiForbiddenResponse({ description: 'Caller is not permitted to view SIM batches' })
  async getSystemSimBatchesSummary(@Headers('authorization') authorization?: string) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      return await this.getSystemSimBatchesSummaryUseCase.execute(accessToken);
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      throw error;
    }
  }

  @Get('batches/export')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Export SIM activation batches', description: 'CSV export of activation batches.' })
  @ApiQuery({ name: 'status', required: false, type: String })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'operator', required: false, type: String })
  @ApiQuery({ name: 'mode', required: false, enum: ['single', 'bulk'] })
  @ApiProduces('text/csv')
  @ApiOkResponse({ description: 'CSV export', schema: { type: 'string', format: 'binary' } })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiForbiddenResponse({ description: 'Caller is not permitted to export SIM batches' })
  async exportSystemSimBatches(
    @Headers('authorization') authorization: string | undefined,
    @Query('status') status: string | undefined,
    @Query('search') search: string | undefined,
    @Query('operator') operator: string | undefined,
    @Query('mode') mode: string | undefined,
    @Res({ passthrough: true }) response: { setHeader(name: string, value: string): void },
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      const exported = await this.exportSystemSimBatchesUseCase.execute(accessToken, { status: normalizeBatchStatus(status), search, operator, mode });
      response.setHeader('Content-Type', 'text/csv; charset=utf-8');
      response.setHeader('Content-Disposition', `attachment; filename="${exported.filename}"`);
      return new StreamableFile(Buffer.from(exported.csv, 'utf8'));
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      throw error;
    }
  }

  @Get('batches/:batchId')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get SIM activation batch detail' })
  @ApiOkResponse({ type: SystemSimBatchDetailResponse })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiForbiddenResponse({ description: 'Caller is not permitted to view SIM batches' })
  @ApiNotFoundResponse({ description: 'SIM batch not found' })
  async getSystemSimBatchDetail(
    @Param('batchId') batchId: string,
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      return await this.getSystemSimBatchDetailUseCase.execute(accessToken, batchId);
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      if (error instanceof SimBatchNotFoundError) throw new NotFoundException(error.message);
      throw error;
    }
  }

  @Post('batches/:batchId/retry')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Retry SIM activation batch', description: 'Re-queues a failed or partially completed batch.' })
  @ApiOkResponse({ type: SimBatchRetryResponse })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiForbiddenResponse({ description: 'Caller is not permitted to retry SIM batches' })
  @ApiNotFoundResponse({ description: 'SIM batch not found' })
  @ApiConflictResponse({ description: 'SIM batch cannot be retried in its current state' })
  async retrySystemSimBatch(
    @Param('batchId') batchId: string,
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      const result = await this.retrySystemSimBatchUseCase.execute(accessToken, batchId);
      await this.tryRecordActivityFromAccessToken(accessToken, {
        service: 'auth',
        action: 'system.sim_batch.retried',
        entityType: 'sim_batch',
        entityId: batchId,
        summary: 'SIM activation batch queued for retry',
      });
      return result;
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      if (error instanceof SimBatchNotFoundError) throw new NotFoundException(error.message);
      if (error instanceof SimBatchNotRetryableError) throw new ConflictException(error.message);
      throw error;
    }
  }

  @Post()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Register SIM', description: 'Adds one unassigned SIM to the platform inventory.' })
  @ApiOkResponse({ type: SystemSimDetailResponse })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiForbiddenResponse({ description: 'Caller is not permitted to register SIMs' })
  @ApiBadRequestResponse({ description: 'Invalid SIM details' })
  @ApiConflictResponse({ description: 'ICCID already exists' })
  async createSystemSim(
    @Body(BodyOrDataPipe) payload: CreateSystemSimDto,
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      const result = await this.createSystemSimUseCase.execute(accessToken, payload);
      await this.tryRecordActivityFromAccessToken(accessToken, {
        service: 'auth',
        action: 'system.sim.created',
        entityType: 'sim',
        entityId: result.data.id,
        summary: 'SIM registered',
        metadata: { iccid: result.data.iccid, carrier: result.data.carrier },
      });
      return result;
    } catch (error) {
      this.rethrowSimError(error);
    }
  }

  @Get('import/template')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Download the SIM import CSV template', description: 'Header row plus one sample row, in the columns POST /system/sims/import takes.' })
  @ApiProduces('text/csv')
  @ApiOkResponse({ description: 'CSV template', schema: { type: 'string', format: 'binary' } })
  async getSystemSimImportTemplate(
    @Headers('authorization') authorization: string | undefined,
    @Res({ passthrough: true }) response: { setHeader(name: string, value: string): void },
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      const { csv, filename } = await this.getSystemSimImportTemplateUseCase.execute(accessToken);
      response.setHeader('Content-Type', 'text/csv; charset=utf-8');
      response.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      return new StreamableFile(Buffer.from(csv, 'utf8'));
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      throw error;
    }
  }

  @Post('import')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Import SIMs',
    description: 'Adds up to 1000 unassigned SIMs. Existing ICCIDs are skipped; every row gets its own outcome.',
  })
  @ApiOkResponse({ type: SystemSimImportResponse })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiForbiddenResponse({ description: 'Caller is not permitted to import SIMs' })
  @ApiBadRequestResponse({ description: 'Invalid import payload' })
  async importSystemSims(
    @Body(BodyOrDataPipe) payload: ImportSystemSimsDto,
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      const result = await this.importSystemSimsUseCase.execute(accessToken, payload.rows);
      await this.tryRecordActivityFromAccessToken(accessToken, {
        service: 'auth',
        action: 'system.sims.imported',
        entityType: 'sim',
        entityId: 'system-sim-inventory',
        summary: result.message,
        metadata: {
          imported: result.data.imported,
          skipped: result.data.skipped,
          failed: result.data.failed,
        },
      });
      return result;
    } catch (error) {
      this.rethrowSimError(error);
    }
  }

  @Post('bulk-status')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Activate, suspend or reinstate several SIMs',
    description:
      'Changes status in our system only. The mobile network is not told. Every SIM gets its own outcome.',
  })
  @ApiOkResponse({ type: SystemSimBulkStatusResponse })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiForbiddenResponse({ description: 'Caller is not permitted to change SIM status' })
  @ApiBadRequestResponse({ description: 'Invalid bulk status payload' })
  async bulkSystemSimStatus(
    @Body(BodyOrDataPipe) payload: BulkSystemSimStatusDto,
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      const result = await this.bulkSystemSimStatusUseCase.execute(accessToken, payload.ids, payload.action);
      for (const item of result.data.results.filter((r) => r.outcome === 'changed')) {
        await this.recordStatusChange(accessToken, item.id, payload.action, { bulk: true, iccid: item.iccid });
      }
      return result;
    } catch (error) {
      this.rethrowSimError(error);
    }
  }

  // Declared AFTER every literal system/sims/* route so :simId cannot swallow
  // `summary`, `export`, `requests`, or `batches`.

  @Get(':simId')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get SIM detail' })
  @ApiOkResponse({ type: SystemSimDetailResponse })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiForbiddenResponse({ description: 'Caller is not permitted to view SIM inventory' })
  @ApiNotFoundResponse({ description: 'SIM not found' })
  async getSystemSimDetail(
    @Param('simId') simId: string,
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      return await this.getSystemSimDetailUseCase.execute(accessToken, simId);
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      if (error instanceof SimNotFoundError) throw new NotFoundException(error.message);
      throw error;
    }
  }

  @Patch(':simId')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update SIM', description: 'Edit ICCID, phone number, IMSI, carrier, plan, or data/SMS limits.' })
  @ApiConflictResponse({ description: 'ICCID already exists' })
  @ApiOkResponse({ type: SystemSimDetailResponse })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiForbiddenResponse({ description: 'Caller is not permitted to update SIMs' })
  @ApiNotFoundResponse({ description: 'SIM not found' })
  @ApiBadRequestResponse({ description: 'Invalid SIM update payload' })
  async updateSystemSim(
    @Param('simId') simId: string,
    @Body(BodyOrDataPipe) payload: UpdateSystemSimDto,
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      const result = await this.updateSystemSimUseCase.execute(accessToken, simId, payload);
      await this.tryRecordActivityFromAccessToken(accessToken, {
        service: 'auth',
        action: 'system.sim.updated',
        entityType: 'sim',
        entityId: simId,
        summary: 'SIM updated',
        metadata: { changedFields: Object.keys(payload) },
      });
      return result;
    } catch (error) {
      this.rethrowSimError(error);
    }
  }

  @Patch(':simId/reassign')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Reassign SIM', description: 'Assign the SIM to a tenant/device or return it to the pool.' })
  @ApiOkResponse({ type: SystemSimDetailResponse })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiForbiddenResponse({ description: 'Caller is not permitted to reassign SIMs' })
  @ApiNotFoundResponse({ description: 'SIM not found' })
  async reassignSystemSim(
    @Param('simId') simId: string,
    @Body(BodyOrDataPipe) payload: ReassignSystemSimDto,
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      const result = await this.reassignSystemSimUseCase.execute(accessToken, simId, {
        tenantId: payload.tenantId,
        deviceId: payload.deviceId,
      });
      await this.tryRecordActivityFromAccessToken(accessToken, {
        service: 'auth',
        action: 'system.sim.reassigned',
        entityType: 'sim',
        entityId: simId,
        summary: 'SIM reassigned',
        metadata: { tenantId: payload.tenantId },
      });
      return result;
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      if (error instanceof SimNotFoundError) throw new NotFoundException(error.message);
      throw error;
    }
  }

  @Patch(':simId/suspend')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Suspend or reactivate SIM' })
  @ApiOkResponse({ type: SystemSimDetailResponse })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiForbiddenResponse({ description: 'Caller is not permitted to suspend SIMs' })
  @ApiNotFoundResponse({ description: 'SIM not found' })
  async suspendSystemSim(
    @Param('simId') simId: string,
    @Body(BodyOrDataPipe) payload: SuspendSystemSimDto,
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      const result = await this.suspendSystemSimUseCase.execute(accessToken, simId, payload.suspend);
      await this.tryRecordActivityFromAccessToken(accessToken, {
        service: 'auth',
        action: 'system.sim.suspension_changed',
        entityType: 'sim',
        entityId: simId,
        summary: result.message,
      });
      return result;
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      if (error instanceof SimNotFoundError) throw new NotFoundException(error.message);
      throw error;
    }
  }

  @Patch(':simId/activate')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Activate SIM', description: 'Marks the SIM active in our system. The mobile network is not told.' })
  @ApiOkResponse({ type: SystemSimDetailResponse })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiForbiddenResponse({ description: 'Caller is not permitted to change SIM status' })
  @ApiNotFoundResponse({ description: 'SIM not found' })
  @ApiConflictResponse({ description: 'SIM cannot be activated in its current state' })
  async activateSystemSim(
    @Param('simId') simId: string,
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      const result = await this.bulkSystemSimStatusUseCase.executeOne(accessToken, simId, 'activate');
      await this.recordStatusChange(accessToken, simId, 'activate', { iccid: result.data.iccid });
      return result;
    } catch (error) {
      this.rethrowSimError(error);
    }
  }

  @Delete(':simId')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete SIM', description: 'Removes a SIM that is not assigned to any tenant or device.' })
  @ApiOkResponse({ type: SystemSimDeleteResponse })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiForbiddenResponse({ description: 'Caller is not permitted to delete SIMs' })
  @ApiNotFoundResponse({ description: 'SIM not found' })
  @ApiConflictResponse({ description: 'SIM is assigned to a tenant or device' })
  async deleteSystemSim(
    @Param('simId') simId: string,
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      const result = await this.deleteSystemSimUseCase.execute(accessToken, simId);
      await this.tryRecordActivityFromAccessToken(accessToken, {
        service: 'auth',
        action: 'system.sim.deleted',
        entityType: 'sim',
        entityId: simId,
        summary: 'SIM deleted',
        metadata: { iccid: result.data.iccid },
      });
      return result;
    } catch (error) {
      this.rethrowSimError(error);
    }
  }

  private recordStatusChange(
    accessToken: string,
    simId: string,
    action: 'activate' | 'suspend' | 'reinstate',
    metadata: { bulk?: boolean; iccid: string | null },
  ) {
    return this.tryRecordActivityFromAccessToken(accessToken, {
      service: 'auth',
      action: action === 'activate' ? 'system.sim.activated' : 'system.sim.suspension_changed',
      entityType: 'sim',
      entityId: simId,
      summary: `SIM marked ${simStatusVerb(action)} in our system`,
      metadata: { ...metadata, action, networkNotified: false },
    });
  }

  private parsePaging(page?: string, limit?: string) {
    if (page === undefined && limit === undefined) return {};
    const parsedPage = Math.max(1, Math.floor(Number(page)) || 1);
    const parsedLimit = Math.min(100, Math.max(1, Math.floor(Number(limit)) || 25));
    return { page: parsedPage, limit: parsedLimit };
  }

  private rethrowSimError(error: unknown): never {
    this.rethrowInvalidAccessToken(error);
    if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
    if (error instanceof SimNotFoundError) throw new NotFoundException(error.message);
    if (error instanceof DuplicateSimIccidError) throw new ConflictException(error.message);
    if (error instanceof SimInUseError) throw new ConflictException(error.message);
    if (error instanceof SimStatusNotAllowedError) throw new ConflictException(error.message);
    throw error;
  }

  /** Updates organization-level settings for current tenant (enterprise admin only). */
}
