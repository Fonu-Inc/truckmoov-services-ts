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
  UnauthorizedException,
  Query,
  Delete,
  ServiceUnavailableException,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { uploadLimits } from '@shared/http';
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
  ApiCreatedResponse,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import { DEVICE_LIFECYCLE_STATUSES, DEVICE_STATUSES } from '@shared/devices';
import { ActivityLogService } from './activity-log.service';
import {
  DeviceSuspensionRefusedError,
  ReinstateSystemDeviceUseCase,
  DecommissionSystemDeviceUseCase,
  SuspendSystemDeviceUseCase,
} from './suspend-system-device.use-cases';
import { BaseAuthController } from './base.controller';
import { SuspendSystemDeviceDto } from './dto/device-setup.dto';
import {
  AssignSystemDevicesDto,
  RetryDeviceProvisioningDto,
  SendTestTelemetryDto,
  UpdateSystemDeviceDto,
} from './dto/system-device.dto';
import {
  AssignSystemDevicesUseCase,
  ImportSystemDeviceStockUseCase,
  type PartialStockImportError,
  RetryDeviceProvisioningUseCase,
  SendTestTelemetryUseCase,
  SystemDeviceWriteRefusedError,
  UpdateSystemDeviceUseCase,
} from './update-system-device.use-cases';
import { BodyOrDataPipe } from './body-or-data.pipe';
import { UserNotFoundError, ForbiddenError } from './contexts/auth/session';
import { CreateSystemDeviceModelUseCase } from './create-system-device-model.use-case';
import { DeleteSystemDeviceModelUseCase } from './delete-system-device-model.use-case';
import {
  SystemDeviceCatalogModelResponse,
  SystemDeviceCatalogListResponse,
  SystemDeviceCatalogDeleteResponse,
  SystemDeviceSummaryResponse,
  SystemDeviceManufacturersResponse,
  SystemDeviceMessageRateResponse,
  SystemDeviceInventoryListResponse,
  SystemDeviceDetailResponse,
} from './dto/auth.schema';
import { CreateSystemDeviceModelDto } from './dto/create-system-device-model.dto';
import { UpdateSystemDeviceModelDto } from './dto/update-system-device-model.dto';
import { ExportSystemDeviceCatalogUseCase } from './export-system-device-catalog.use-case';
import { ExportSystemDeviceInventoryUseCase } from './export-system-device-inventory.use-case';
import { GetSystemDeviceDetailUseCase, SystemDeviceNotFoundError } from './get-system-device-detail.use-case';
import { parseSnapshotPeriod } from './system-snapshot-period';
import { GetSystemDeviceManufacturersUseCase } from './get-system-device-manufacturers.use-case';
import { GetSystemDeviceMessageRateUseCase } from './get-system-device-message-rate.use-case';
import { GetSystemDeviceSummaryUseCase } from './get-system-device-summary.use-case';
import { ListSystemDeviceCatalogUseCase } from './list-system-device-catalog.use-case';
import { ListSystemDeviceInventoryUseCase } from './list-system-device-inventory.use-case';
import { ListStillReportingDevicesUseCase } from './list-still-reporting-devices.use-case';
import { ListUnrecognisedDevicesUseCase } from './list-unrecognised-devices.use-case';
import { ManageUnrecognisedDeviceUseCase } from './manage-unrecognised-device.use-case';
import { UnrecognisedDeviceActionDto } from './dto/unrecognised-device-action.dto';
import type { QuarantineAction } from './tracking-gate.client';
import { SystemDeviceModelConflictError, SystemDeviceModelNotFoundError } from './system-device-model.errors';
import { UpdateSystemDeviceModelUseCase } from './update-system-device-model.use-case';
import { Portals, OnResource } from '@shared/access';
import { StockCsvError } from './system-device-stock-csv';

const MAX_STOCK_CSV_BYTES = 2 * 1024 * 1024;

const QUARANTINE_AUDIT: Record<QuarantineAction, { action: string; summary: string }> = {
  dismiss: { action: 'dismissed', summary: 'Unrecognised device dismissed' },
  block: { action: 'blocked', summary: 'Unrecognised device blocked' },
  unblock: { action: 'unblocked', summary: 'Unrecognised device unblocked' },
};

