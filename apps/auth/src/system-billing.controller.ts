import {
  ForbiddenException,
  BadGatewayException,
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
} from '@nestjs/swagger';
import { ActivityLogService } from './activity-log.service';
import { BaseAuthController } from './base.controller';
import { ForbiddenError } from './contexts/auth/session';
import { CreateSystemBundleUseCase } from './create-system-bundle.use-case';
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
import { GetSystemBundleAdoptionUseCase } from './get-system-bundle-adoption.use-case';
import { SyncMtnBundleCatalogUseCase } from './sync-mtn-bundle-catalog.use-case';
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
  @ApiOperation({ summary: 'List cross-tenant bundle adoption (system admin)' })
  async listBundleAdoption(@Query('search') search: string | undefined, @Headers('authorization') authorization?: string) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      return await this.getSystemBundleAdoptionUseCase.execute(accessToken, { search });
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      throw error;
    }
  }

  @Get('bundle-adoption/export')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Export cross-tenant bundle adoption (system admin)' })
  async exportBundleAdoption(@Query('search') search: string | undefined, @Query('format') format: 'csv' | 'xlsx' | undefined, @Headers('authorization') authorization: string | undefined, @Res() response: any) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      const result = await this.getSystemBundleAdoptionUseCase.export(accessToken, { search, format });
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
  async syncMtnBundleCatalog(@Headers('authorization') authorization?: string) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      return await this.syncMtnBundleCatalogUseCase.execute(accessToken);
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
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
