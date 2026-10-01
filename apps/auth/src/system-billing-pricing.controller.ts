import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  Headers,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { OnResource, Portals, Requires } from '@shared/access';
import { BillingActorResolver } from './billing-actor';
import { rethrowActorError } from './base.controller';
import {
  CreateLicensePlanUseCase,
} from '@auth/onboarding/application/use-cases/billing/create-license-plan.use-case';
import {
  GetInstallationPriceUseCase,
  UpdateInstallationPriceUseCase,
} from '@auth/onboarding/application/use-cases/billing/installation-price.use-cases';
import {
  GetLicensePlanUseCase,
  ListLicensePlansUseCase,
} from '@auth/onboarding/application/use-cases/billing/list-license-plans.use-cases';
import { ListPriceChangesUseCase } from '@auth/onboarding/application/use-cases/billing/list-price-changes.use-case';
import { SetLicensePlanActiveUseCase } from '@auth/onboarding/application/use-cases/billing/set-license-plan-active.use-case';
import { UpdateLicensePlanUseCase } from '@auth/onboarding/application/use-cases/billing/update-license-plan.use-case';
import {
  BillingConflictError,
  BillingNotFoundError,
  BillingValidationError,
} from '@auth/onboarding/domain/billing-errors';
import type { BillingActor } from '@auth/onboarding/domain/ports/billing-audit.port';
import {
  CreateLicensePlanDto,
  InstallationPriceResponse,
  LicensePlanActionResponse,
  LicensePlanDetailResponse,
  LicensePlansPageResponse,
  LicensePlanUpdateResponse,
  ListLicensePlansQueryDto,
  ListPriceHistoryQueryDto,
  PriceChangesPageResponse,
  UpdateInstallationPriceDto,
  UpdateLicensePlanDto,
} from './dto/billing-pricing.dto';

function bearer(authorization?: string): string {
  const [scheme, token] = (authorization ?? '').split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) {
    throw new UnauthorizedException('Missing authorization');
  }
  return token;
}

async function mapped<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    rethrowActorError(error);
    if (error instanceof BillingValidationError) throw new BadRequestException(error.message);
    if (error instanceof BillingNotFoundError) throw new NotFoundException(error.message);
    if (error instanceof BillingConflictError) throw new ConflictException(error.message);
    throw error;
  }
}

@ApiTags('System Billing')
@ApiBearerAuth()
@Portals('admin')
@OnResource('admin.billing')
@Controller('system/billing')
export class SystemBillingPricingController {
  constructor(
    @Inject(BillingActorResolver) private readonly actors: BillingActorResolver,
    @Inject(ListLicensePlansUseCase) private readonly listPlans: ListLicensePlansUseCase,
    @Inject(GetLicensePlanUseCase) private readonly getPlan: GetLicensePlanUseCase,
    @Inject(CreateLicensePlanUseCase) private readonly createPlan: CreateLicensePlanUseCase,
    @Inject(UpdateLicensePlanUseCase) private readonly updatePlan: UpdateLicensePlanUseCase,
    @Inject(SetLicensePlanActiveUseCase) private readonly setActive: SetLicensePlanActiveUseCase,
    @Inject(ListPriceChangesUseCase) private readonly priceHistory: ListPriceChangesUseCase,
    @Inject(GetInstallationPriceUseCase) private readonly getInstallation: GetInstallationPriceUseCase,
    @Inject(UpdateInstallationPriceUseCase) private readonly updateInstallation: UpdateInstallationPriceUseCase,
  ) {}

  private actor(authorization?: string): Promise<BillingActor> {
    return this.actors.resolve(bearer(authorization));
  }

  @Get('plans')
  @Requires('admin.billing.read')
  @ApiOperation({ summary: 'List licence plans, inactive ones included' })
  @ApiOkResponse({ type: LicensePlansPageResponse })
  async list(@Query() query: ListLicensePlansQueryDto, @Headers('authorization') authorization?: string) {
    return mapped(async () => {
      await this.actor(authorization);
      return this.listPlans.execute(query);
    });
  }

  @Get('plans/:code')
  @Requires('admin.billing.read')
  @ApiOperation({ summary: 'One licence plan with its recent price history' })
  @ApiOkResponse({ type: LicensePlanDetailResponse })
  async get(@Param('code') code: string, @Headers('authorization') authorization?: string) {
    return mapped(async () => {
      await this.actor(authorization);
      return this.getPlan.execute(code);
    });
  }

  @Post('plans')
  @Requires('admin.billing.manage')
  @ApiOperation({ summary: 'Create a licence plan' })
  @ApiCreatedResponse({ type: LicensePlanActionResponse })
  async create(@Body() body: CreateLicensePlanDto, @Headers('authorization') authorization?: string) {
    return mapped(async () => this.createPlan.execute(await this.actor(authorization), body));
  }

  @Patch('plans/:code')
  @Requires('admin.billing.manage')
  @ApiOperation({ summary: 'Edit a licence plan; a price change needs a reason and is recorded' })
  @ApiOkResponse({ type: LicensePlanUpdateResponse })
  async update(@Param('code') code: string, @Body() body: UpdateLicensePlanDto, @Headers('authorization') authorization?: string) {
    return mapped(async () => this.updatePlan.execute(await this.actor(authorization), code, body));
  }

  @Post('plans/:code/activate')
  @HttpCode(200)
  @Requires('admin.billing.manage')
  @ApiOperation({ summary: 'Make a licence plan available again' })
  @ApiOkResponse({ type: LicensePlanActionResponse })
  async activate(@Param('code') code: string, @Headers('authorization') authorization?: string) {
    return mapped(async () => this.setActive.execute(await this.actor(authorization), code, true));
  }

  @Post('plans/:code/deactivate')
  @HttpCode(200)
  @Requires('admin.billing.manage')
  @ApiOperation({ summary: 'Stop offering a licence plan; plans are never deleted' })
  @ApiOkResponse({ type: LicensePlanActionResponse })
  async deactivate(@Param('code') code: string, @Headers('authorization') authorization?: string) {
    return mapped(async () => this.setActive.execute(await this.actor(authorization), code, false));
  }

  @Get('price-history')
  @Requires('admin.billing.read')
  @ApiOperation({ summary: 'Price changes for licence plans and the installation fee' })
  @ApiOkResponse({ type: PriceChangesPageResponse })
  async history(@Query() query: ListPriceHistoryQueryDto, @Headers('authorization') authorization?: string) {
    return mapped(async () => {
      await this.actor(authorization);
      return this.priceHistory.execute(query);
    });
  }

  @Get('installation-price')
  @Requires('admin.billing.read')
  @ApiOperation({ summary: 'Per-device installation price by applicant audience' })
  @ApiOkResponse({ type: InstallationPriceResponse })
  async installationPrice(@Headers('authorization') authorization?: string) {
    return mapped(async () => {
      await this.actor(authorization);
      return this.getInstallation.execute();
    });
  }

  @Put('installation-price')
  @Requires('admin.billing.manage')
  @ApiOperation({ summary: 'Set the installation price; a change needs a reason and is recorded' })
  @ApiOkResponse({ type: InstallationPriceResponse })
  async setInstallationPrice(@Body() body: UpdateInstallationPriceDto, @Headers('authorization') authorization?: string) {
    return mapped(async () => this.updateInstallation.execute(await this.actor(authorization), body));
  }
}
