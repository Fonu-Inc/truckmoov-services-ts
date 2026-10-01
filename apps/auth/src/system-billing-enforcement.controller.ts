import { Body, Controller, Get, Headers, Inject, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { OnResource, Portals, Requires } from '@shared/access';
import { BillingActorResolver } from './billing-actor';
import { bearerToken, mapBillingErrors } from './billing-controller.support';
import { GetEnforcementSettingsUseCase } from '@auth/onboarding/application/use-cases/billing/get-enforcement-settings.use-case';
import { ListEnforcementUseCase } from '@auth/onboarding/application/use-cases/billing/list-enforcement.use-case';
import { PreviewEnforcementUseCase } from '@auth/onboarding/application/use-cases/billing/preview-enforcement.use-case';
import { UpdateEnforcementSettingsUseCase } from '@auth/onboarding/application/use-cases/billing/update-enforcement-settings.use-case';
import {
  EnforcementListResponse,
  EnforcementPreviewResponse,
  EnforcementSettingsResponse,
  ListEnforcementQueryDto,
  UpdateEnforcementSettingsDto,
} from './dto/billing-enforcement.dto';

@ApiTags('System Billing')
@ApiBearerAuth()
@Portals('admin')
@OnResource('admin.billing')
@Controller('system/billing')
export class SystemBillingEnforcementController {
  constructor(
    @Inject(BillingActorResolver) private readonly actors: BillingActorResolver,
    @Inject(GetEnforcementSettingsUseCase) private readonly getSettings: GetEnforcementSettingsUseCase,
    @Inject(UpdateEnforcementSettingsUseCase) private readonly updateSettings: UpdateEnforcementSettingsUseCase,
    @Inject(ListEnforcementUseCase) private readonly listEnforcement: ListEnforcementUseCase,
    @Inject(PreviewEnforcementUseCase) private readonly previewEnforcement: PreviewEnforcementUseCase,
  ) {}

  @Get('enforcement-settings')
  @Requires('admin.billing.read')
  @ApiOperation({ summary: 'Grace days and automatic suspension switches' })
  @ApiOkResponse({ type: EnforcementSettingsResponse })
  async settings(@Headers('authorization') authorization?: string) {
    return mapBillingErrors(async () =>
      this.getSettings.execute(await this.actors.resolve(bearerToken(authorization))),
    );
  }

  @Put('enforcement-settings')
  @Requires('admin.billing.manage')
  @ApiOperation({ summary: 'Change grace days or the automatic suspension switches; needs a reason' })
  @ApiOkResponse({ type: EnforcementSettingsResponse })
  async update(@Body() body: UpdateEnforcementSettingsDto, @Headers('authorization') authorization?: string) {
    return mapBillingErrors(async () =>
      this.updateSettings.execute(await this.actors.resolve(bearerToken(authorization)), body),
    );
  }

  @Get('enforcement')
  @Requires('admin.billing.read')
  @ApiOperation({ summary: 'Customers behind on payment, with grace stage and suspension status' })
  @ApiOkResponse({ type: EnforcementListResponse })
  async list(@Query() query: ListEnforcementQueryDto, @Headers('authorization') authorization?: string) {
    return mapBillingErrors(async () =>
      this.listEnforcement.execute(await this.actors.resolve(bearerToken(authorization)), query),
    );
  }

  @Get('enforcement/preview')
  @Requires('admin.billing.read')
  @ApiOperation({ summary: 'Exactly who would be warned and suspended if automatic suspension ran now' })
  @ApiOkResponse({ type: EnforcementPreviewResponse })
  async preview(@Headers('authorization') authorization?: string) {
    return mapBillingErrors(async () =>
      this.previewEnforcement.execute(await this.actors.resolve(bearerToken(authorization))),
    );
  }
}
