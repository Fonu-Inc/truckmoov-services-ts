import {
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
  ApiCreatedResponse,
} from '@nestjs/swagger';
import { ActivityLogService } from './activity-log.service';
import { BaseAuthController } from './base.controller';
import { BodyOrDataPipe } from './body-or-data.pipe';
import { UserNotFoundError, ForbiddenError } from './contexts/auth/session';
import { CreateSystemDeviceModelUseCase } from './create-system-device-model.use-case';
import { DeleteSystemDeviceModelUseCase } from './delete-system-device-model.use-case';
import {
  SystemDeviceCatalogModelResponse,
  SystemDeviceCatalogListResponse,
  SystemDeviceCatalogDeleteResponse,
  SystemDeviceSummaryResponse,
  SystemDeviceInventoryListResponse,
  SystemDeviceDetailResponse,
} from './dto/auth.schema';
import { CreateSystemDeviceModelDto } from './dto/create-system-device-model.dto';
import { UpdateSystemDeviceModelDto } from './dto/update-system-device-model.dto';
import { ExportSystemDeviceCatalogUseCase } from './export-system-device-catalog.use-case';
import { ExportSystemDeviceInventoryUseCase } from './export-system-device-inventory.use-case';
import { GetSystemDeviceDetailUseCase, SystemDeviceNotFoundError } from './get-system-device-detail.use-case';
import { GetSystemDeviceSummaryUseCase } from './get-system-device-summary.use-case';
import { ListSystemDeviceCatalogUseCase } from './list-system-device-catalog.use-case';
import { ListSystemDeviceInventoryUseCase } from './list-system-device-inventory.use-case';
import { SystemDeviceModelConflictError, SystemDeviceModelNotFoundError } from './system-device-model.errors';
import { UpdateSystemDeviceModelUseCase } from './update-system-device-model.use-case';

@ApiTags('System Devices')
@Controller('system/devices')
export class SystemDevicesController extends BaseAuthController {
  constructor(
    @Inject(CreateSystemDeviceModelUseCase) private readonly createSystemDeviceModelUseCase: CreateSystemDeviceModelUseCase,
    @Inject(DeleteSystemDeviceModelUseCase) private readonly deleteSystemDeviceModelUseCase: DeleteSystemDeviceModelUseCase,
    @Inject(ExportSystemDeviceInventoryUseCase) private readonly exportSystemDeviceInventoryUseCase: ExportSystemDeviceInventoryUseCase,
    @Inject(GetSystemDeviceSummaryUseCase) private readonly getSystemDeviceSummaryUseCase: GetSystemDeviceSummaryUseCase,
    @Inject(ListSystemDeviceCatalogUseCase) private readonly listSystemDeviceCatalogUseCase: ListSystemDeviceCatalogUseCase,
    @Inject(ListSystemDeviceInventoryUseCase) private readonly listSystemDeviceInventoryUseCase: ListSystemDeviceInventoryUseCase,
    @Inject(GetSystemDeviceDetailUseCase) private readonly getSystemDeviceDetailUseCase: GetSystemDeviceDetailUseCase,
    @Inject(UpdateSystemDeviceModelUseCase) private readonly updateSystemDeviceModelUseCase: UpdateSystemDeviceModelUseCase,
    @Inject(ActivityLogService) activityLogService: ActivityLogService,
    @Inject(ExportSystemDeviceCatalogUseCase) private readonly exportSystemDeviceCatalogUseCase: ExportSystemDeviceCatalogUseCase,
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
    enum: [
      'registered',
      'configured',
      'assigned',
      'active',
      'faulty',
      'decommissioned',
    ],
  })
  @ApiQuery({
    name: 'lifecycleStatus',
    required: false,
    enum: [
      'registered',
      'config_pending',
      'configured',
      'verified_online',
      'assignable',
      'assigned',
      'faulty',
      'decommissioned',
    ],
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
    enum: [
      'registered',
      'configured',
      'assigned',
      'active',
      'faulty',
      'decommissioned',
    ],
  })
  @ApiQuery({
    name: 'lifecycleStatus',
    required: false,
    enum: [
      'registered',
      'config_pending',
      'configured',
      'verified_online',
      'assignable',
      'assigned',
      'faulty',
      'decommissioned',
    ],
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
      'Creates a manufacturer/model entry in the global device catalog used by system admins and tenant onboarding.',
  })
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