@ApiTags('System Devices')
@Portals('admin')
@OnResource('admin.devices')
@Controller('system/devices')
export class SystemDevicesController extends BaseAuthController {
  constructor(
    @Inject(CreateSystemDeviceModelUseCase) private readonly createSystemDeviceModelUseCase: CreateSystemDeviceModelUseCase,
    @Inject(DeleteSystemDeviceModelUseCase) private readonly deleteSystemDeviceModelUseCase: DeleteSystemDeviceModelUseCase,
    @Inject(ExportSystemDeviceInventoryUseCase) private readonly exportSystemDeviceInventoryUseCase: ExportSystemDeviceInventoryUseCase,
    @Inject(GetSystemDeviceSummaryUseCase) private readonly getSystemDeviceSummaryUseCase: GetSystemDeviceSummaryUseCase,
    @Inject(GetSystemDeviceManufacturersUseCase)
    private readonly getSystemDeviceManufacturersUseCase: GetSystemDeviceManufacturersUseCase,
    @Inject(GetSystemDeviceMessageRateUseCase)
    private readonly getSystemDeviceMessageRateUseCase: GetSystemDeviceMessageRateUseCase,
    @Inject(ListSystemDeviceCatalogUseCase) private readonly listSystemDeviceCatalogUseCase: ListSystemDeviceCatalogUseCase,
    @Inject(ListSystemDeviceInventoryUseCase) private readonly listSystemDeviceInventoryUseCase: ListSystemDeviceInventoryUseCase,
    @Inject(GetSystemDeviceDetailUseCase) private readonly getSystemDeviceDetailUseCase: GetSystemDeviceDetailUseCase,
    @Inject(UpdateSystemDeviceModelUseCase) private readonly updateSystemDeviceModelUseCase: UpdateSystemDeviceModelUseCase,
    @Inject(ListStillReportingDevicesUseCase) private readonly listStillReportingDevicesUseCase: ListStillReportingDevicesUseCase,
    @Inject(ListUnrecognisedDevicesUseCase) private readonly listUnrecognisedDevicesUseCase: ListUnrecognisedDevicesUseCase,
    @Inject(ManageUnrecognisedDeviceUseCase) private readonly manageUnrecognisedDeviceUseCase: ManageUnrecognisedDeviceUseCase,
    @Inject(ActivityLogService) activityLogService: ActivityLogService,
    @Inject(ExportSystemDeviceCatalogUseCase) private readonly exportSystemDeviceCatalogUseCase: ExportSystemDeviceCatalogUseCase,
    @Inject(SuspendSystemDeviceUseCase) private readonly suspendSystemDeviceUseCase: SuspendSystemDeviceUseCase,
    @Inject(ReinstateSystemDeviceUseCase) private readonly reinstateSystemDeviceUseCase: ReinstateSystemDeviceUseCase,
    @Inject(DecommissionSystemDeviceUseCase)
    private readonly decommissionSystemDeviceUseCase: DecommissionSystemDeviceUseCase,
    @Inject(UpdateSystemDeviceUseCase)
    private readonly updateSystemDeviceUseCase: UpdateSystemDeviceUseCase,
    @Inject(AssignSystemDevicesUseCase)
    private readonly assignSystemDevicesUseCase: AssignSystemDevicesUseCase,
    @Inject(ImportSystemDeviceStockUseCase)
    private readonly importSystemDeviceStockUseCase: ImportSystemDeviceStockUseCase,
    @Inject(SendTestTelemetryUseCase)
    private readonly sendTestTelemetryUseCase: SendTestTelemetryUseCase,
    @Inject(RetryDeviceProvisioningUseCase)
    private readonly retryDeviceProvisioningUseCase: RetryDeviceProvisioningUseCase,
  ) {
    super(activityLogService);
  }

