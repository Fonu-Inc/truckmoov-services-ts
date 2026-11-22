import {
  BadRequestException,
  ForbiddenException,
  BadGatewayException,
  ConflictException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Inject,
  Headers,
  Patch,
  Query,
  UnauthorizedException,
  Delete,
  NotFoundException,
  Res,
} from '@nestjs/common';
import {
  ApiOkResponse,
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiCreatedResponse,
  ApiConflictResponse,
  ApiQuery,
} from '@nestjs/swagger';
import { ActivityLogService } from './activity-log.service';
import { BaseAuthController } from './base.controller';
import { ForbiddenError } from './contexts/auth/session';
import { BundleCodeTakenError, CreateSystemBundleUseCase } from './create-system-bundle.use-case';
import { CreateSystemCarrierUseCase } from './create-system-carrier.use-case';
import { DeleteSystemBundleUseCase } from './delete-system-bundle.use-case';
import { SystemCarrierActionResponse, SystemBundleActionResponse, MessageResponse, BundlePlansListResponse } from './dto/auth.schema';
import {
  UpdateBundleDto,
  CreateCarrierDto,
  CreateBundleDto,
  UpdateCarrierDto,
  ListSystemBundleCatalogQueryDto,
} from './dto/sim-management.dto';
import { ListSystemBundleCatalogUseCase } from './list-system-bundle-catalog.use-case';
import { BundleNotFoundError, UpdateSystemBundleUseCase } from './update-system-bundle.use-case';
import { CarrierNotFoundError, UpdateSystemCarrierUseCase } from './update-system-carrier.use-case';
import { BUNDLE_TYPES, GetSystemBundleAdoptionUseCase, type BundleType } from './get-system-bundle-adoption.use-case';
import { SyncMtnBundleCatalogUseCase, MtnBundleSyncBusyError } from './sync-mtn-bundle-catalog.use-case';
import { MtnApiError } from './contexts/mtn/mtn-m2m.client';
import { Portals, OnResource } from '@shared/access';

@ApiTags('System Billing')
@Portals('admin')
@OnResource('admin.billing')
@Controller('system')
export class SystemBillingController extends BaseAuthController {
  constructor(
    @Inject(ActivityLogService) activityLogService: ActivityLogService,
    @Inject(CreateSystemCarrierUseCase) private readonly createSystemCarrierUseCase: CreateSystemCarrierUseCase,
    @Inject(UpdateSystemCarrierUseCase) private readonly updateSystemCarrierUseCase: UpdateSystemCarrierUseCase,
    @Inject(CreateSystemBundleUseCase) private readonly createSystemBundleUseCase: CreateSystemBundleUseCase,
    @Inject(UpdateSystemBundleUseCase) private readonly updateSystemBundleUseCase: UpdateSystemBundleUseCase,
    @Inject(DeleteSystemBundleUseCase) private readonly deleteSystemBundleUseCase: DeleteSystemBundleUseCase,
    @Inject(ListSystemBundleCatalogUseCase) private readonly listSystemBundleCatalogUseCase: ListSystemBundleCatalogUseCase,
    @Inject(GetSystemBundleAdoptionUseCase) private readonly getSystemBundleAdoptionUseCase: GetSystemBundleAdoptionUseCase,
    @Inject(SyncMtnBundleCatalogUseCase) private readonly syncMtnBundleCatalogUseCase: SyncMtnBundleCatalogUseCase,
  ) {
    super(activityLogService);
  }

