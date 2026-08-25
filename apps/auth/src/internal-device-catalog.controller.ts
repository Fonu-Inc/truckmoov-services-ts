import {
  Controller,
  Get,
  Headers,
  Inject,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { BaseAuthController } from './base.controller';
import { ActivityLogService } from './activity-log.service';
import { TOKEN_SERVICE } from './contexts/auth/session';
import type { TokenService } from './contexts/auth/session/domain/ports/token-service.port';
import {
  DEVICE_MODEL_CATALOG_REPOSITORY,
  type DeviceModelCatalogRepository,
} from './device-model-catalog.repository';
import { toSystemDeviceModelResponse } from './system-device-model.presenter';

/**
 * Read-only device catalogue for other services.
 *
 * Fleet runs the installation queue and has to show the protocol, the port and
 * the fitting instructions for each model. That is platform reference data,
 * not tenant data, so it stays owned here and is read from here. A second copy
 * in fleet would drift the moment a model's port changed.
 *
 * Any valid service token reads it. The platform-admin endpoints that write the
 * catalogue are elsewhere and stay behind their own check: a service needing
 * to read reference data is not a reason to hand it an admin role.
 */
@ApiExcludeController()
@Controller('internal/device-catalog')
export class InternalDeviceCatalogController extends BaseAuthController {
  constructor(
    protected readonly activityLogService: ActivityLogService,
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(DEVICE_MODEL_CATALOG_REPOSITORY)
    private readonly catalog: DeviceModelCatalogRepository,
  ) {
    super(activityLogService);
  }

  @Get('models')
  async models(
    @Headers('authorization') authorization?: string,
    @Query('manufacturer') manufacturer?: string,
    @Query('model') model?: string,
  ) {
    this.assertServiceCaller(authorization);

    if (manufacturer?.trim() && model?.trim()) {
      const found = await this.catalog.findByManufacturerAndModel(
        manufacturer.trim(),
        model.trim(),
      );
      return {
        status: true,
        message: 'success',
        data: { models: found ? [toSystemDeviceModelResponse(found)] : [] },
      };
    }

    const models = await this.catalog.findAll();
    return {
      status: true,
      message: 'success',
      data: { models: models.map(toSystemDeviceModelResponse) },
    };
  }

  private assertServiceCaller(authorization?: string): void {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');

    const actor = this.tokenService.resolveAccessToken(accessToken);
    if (!actor) throw new UnauthorizedException('Invalid service token');
  }
}