  @Get('summary')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get system device summary',
    description:
      'Returns platform-wide device inventory and device catalog summary metrics for system admins.',
  })
  @ApiOkResponse({ type: SystemDeviceSummaryResponse })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiForbiddenResponse({
    description: 'Caller is not permitted to view device summary data',
  })
  async getSystemDeviceSummary(
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');

    try {
      return await this.getSystemDeviceSummaryUseCase.execute(accessToken);
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError)
        throw new ForbiddenException(error.message);
      if (error instanceof UserNotFoundError)
        throw new NotFoundException(error.message);
      throw error;
    }
  }

  @Get('manufacturers')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get device count per manufacturer',
    description: 'Returns how many devices each hardware manufacturer has, largest first.',
  })
  @ApiQuery({ name: 'period', required: false, enum: ['7d', '30d', '90d', 'all'], description: 'Only devices added in this window; default all' })
  @ApiBadRequestResponse({ description: 'Invalid period' })
  @ApiOkResponse({ type: SystemDeviceManufacturersResponse })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiForbiddenResponse({
    description: 'Caller is not permitted to view device summary data',
  })
  async getSystemDeviceManufacturers(
    @Headers('authorization') authorization?: string,
    @Query('period') periodParam?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    const period = parseSnapshotPeriod(periodParam);
    if (!period) throw new BadRequestException('period must be one of 7d, 30d, 90d, all');

    try {
      return await this.getSystemDeviceManufacturersUseCase.execute(accessToken, period);
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError)
        throw new ForbiddenException(error.message);
      if (error instanceof UserNotFoundError)
        throw new NotFoundException(error.message);
      throw error;
    }
  }

  @Get('messages-per-hour')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get device location messages per hour',
    description: 'Accepted location messages in the last hour and per hour for 24 hours, from the tracking service. Counts restart when tracking restarts; gateReachable is false when tracking cannot be reached.',
  })
  @ApiOkResponse({ type: SystemDeviceMessageRateResponse })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiForbiddenResponse({
    description: 'Caller is not permitted to view device message rates',
  })
  async getSystemDeviceMessageRate(
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');

    try {
      return await this.getSystemDeviceMessageRateUseCase.execute(accessToken);
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError)
        throw new ForbiddenException(error.message);
      if (error instanceof UserNotFoundError)
        throw new NotFoundException(error.message);
      throw error;
    }
  }

  @Get()
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'List system device inventory',
    description:
      'Returns the platform-wide read-only device inventory for system admins.',
  })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'manufacturer', required: false, type: String })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: [...DEVICE_STATUSES],
    description:
      'Coarse status. Resolves to the lifecycle states that present as it.',
  })
  @ApiQuery({
    name: 'lifecycleStatus',
    required: false,
    enum: [...DEVICE_LIFECYCLE_STATUSES],
  })
  @ApiOkResponse({ type: SystemDeviceInventoryListResponse })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiForbiddenResponse({
    description: 'Caller is not permitted to view device inventory',
  })
  async listSystemDeviceInventory(
    @Headers('authorization') authorization?: string,
    @Query('search') search?: string,
    @Query('manufacturer') manufacturer?: string,
    @Query('status') status?: string,
    @Query('lifecycleStatus') lifecycleStatus?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');

    try {
      return await this.listSystemDeviceInventoryUseCase.execute(accessToken, {
        search,
        manufacturer,
        status,
        lifecycleStatus,
      });
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError)
        throw new ForbiddenException(error.message);
      if (error instanceof UserNotFoundError)
        throw new NotFoundException(error.message);
      throw error;
    }
  }

  @Get('still-reporting')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'List suspended devices still sending data',
    description:
      'Devices the ingest gate saw reporting after their suspension. gateReachable is false, with an empty list, when the gate cannot be asked.',
  })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiForbiddenResponse({
    description: 'Caller is not permitted to view device inventory',
  })
  async listStillReporting(@Headers('authorization') authorization?: string) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');

    try {
      return await this.listStillReportingDevicesUseCase.execute(accessToken);
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError)
        throw new ForbiddenException(error.message);
      if (error instanceof UserNotFoundError)
        throw new NotFoundException(error.message);
      throw error;
    }
  }

  @Get('unrecognised')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'List unrecognised devices sending data',
    description:
      'Senders whose IMEI is not registered to any company. Their data is held back, not stored. trackingReachable is false, with an empty list, when tracking cannot be asked.',
  })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiForbiddenResponse({
    description: 'Caller is not permitted to view device inventory',
  })
  async listUnrecognised(@Headers('authorization') authorization?: string) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');

    try {
      return await this.listUnrecognisedDevicesUseCase.execute(accessToken);
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError)
        throw new ForbiddenException(error.message);
      if (error instanceof UserNotFoundError)
        throw new NotFoundException(error.message);
      throw error;
    }
  }

  @Post('unrecognised/:imei/dismiss')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Dismiss an unrecognised device',
    description: 'Marks the sender as reviewed. Its data stays held back and it is cleared after 30 days.',
  })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiForbiddenResponse({ description: 'Caller is not permitted to manage unrecognised devices' })
  @ApiNotFoundResponse({ description: 'The sender is not in the list' })
  async dismissUnrecognised(
    @Param('imei') imei: string,
    @Body(BodyOrDataPipe) payload: UnrecognisedDeviceActionDto,
    @Headers('authorization') authorization?: string,
  ) {
    return this.actOnUnrecognised(imei, 'dismiss', payload, authorization);
  }

  @Post('unrecognised/:imei/block')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Block an unrecognised device',
    description: 'Refuses the sender at ingest from now on. Its messages are no longer counted or listed again.',
  })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiForbiddenResponse({ description: 'Caller is not permitted to manage unrecognised devices' })
  @ApiNotFoundResponse({ description: 'The sender is not in the list' })
  async blockUnrecognised(
    @Param('imei') imei: string,
    @Body(BodyOrDataPipe) payload: UnrecognisedDeviceActionDto,
    @Headers('authorization') authorization?: string,
  ) {
    return this.actOnUnrecognised(imei, 'block', payload, authorization);
  }

  @Post('unrecognised/:imei/unblock')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Unblock an unrecognised device',
    description: 'Lifts the block and puts the sender back in the open list. It is held back, not stored, until it is registered.',
  })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiForbiddenResponse({ description: 'Caller is not permitted to manage unrecognised devices' })
  @ApiNotFoundResponse({ description: 'The sender is not in the list' })
  async unblockUnrecognised(
    @Param('imei') imei: string,
    @Body(BodyOrDataPipe) payload: UnrecognisedDeviceActionDto,
    @Headers('authorization') authorization?: string,
  ) {
    return this.actOnUnrecognised(imei, 'unblock', payload, authorization);
  }

  private async actOnUnrecognised(
    imei: string,
    action: QuarantineAction,
    payload: UnrecognisedDeviceActionDto,
    authorization?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');

    try {
      const { actorId, ...result } = await this.manageUnrecognisedDeviceUseCase.execute(accessToken, imei, action, payload?.reason);
      const reason = payload.reason.trim();
      const recorded = await this.tryRecordActivityFromAccessToken(accessToken, {
        service: 'auth',
        action: `system.device.unrecognised.${QUARANTINE_AUDIT[action].action}`,
        entityType: 'device',
        entityId: imei,
        summary: QUARANTINE_AUDIT[action].summary,
        metadata: { reason },
      });
      if (!recorded) {
        this.logger.error(`quarantine_audit_lost:${action}:${imei}:actor=${actorId}:reason=${reason}`);
      }
      return result;
    } catch (error) {
      this.rethrowDeviceActionError(error);
      throw error;
    }
  }

  @Get('export')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Export system device inventory',
    description:
      'Exports the platform-wide read-only device inventory as a CSV file.',
  })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'manufacturer', required: false, type: String })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: [...DEVICE_STATUSES],
    description:
      'Coarse status. Resolves to the lifecycle states that present as it.',
  })
  @ApiQuery({
    name: 'lifecycleStatus',
    required: false,
    enum: [...DEVICE_LIFECYCLE_STATUSES],
  })
  @ApiProduces('text/csv')
  @ApiOkResponse({
    description: 'CSV export of the system device inventory',
    schema: { type: 'string', format: 'binary' },
  })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiForbiddenResponse({
    description: 'Caller is not permitted to export device inventory',
  })
  async exportSystemDeviceInventory(
    @Headers('authorization') authorization: string | undefined,
    @Query('search') search: string | undefined,
    @Query('manufacturer') manufacturer: string | undefined,
    @Query('status') status: string | undefined,
    @Query('lifecycleStatus') lifecycleStatus: string | undefined,
    @Res({ passthrough: true })
    response: { setHeader(name: string, value: string): void },
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');

    try {
      const exported = await this.exportSystemDeviceInventoryUseCase.execute(
        accessToken,
        { search, manufacturer, status, lifecycleStatus },
      );
      response.setHeader('Content-Type', 'text/csv; charset=utf-8');
      response.setHeader(
        'Content-Disposition',
        `attachment; filename="${exported.filename}"`,
      );
      await this.tryRecordActivityFromAccessToken(accessToken, {
        service: 'auth',
        action: 'system.devices.exported',
        entityType: 'device',
        entityId: 'system-device-inventory',
        summary: 'Exported system device inventory',
        metadata: {
          filters: {
            search: search ?? null,
            manufacturer: manufacturer ?? null,
            status: status ?? null,
            lifecycleStatus: lifecycleStatus ?? null,
          },
          exportedRowCount: exported.csv
            ? Math.max(exported.csv.split('\n').length - 1, 0)
            : 0,
        },
      });
      return new StreamableFile(Buffer.from(exported.csv, 'utf8'));
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError)
        throw new ForbiddenException(error.message);
      if (error instanceof UserNotFoundError)
        throw new NotFoundException(error.message);
      throw error;
    }
  }

  @Get('catalog')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'List system device catalog',
    description:
      'Returns the global device manufacturer/model catalog used by system admins and tenant onboarding.',
  })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['supported', 'deprecated', 'blocked'],
  })
  @ApiOkResponse({ type: SystemDeviceCatalogListResponse })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiForbiddenResponse({
    description: 'Caller is not permitted to view the device catalog',
  })
  async listSystemDeviceCatalog(
    @Headers('authorization') authorization?: string,
    @Query('search') search?: string,
    @Query('status') status?: 'supported' | 'deprecated' | 'blocked',
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');

    try {
      return await this.listSystemDeviceCatalogUseCase.execute(accessToken, {
        search,
        status,
      });
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError)
        throw new ForbiddenException(error.message);
      if (error instanceof UserNotFoundError)
        throw new NotFoundException(error.message);
      throw error;
    }
  }

  @Get('catalog/export')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Export device catalog as CSV' })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'status', required: false, enum: ['supported', 'deprecated', 'blocked'] })
  @ApiProduces('text/csv')
  @ApiOkResponse({ description: 'CSV export', schema: { type: 'string', format: 'binary' } })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiForbiddenResponse({ description: 'Not a system actor' })
  async exportSystemDeviceCatalog(
    @Headers('authorization') authorization: string | undefined,
    @Query('search') search: string | undefined,
    @Query('status') status: 'supported' | 'deprecated' | 'blocked' | undefined,
    @Res({ passthrough: true }) response: { setHeader(name: string, value: string): void },
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      const exported = await this.exportSystemDeviceCatalogUseCase.execute(accessToken, { search, status });
      response.setHeader('Content-Type', 'text/csv; charset=utf-8');
      response.setHeader('Content-Disposition', `attachment; filename="${exported.filename}"`);
      return new StreamableFile(Buffer.from(exported.csv, 'utf8'));
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      throw error;
    }
  }

  @Post('catalog')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Create system device catalog model',
    description:
      'Creates a manufacturer/model entry in the global device catalog used by system admins and tenant onboarding. ' +
      'A urlencoded body is form-decoded, so "+" reads as a space; send JSON to store a literal "+".',
  })
  @ApiConsumes('application/json', 'application/x-www-form-urlencoded')
  @ApiCreatedResponse({ type: SystemDeviceCatalogModelResponse })
  @ApiBadRequestResponse({ description: 'Invalid request payload' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiForbiddenResponse({
    description: 'Caller is not permitted to create device catalog models',
  })
  @ApiConflictResponse({
    description:
      'A device model with the same manufacturer and model already exists',
  })
  async createSystemDeviceModel(
    @Body(BodyOrDataPipe) payload: CreateSystemDeviceModelDto,
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');

    try {
      const result = await this.createSystemDeviceModelUseCase.execute({
        accessToken,
        manufacturer: payload.manufacturer,
        model: payload.model,
        deviceType: payload.deviceType,
        protocolType: payload.protocolType,
        defaultPort: payload.defaultPort,
        supportedFeatures: payload.supportedFeatures,
        status: payload.status,
        configurationInstructions: payload.configurationInstructions,
      });
      await this.tryRecordActivityFromAccessToken(accessToken, {
        service: 'auth',
        action: 'system.device_model.created',
        entityType: 'device_model',
        entityId: result.data.id,
        summary: 'System device catalog model created',
        metadata: {
          manufacturer: result.data.manufacturer,
          model: result.data.model,
          status: result.data.status,
          protocolType: result.data.protocolType,
        },
      });
      return result;
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError)
        throw new ForbiddenException(error.message);
      if (error instanceof SystemDeviceModelConflictError)
        throw new ConflictException(error.message);
      if (error instanceof UserNotFoundError)
        throw new NotFoundException(error.message);
      throw error;
    }
  }

  @Patch('catalog/:deviceModelId')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Update system device catalog model',
    description:
      'Updates a manufacturer/model entry in the global device catalog.',
  })
  @ApiOkResponse({ type: SystemDeviceCatalogModelResponse })
  @ApiBadRequestResponse({ description: 'Invalid request payload' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiForbiddenResponse({
    description: 'Caller is not permitted to update device catalog models',
  })
  @ApiConflictResponse({
    description:
      'A device model with the same manufacturer and model already exists',
  })
  @ApiNotFoundResponse({ description: 'Device model not found' })
  async updateSystemDeviceModel(
    @Param('deviceModelId') deviceModelId: string,
    @Body(BodyOrDataPipe) payload: UpdateSystemDeviceModelDto,
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');

    try {
      const result = await this.updateSystemDeviceModelUseCase.execute({
        accessToken,
        deviceModelId,
        manufacturer: payload.manufacturer,
        model: payload.model,
        deviceType: payload.deviceType,
        protocolType: payload.protocolType,
        defaultPort: payload.defaultPort,
        supportedFeatures: payload.supportedFeatures,
        status: payload.status,
        configurationInstructions: payload.configurationInstructions,
      });
      await this.tryRecordActivityFromAccessToken(accessToken, {
        service: 'auth',
        action: 'system.device_model.updated',
        entityType: 'device_model',
        entityId: result.data.id,
        summary: 'System device catalog model updated',
        metadata: {
          manufacturer: result.data.manufacturer,
          model: result.data.model,
          status: result.data.status,
          protocolType: result.data.protocolType,
        },
      });
      return result;
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError)
        throw new ForbiddenException(error.message);
      if (error instanceof SystemDeviceModelNotFoundError)
        throw new NotFoundException(error.message);
      if (error instanceof SystemDeviceModelConflictError)
        throw new ConflictException(error.message);
      if (error instanceof UserNotFoundError)
        throw new NotFoundException(error.message);
      throw error;
    }
  }

  @Delete('catalog/:deviceModelId')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Delete system device catalog model',
    description:
      'Deletes a manufacturer/model entry from the global device catalog.',
  })
  @ApiOkResponse({ type: SystemDeviceCatalogDeleteResponse })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiForbiddenResponse({
    description: 'Caller is not permitted to delete device catalog models',
  })
  @ApiNotFoundResponse({ description: 'Device model not found' })
  async deleteSystemDeviceModel(
    @Param('deviceModelId') deviceModelId: string,
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');

    try {
      const result = await this.deleteSystemDeviceModelUseCase.execute(
        accessToken,
        deviceModelId,
      );
      await this.tryRecordActivityFromAccessToken(accessToken, {
        service: 'auth',
        action: 'system.device_model.deleted',
        entityType: 'device_model',
        entityId: deviceModelId,
        summary: 'System device catalog model deleted',
      });
      return result;
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError)
        throw new ForbiddenException(error.message);
      if (error instanceof SystemDeviceModelNotFoundError)
        throw new NotFoundException(error.message);
      if (error instanceof UserNotFoundError)
        throw new NotFoundException(error.message);
      throw error;
    }
  }

  @Post('assign')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Record devices as assigned to a tenant',
    description:
      'Moves one or more platform-held devices to a tenant. The devices become assignable to vehicles in that tenant fleet.',
  })
  @ApiCreatedResponse({ description: 'Devices assigned' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiForbiddenResponse({ description: 'Caller is not permitted to assign devices' })
  @ApiBadRequestResponse({ description: 'No devices chosen, or a device is suspended or decommissioned' })
  @ApiNotFoundResponse({ description: 'A chosen device was not found' })
  async assignSystemDevices(
    @Body(BodyOrDataPipe) payload: AssignSystemDevicesDto,
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');

    try {
      const result = await this.assignSystemDevicesUseCase.execute(
        accessToken,
        payload.tenantId,
        payload.deviceIds,
        payload.notes,
      );
      await this.tryRecordActivityFromAccessToken(accessToken, {
        service: 'auth',
        action: 'system.device.assigned',
        entityType: 'device',
        entityId: payload.deviceIds.join(','),
        summary: 'Devices assigned to tenant',
        metadata: { tenantId: payload.tenantId, deviceIds: payload.deviceIds, notes: payload.notes ?? null },
      });
      return result;
    } catch (error) {
      this.rethrowDeviceActionError(error);
      throw error;
    }
  }

  @Post('stock/import')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Import platform device stock',
    description:
      'Registers devices the platform holds itself from a CSV (header imei,manufacturer,model[,name]). An IMEI that already exists is left untouched, so a file can be re-imported safely.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: { type: 'object', required: ['file'], properties: { file: { type: 'string', format: 'binary' } } },
  })
  @ApiCreatedResponse({
    description:
      'Stock imported. data holds total, created, skippedExisting, the first rejected lines and rejectedTotal.',
  })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiForbiddenResponse({ description: 'Caller is not permitted to import device stock' })
  @ApiBadRequestResponse({ description: 'Missing file, unreadable CSV, or no importable rows' })
  @UseInterceptors(FileInterceptor('file', uploadLimits(MAX_STOCK_CSV_BYTES)))
  async importSystemDeviceStock(
    @UploadedFile() file?: { buffer: Buffer },
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    if (!file?.buffer?.length) throw new BadRequestException('Missing CSV file');

    const recordImport = (
      totals: { total: number; created: number; skippedExisting: number; rejectedTotal: number },
      partial: boolean,
    ) =>
      this.tryRecordActivityFromAccessToken(accessToken, {
        service: 'auth',
        action: 'system.device.stock_imported',
        entityType: 'device',
        entityId: 'platform-stock',
        summary: partial ? 'Platform device stock partly imported' : 'Platform device stock imported',
        metadata: {
          total: totals.total,
          created: totals.created,
          skippedExisting: totals.skippedExisting,
          rejectedTotal: totals.rejectedTotal,
          partial,
        },
      });

    try {
      const result = await this.importSystemDeviceStockUseCase.execute(accessToken, file.buffer.toString('utf8'));
      await recordImport(result.data, false);
      return result;
    } catch (error) {
      const partialTotals = (error as PartialStockImportError).partialTotals;
      if (partialTotals && partialTotals.created > 0) await recordImport(partialTotals, true);
      if (error instanceof StockCsvError) throw new BadRequestException(error.message);
      this.rethrowDeviceActionError(error);
      throw error;
    }
  }

  @Post('test-telemetry')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Send test telemetry for a device',
    description:
      'Dev-only. Publishes the location fix a tracker would send, so a device waiting for verification is verified by the real telemetry path. Refused unless the environment enables it.',
  })
  @ApiCreatedResponse({
    description:
      'Fix published. data holds imei, verificationStatusBefore, verificationStatusAfter, lifecycleStatusAfter and a plain-language note.',
  })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiForbiddenResponse({ description: 'Caller is not permitted, or test telemetry is disabled on this environment' })
  @ApiBadRequestResponse({ description: 'The IMEI is not 15 digits, or a coordinate is out of range' })
  @ApiNotFoundResponse({ description: 'No device with that IMEI' })
  async sendTestTelemetry(
    @Body(BodyOrDataPipe) payload: SendTestTelemetryDto,
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');

    try {
      const result = await this.sendTestTelemetryUseCase.execute(accessToken, payload);
      await this.tryRecordActivityFromAccessToken(accessToken, {
        service: 'auth',
        action: 'system.device.test_telemetry_sent',
        entityType: 'device',
        entityId: payload.imei,
        summary: 'Test telemetry sent for a device',
        metadata: { ...result.data },
      });
      return result;
    } catch (error) {
      this.rethrowDeviceActionError(error);
      throw error;
    }
  }

  @Post('retry-provisioning')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Retry failed tracker registrations',
    description:
      'Re-queues devices whose registration with the tracking service failed, for the ids given or, with none, every failed device. Registered, pending and decommissioned devices are left alone.',
  })
  @ApiCreatedResponse({ description: 'data.requeued is the number of devices queued for another attempt' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiForbiddenResponse({ description: 'Caller is not permitted to retry device registrations' })
  @ApiBadRequestResponse({ description: 'More than 500 ids, or an id is not valid' })
  async retryDeviceProvisioning(
    @Body(BodyOrDataPipe) payload: RetryDeviceProvisioningDto,
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');

    try {
      const result = await this.retryDeviceProvisioningUseCase.execute(accessToken, payload.deviceIds);
      await this.tryRecordActivityFromAccessToken(accessToken, {
        service: 'auth',
        action: 'system.device.provisioning_retried',
        entityType: 'device',
        entityId: 'provisioning-retry',
        summary: `Retried tracker registration for ${result.data.requeued} device(s)`,
        metadata: { requeued: result.data.requeued, requested: payload.deviceIds?.length ?? 'all_failed' },
      });
      return result;
    } catch (error) {
      this.rethrowDeviceActionError(error);
      throw error;
    }
  }

  @Patch(':deviceId')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Edit a device record',
    description:
      'Corrects the make, model, firmware, protocol or service state of a device, whatever tenant holds it.',
  })
  @ApiOkResponse({ description: 'The updated device' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiForbiddenResponse({ description: 'Caller is not permitted to edit devices' })
  @ApiBadRequestResponse({ description: 'Nothing to change, or a value is not valid' })
  @ApiNotFoundResponse({ description: 'Device not found' })
  async updateSystemDevice(
    @Param('deviceId') deviceId: string,
    @Body(BodyOrDataPipe) payload: UpdateSystemDeviceDto,
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');

    try {
      const result = await this.updateSystemDeviceUseCase.execute(accessToken, deviceId, payload);
      await this.tryRecordActivityFromAccessToken(accessToken, {
        service: 'auth',
        action: 'system.device.updated',
        entityType: 'device',
        entityId: deviceId,
        summary: 'Device details updated',
        metadata: { ...payload },
      });
      return result;
    } catch (error) {
      this.rethrowDeviceActionError(error);
      throw error;
    }
  }

  @Post(':deviceId/suspend')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Suspend a device',
    description:
      'Takes a device out of service platform-wide. Releases any vehicle assignment and remembers where the device was so reinstating it does not restart the installation.',
  })
  @ApiOkResponse({ description: 'The suspended device' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiForbiddenResponse({ description: 'Caller is not permitted to suspend devices' })
  @ApiNotFoundResponse({ description: 'Device not found' })
  @ApiBadRequestResponse({ description: 'The device is already suspended, or has been decommissioned' })
  async suspendSystemDevice(
    @Param('deviceId') deviceId: string,
    @Body(BodyOrDataPipe) payload: SuspendSystemDeviceDto,
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');

    try {
      const result = await this.suspendSystemDeviceUseCase.execute(
        accessToken,
        deviceId,
        payload?.reason,
      );
      await this.tryRecordActivityFromAccessToken(accessToken, {
        service: 'auth',
        action: 'system.device.suspended',
        entityType: 'device',
        entityId: deviceId,
        summary: 'Device suspended',
        metadata: { reason: payload?.reason ?? null },
      });
      return result;
    } catch (error) {
      this.rethrowDeviceActionError(error);
      throw error;
    }
  }

  @Post(':deviceId/reinstate')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Reinstate a suspended device',
    description:
      'Returns a suspended device to service. A device that was assigned comes back assignable, because its vehicle link was released on suspension.',
  })
  @ApiOkResponse({ description: 'The reinstated device' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiForbiddenResponse({ description: 'Caller is not permitted to reinstate devices' })
  @ApiNotFoundResponse({ description: 'Device not found' })
  @ApiBadRequestResponse({ description: 'The device is not suspended' })
  async reinstateSystemDevice(
    @Param('deviceId') deviceId: string,
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');

    try {
      const result = await this.reinstateSystemDeviceUseCase.execute(accessToken, deviceId);
      await this.tryRecordActivityFromAccessToken(accessToken, {
        service: 'auth',
        action: 'system.device.reinstated',
        entityType: 'device',
        entityId: deviceId,
        summary: 'Device reinstated',
      });
      return result;
    } catch (error) {
      this.rethrowDeviceActionError(error);
      throw error;
    }
  }

  @Post(':deviceId/decommission')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Decommission a device',
    description:
      'Retires a device permanently and releases any vehicle assignment. One-way: nothing moves a device out of decommissioned. Tenants cannot do this; they can only mark a device faulty.',
  })
  @ApiOkResponse({ description: 'The decommissioned device' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiForbiddenResponse({ description: 'Caller is not permitted to decommission devices' })
  @ApiNotFoundResponse({ description: 'Device not found' })
  @ApiBadRequestResponse({ description: 'The device is already decommissioned' })
  async decommissionSystemDevice(
    @Param('deviceId') deviceId: string,
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');

    try {
      const result = await this.decommissionSystemDeviceUseCase.execute(accessToken, deviceId);
      await this.tryRecordActivityFromAccessToken(accessToken, {
        service: 'auth',
        action: 'system.device.decommissioned',
        entityType: 'device',
        entityId: deviceId,
        summary: 'Device decommissioned',
      });
      return result;
    } catch (error) {
      this.rethrowDeviceActionError(error);
      throw error;
    }
  }

  /** Fleet's refusal is passed through as it came, so the reason survives. */
  private rethrowDeviceActionError(error: unknown): void {
    this.rethrowInvalidAccessToken(error);
    if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
    if (error instanceof UserNotFoundError) throw new NotFoundException(error.message);
    if (error instanceof DeviceSuspensionRefusedError || error instanceof SystemDeviceWriteRefusedError) {
      if (error.httpStatus === 403) throw new ForbiddenException(error.message);
      if (error.httpStatus === 404) throw new NotFoundException(error.message);
      if (error.httpStatus === 400) throw new BadRequestException(error.message);
      if (error.httpStatus === 409) throw new ConflictException(error.message);
      throw new ServiceUnavailableException(error.message);
    }
  }

  // Declared AFTER every literal system/devices/* route so the :deviceId param
  // cannot swallow `summary`, `export`, or `catalog`.

  @Get(':deviceId')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get system device detail',
    description:
      'Returns the full detail record for a single device, including battery, firmware, and protocol.',
  })
  @ApiOkResponse({ type: SystemDeviceDetailResponse })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiForbiddenResponse({
    description: 'Caller is not permitted to view device inventory',
  })
  @ApiNotFoundResponse({ description: 'Device not found' })
  async getSystemDeviceDetail(
    @Param('deviceId') deviceId: string,
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');

    try {
      return await this.getSystemDeviceDetailUseCase.execute(
        accessToken,
        deviceId,
      );
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError)
        throw new ForbiddenException(error.message);
      if (error instanceof SystemDeviceNotFoundError)
        throw new NotFoundException(error.message);
      if (error instanceof UserNotFoundError)
        throw new NotFoundException(error.message);
      throw error;
    }
  }
}
