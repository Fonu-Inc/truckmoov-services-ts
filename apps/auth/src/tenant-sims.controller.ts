import {
  Res,
  ForbiddenException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  BadRequestException,
  Post,
  Inject,
  Headers,
  StreamableFile,
  Patch,
  UnauthorizedException,
  Query,
  UploadedFile,
  UseInterceptors,
  Delete,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { MAX_CSV_IMPORT_BYTES, uploadLimits } from '@shared/http';
import {
  ApiConsumes,
  ApiOkResponse,
  ApiTags,
  ApiProduces,
  ApiBearerAuth,
  ApiOperation,
  ApiCreatedResponse,
} from '@nestjs/swagger';
import { ActivityLogService } from './activity-log.service';
import { BaseAuthController } from './base.controller';
import { ForbiddenError } from './contexts/auth/session';
import { DeleteTenantSimUseCase } from './delete-tenant-sim.use-case';
import {
  DeviceMappingUploadResponse,
  TenantSimDetailResponse,
  TenantSimRequestsListResponse,
  IdResponse,
  CarriersListResponse,
  ImportSimsResponse,
  BundlePlansListResponse,
  TenantSimRequestDetailResponse,
  RequestIdResponse,
  TenantSimsListResponse,
  TenantSimActionResponse,
} from './dto/auth.schema';
import {
  UpdateTenantSimDto,
  ListSimsQueryDto,
  RegisterTenantSimDto,
  SuspendSimDto,
  SubmitSimRequestDto,
} from './dto/sim-management.dto';
import { ExportTenantSimsUseCase } from './export-tenant-sims.use-case';
import { GetDeviceMappingTemplateUseCase } from './get-device-mapping-template.use-case';
import { GetSimImportTemplateUseCase } from './get-sim-import-template.use-case';
import { GetTenantSimRequestUseCase } from './get-tenant-sim-request.use-case';
import { GetTenantSimUseCase } from './get-tenant-sim.use-case';
import { ImportTenantSimsCsvUseCase, CsvParseError } from './import-tenant-sims-csv.use-case';
import { ListBundleCatalogUseCase } from './list-bundle-catalog.use-case';
import { ListCarriersUseCase } from './list-carriers.use-case';
import { ListTenantSimRequestsUseCase } from './list-tenant-sim-requests.use-case';
import { SimNotFoundError as TenantSimNotFoundError, ListTenantSimsUseCase } from './list-tenant-sims.use-case';
import { ReactivateTenantSimUseCase } from './reactivate-tenant-sim.use-case';
import { RegisterTenantSimUseCase } from './register-tenant-sim.use-case';
import { SubmitTenantSimRequestUseCase } from './submit-tenant-sim-request.use-case';
import { SuspendTenantSimUseCase } from './suspend-tenant-sim.use-case';
import { UnassignDeviceFromSimUseCase } from './unassign-device-from-sim.use-case';
import { UpdateTenantSimUseCase } from './update-tenant-sim.use-case';
import { UploadDeviceMappingCsvUseCase } from './upload-device-mapping-csv.use-case';
import { Portals, OnResource } from '@shared/access';

@ApiTags('SIMs')
@Portals('tenant')
@OnResource('tenant.sims')
@Controller('sims')
export class TenantSimsController extends BaseAuthController {
  constructor(
    @Inject(ActivityLogService) activityLogService: ActivityLogService,
    @Inject(ListTenantSimsUseCase) private readonly listTenantSimsUseCase: ListTenantSimsUseCase,
    @Inject(GetTenantSimUseCase) private readonly getTenantSimUseCase: GetTenantSimUseCase,
    @Inject(RegisterTenantSimUseCase) private readonly registerTenantSimUseCase: RegisterTenantSimUseCase,
    @Inject(UpdateTenantSimUseCase) private readonly updateTenantSimUseCase: UpdateTenantSimUseCase,
    @Inject(SuspendTenantSimUseCase) private readonly suspendTenantSimUseCase: SuspendTenantSimUseCase,
    @Inject(ReactivateTenantSimUseCase) private readonly reactivateTenantSimUseCase: ReactivateTenantSimUseCase,
    @Inject(UnassignDeviceFromSimUseCase) private readonly unassignDeviceFromSimUseCase: UnassignDeviceFromSimUseCase,
    @Inject(DeleteTenantSimUseCase) private readonly deleteTenantSimUseCase: DeleteTenantSimUseCase,
    @Inject(ExportTenantSimsUseCase) private readonly exportTenantSimsUseCase: ExportTenantSimsUseCase,
    @Inject(GetSimImportTemplateUseCase) private readonly getSimImportTemplateUseCase: GetSimImportTemplateUseCase,
    @Inject(ImportTenantSimsCsvUseCase) private readonly importTenantSimsCsvUseCase: ImportTenantSimsCsvUseCase,
    @Inject(ListTenantSimRequestsUseCase) private readonly listTenantSimRequestsUseCase: ListTenantSimRequestsUseCase,
    @Inject(GetTenantSimRequestUseCase) private readonly getTenantSimRequestUseCase: GetTenantSimRequestUseCase,
    @Inject(SubmitTenantSimRequestUseCase) private readonly submitTenantSimRequestUseCase: SubmitTenantSimRequestUseCase,
    @Inject(GetDeviceMappingTemplateUseCase) private readonly getDeviceMappingTemplateUseCase: GetDeviceMappingTemplateUseCase,
    @Inject(UploadDeviceMappingCsvUseCase) private readonly uploadDeviceMappingCsvUseCase: UploadDeviceMappingCsvUseCase,
    @Inject(ListCarriersUseCase) private readonly listCarriersUseCase: ListCarriersUseCase,
    @Inject(ListBundleCatalogUseCase) private readonly listBundleCatalogUseCase: ListBundleCatalogUseCase,
  ) {
    super(activityLogService);
  }

  @Get()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List tenant SIMs' })
  @ApiOkResponse({ type: TenantSimsListResponse })
  async listTenantSims(@Query() query: ListSimsQueryDto, @Headers('authorization') authorization?: string) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      return await this.listTenantSimsUseCase.execute(accessToken, query);
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      throw error;
    }
  }

  @Get('export')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Export tenant SIMs' })
  @ApiOkResponse({ description: 'CSV/xlsx file', schema: { type: 'string', format: 'binary' } })
  @ApiProduces('text/csv', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  async exportTenantSims(@Query() query: ListSimsQueryDto, @Headers('authorization') authorization?: string, @Res({ passthrough: true }) res?: Response) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      const result = await this.exportTenantSimsUseCase.execute(accessToken, query);
      (res as any).set({ 'Content-Type': result.contentType, 'Content-Disposition': `attachment; filename="sims-export.${result.ext}"` });
      return new StreamableFile(result.buffer);
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      throw error;
    }
  }

  @Get('import/template')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Download SIM import CSV template' })
  @ApiOkResponse({ description: 'CSV template file', schema: { type: 'string', format: 'binary' } })
  @ApiProduces('text/csv')
  getSimImportTemplate(@Res({ passthrough: true }) res?: Response) {
    const { csv, filename } = this.getSimImportTemplateUseCase.execute();
    (res as any).set({ 'Content-Type': 'text/csv', 'Content-Disposition': `attachment; filename="${filename}"` });
    return new StreamableFile(Buffer.from(csv));
  }

  @Post('import')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Import SIMs from CSV' })
  @ApiCreatedResponse({ type: ImportSimsResponse })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', uploadLimits(MAX_CSV_IMPORT_BYTES)))
  async importTenantSimsCsv(@UploadedFile() file: { buffer: Buffer }, @Headers('authorization') authorization?: string) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    if (!file?.buffer) throw new BadRequestException('Missing file');
    try {
      return await this.importTenantSimsCsvUseCase.execute(accessToken, file.buffer);
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      if (error instanceof CsvParseError) throw new BadRequestException(error.message);
      throw error;
    }
  }

  @Get('carriers')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List active carriers for tenants' })
  @ApiOkResponse({ type: CarriersListResponse })
  async listSimCarriers(@Headers('authorization') authorization?: string) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      return await this.listCarriersUseCase.execute(accessToken, true);
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      throw error;
    }
  }

  @Get('data-bundles')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List bundle plans for tenants' })
  @ApiOkResponse({ type: BundlePlansListResponse })
  async listSimDataBundles(@Query('carrierId') carrierId?: string, @Query('billingCycle') billingCycle?: string, @Headers('authorization') authorization?: string) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      return await this.listBundleCatalogUseCase.execute(accessToken, { carrierId, billingCycle, activeOnly: true });
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      throw error;
    }
  }

  @Get('requests')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List tenant SIM requests' })
  @ApiOkResponse({ type: TenantSimRequestsListResponse })
  async listTenantSimRequests(@Headers('authorization') authorization?: string) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      return await this.listTenantSimRequestsUseCase.execute(accessToken);
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      throw error;
    }
  }

  @Get('requests/device-mapping/template')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Download device mapping CSV template' })
  @ApiOkResponse({ description: 'CSV template', schema: { type: 'string', format: 'binary' } })
  @ApiProduces('text/csv')
  getDeviceMappingTemplate(@Res({ passthrough: true }) res?: Response) {
    const { csv, filename } = this.getDeviceMappingTemplateUseCase.execute();
    (res as any).set({ 'Content-Type': 'text/csv', 'Content-Disposition': `attachment; filename="${filename}"` });
    return new StreamableFile(Buffer.from(csv));
  }

  @Post('requests/device-mapping')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Upload device mapping CSV' })
  @ApiCreatedResponse({ type: DeviceMappingUploadResponse })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', uploadLimits(MAX_CSV_IMPORT_BYTES)))
  async uploadDeviceMappingCsv(@UploadedFile() file: { buffer: Buffer }, @Headers('authorization') authorization?: string) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    if (!file?.buffer) throw new BadRequestException('Missing file');
    try {
      return await this.uploadDeviceMappingCsvUseCase.execute(accessToken, file.buffer);
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      throw error;
    }
  }

  @Post('requests')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Submit SIM provisioning request' })
  @ApiCreatedResponse({ type: RequestIdResponse })
  async submitTenantSimRequest(@Body() payload: SubmitSimRequestDto, @Headers('authorization') authorization?: string) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      return await this.submitTenantSimRequestUseCase.execute(accessToken, payload);
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      throw error;
    }
  }

  @Get('requests/:id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get tenant SIM request detail' })
  @ApiOkResponse({ type: TenantSimRequestDetailResponse })
  async getTenantSimRequest(@Param('id') id: string, @Headers('authorization') authorization?: string) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      return await this.getTenantSimRequestUseCase.execute(accessToken, id);
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      if (error instanceof TenantSimNotFoundError) throw new NotFoundException(error.message);
      throw error;
    }
  }

  @Post()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Register a SIM' })
  @ApiCreatedResponse({ type: IdResponse })
  async registerTenantSim(@Body() payload: RegisterTenantSimDto, @Headers('authorization') authorization?: string) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      return await this.registerTenantSimUseCase.execute(accessToken, payload);
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      throw error;
    }
  }

  @Get(':id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get SIM detail' })
  @ApiOkResponse({ type: TenantSimDetailResponse })
  async getTenantSim(@Param('id') id: string, @Headers('authorization') authorization?: string) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      return await this.getTenantSimUseCase.execute(accessToken, id);
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      if (error instanceof TenantSimNotFoundError) throw new NotFoundException(error.message);
      throw error;
    }
  }

  @Patch(':id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update SIM' })
  @ApiOkResponse({ type: TenantSimDetailResponse })
  async updateTenantSim(@Param('id') id: string, @Body() payload: UpdateTenantSimDto, @Headers('authorization') authorization?: string) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      return await this.updateTenantSimUseCase.execute(accessToken, id, payload);
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      if (error instanceof TenantSimNotFoundError) throw new NotFoundException(error.message);
      throw error;
    }
  }

  @Post(':id/suspend')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Suspend SIM' })
  @ApiOkResponse({ type: TenantSimActionResponse })
  async suspendTenantSim(@Param('id') id: string, @Body() payload: SuspendSimDto, @Headers('authorization') authorization?: string) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      return await this.suspendTenantSimUseCase.execute(accessToken, id, payload);
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      if (error instanceof TenantSimNotFoundError) throw new NotFoundException(error.message);
      throw error;
    }
  }

  @Post(':id/reactivate')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Reactivate SIM' })
  @ApiOkResponse({ type: TenantSimActionResponse })
  async reactivateTenantSim(@Param('id') id: string, @Headers('authorization') authorization?: string) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      return await this.reactivateTenantSimUseCase.execute(accessToken, id);
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      if (error instanceof TenantSimNotFoundError) throw new NotFoundException(error.message);
      throw error;
    }
  }

  @Delete(':id/device')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Unassign device from SIM' })
  @ApiOkResponse({ type: TenantSimActionResponse })
  async unassignDeviceFromSim(@Param('id') id: string, @Headers('authorization') authorization?: string) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      return await this.unassignDeviceFromSimUseCase.execute(accessToken, id);
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      if (error instanceof TenantSimNotFoundError) throw new NotFoundException(error.message);
      throw error;
    }
  }

  @Delete(':id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete SIM' })
  @ApiOkResponse({ type: TenantSimActionResponse })
  async deleteTenantSim(@Param('id') id: string, @Headers('authorization') authorization?: string) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      return await this.deleteTenantSimUseCase.execute(accessToken, id);
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      if (error instanceof TenantSimNotFoundError) throw new NotFoundException(error.message);
      throw error;
    }
  }

  // ─── System: Carriers & Bundle Catalog ────────────────────────────────────
}
