import { Controller, Get, Inject, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Portals } from '@shared/access';
import { AppConfigService } from '@shared/config';

/** What the mobile app checks at start-up to decide whether this build may still run. */
@ApiTags('App Version')
@Portals('public')
@Controller('app-version')
export class AppVersionController {
  constructor(@Inject(AppConfigService) private readonly config: AppConfigService) {}

  @Get()
  @ApiOperation({ summary: 'Oldest mobile build still supported, and the store page to update from' })
  @ApiQuery({ name: 'platform', required: false, enum: ['android', 'ios'] })
  @ApiOkResponse()
  get(@Query('platform') platform?: string) {
    const { minVersion, latestVersion, storeUrls } = this.config.mobileApp;
    return {
      status: true,
      message: 'success',
      data: { minVersion, latestVersion, storeUrl: storeUrls[platform === 'ios' ? 'ios' : 'android'] },
    };
  }
}