  @Get('bundle-adoption')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List cross-tenant bundle adoption (system admin)', description: 'Each tenant with, per line, the bundle on it: kind (subscription or top_up), price, days until expiry and the vehicle plate. Search and bundleType keep whole SIMs.' })
  @ApiQuery({ name: 'bundleType', required: false, enum: BUNDLE_TYPES, description: 'Only SIMs with a bundle of this kind' })
  async listBundleAdoption(@Query('search') search: string | undefined, @Query('bundleType') bundleType: string | undefined, @Headers('authorization') authorization?: string) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      return await this.getSystemBundleAdoptionUseCase.execute(accessToken, { search, bundleType: parseBundleType(bundleType) });
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      throw error;
    }
  }

  @Get('bundle-adoption/export')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Export cross-tenant bundle adoption (system admin)', description: 'One row per live bundle on a SIM, for the same search and bundleType as the list.' })
  @ApiQuery({ name: 'bundleType', required: false, enum: BUNDLE_TYPES })
  async exportBundleAdoption(@Query('search') search: string | undefined, @Query('bundleType') bundleType: string | undefined, @Query('format') format: 'csv' | 'xlsx' | undefined, @Headers('authorization') authorization: string | undefined, @Res() response: any) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      const result = await this.getSystemBundleAdoptionUseCase.export(accessToken, { search, bundleType: parseBundleType(bundleType), format });
      response.setHeader('Content-Type', result.contentType);
      response.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
      return response.send(result.buffer);
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      throw error;
    }
  }

  @Post('carriers')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create carrier (system admin)' })
  @ApiCreatedResponse({ type: SystemCarrierActionResponse })
  async createSystemCarrier(@Body() payload: CreateCarrierDto, @Headers('authorization') authorization?: string) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      return await this.createSystemCarrierUseCase.execute(accessToken, payload);
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      throw error;
    }
  }

  @Patch('carriers/:id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update carrier (system admin)' })
  @ApiOkResponse({ type: SystemCarrierActionResponse })
  async updateSystemCarrier(@Param('id') id: string, @Body() payload: UpdateCarrierDto, @Headers('authorization') authorization?: string) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      return await this.updateSystemCarrierUseCase.execute(accessToken, id, payload);
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      if (error instanceof CarrierNotFoundError) throw new NotFoundException(error.message);
      throw error;
    }
  }

  @Get('bundle-catalog')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List bundle catalog (system admin)' })
  @ApiOkResponse({ type: BundlePlansListResponse })
  async listSystemBundleCatalog(
    @Query() query: ListSystemBundleCatalogQueryDto,
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      return await this.listSystemBundleCatalogUseCase.execute(accessToken, {
        carrierId: query.carrierId,
        billingCycle: query.billingCycle,
        search: query.search,
        active: query.status === 'all' || query.status === undefined ? undefined : query.status === 'active',
        page: query.page,
        limit: query.limit,
      });
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      throw error;
    }
  }

  @Get('bundle-catalog/summary')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Bundle figures for the M2M bundles page (system admin)', description: 'Active bundles in the catalogue, live bundles expiring within 7 days, SIMs across tenants with bundles, and what live bundles cost per month.' })
  async getSystemBundleSummary(@Headers('authorization') authorization?: string) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      return await this.getSystemBundleAdoptionUseCase.summary(accessToken);
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      throw error;
    }
  }

  @Get('bundle-catalog/export')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Export the bundle catalog (system admin)', description: 'Every bundle the filters match, as csv (default) or xlsx.' })
  async exportSystemBundleCatalog(
    @Query() query: ListSystemBundleCatalogQueryDto,
    @Query('format') format: 'csv' | 'xlsx' | undefined,
    @Headers('authorization') authorization: string | undefined,
    @Res() response: any,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      const result = await this.listSystemBundleCatalogUseCase.export(accessToken, {
        carrierId: query.carrierId,
        billingCycle: query.billingCycle,
        search: query.search,
        active: query.status === 'all' || query.status === undefined ? undefined : query.status === 'active',
        format,
      });
      response.setHeader('Content-Type', result.contentType);
      response.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
      return response.send(result.buffer);
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      throw error;
    }
  }

  @Post('bundle-catalog')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create bundle plan (system admin)' })
  @ApiCreatedResponse({ type: SystemBundleActionResponse })
  async createSystemBundle(@Body() payload: CreateBundleDto, @Headers('authorization') authorization?: string) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      return await this.createSystemBundleUseCase.execute(accessToken, payload);
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof BundleCodeTakenError) throw new ConflictException(error.message);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      throw error;
    }
  }

  @Post('bundle-catalog/sync-mtn')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Pull the MTN M2M catalogue and refresh bundle prices (system admin)',
  })
  @ApiOkResponse({ description: 'Sync summary: fetched, created, updated, deactivated, skipped.' })
  @ApiConflictResponse({ description: 'Another MTN catalogue sync is already running.' })
  async syncMtnBundleCatalog(@Headers('authorization') authorization?: string) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      return await this.syncMtnBundleCatalogUseCase.execute(accessToken);
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      if (error instanceof MtnBundleSyncBusyError) throw new ConflictException(error.message);
      if (error instanceof MtnApiError) {
        throw new BadGatewayException(error.message);
      }
      throw error;
    }
  }

  @Patch('bundle-catalog/:id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update bundle plan (system admin)' })
  @ApiOkResponse({ type: SystemBundleActionResponse })
  async updateSystemBundle(@Param('id') id: string, @Body() payload: UpdateBundleDto, @Headers('authorization') authorization?: string) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      return await this.updateSystemBundleUseCase.execute(accessToken, id, payload);
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      if (error instanceof BundleNotFoundError) throw new NotFoundException(error.message);
      throw error;
    }
  }

  @Delete('bundle-catalog/:id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete bundle plan (system admin)' })
  @ApiOkResponse({ type: MessageResponse })
  async deleteSystemBundle(@Param('id') id: string, @Headers('authorization') authorization?: string) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      return await this.deleteSystemBundleUseCase.execute(accessToken, id);
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      if (error instanceof BundleNotFoundError) throw new NotFoundException(error.message);
      throw error;
    }
  }

  // ─── Data Bundle Dashboard ─────────────────────────────────────────────────
}

function parseBundleType(value: string | undefined): BundleType | undefined {
  if (!value) return undefined;
  if (!(BUNDLE_TYPES as readonly string[]).includes(value)) {
    throw new BadRequestException(`bundleType must be one of ${BUNDLE_TYPES.join(', ')}`);
  }
  return value as BundleType;
}
