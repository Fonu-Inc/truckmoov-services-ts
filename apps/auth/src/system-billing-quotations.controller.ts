import { Controller, Get, Headers, Inject, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { OnResource, Portals, Requires } from '@shared/access';
import { BillingActorResolver } from './billing-actor';
import { bearerToken, mapBillingErrors } from './billing-controller.support';
import {
  GetQuotationUseCase,
  ListQuotationsUseCase,
} from '@auth/onboarding/application/use-cases/billing/quotation-queries.use-cases';
import {
  ListQuotationsQueryDto,
  QuotationDetailResponse,
  QuotationsPageResponse,
} from './dto/billing-quotations.dto';

@ApiTags('System Billing')
@ApiBearerAuth()
@Portals('admin')
@OnResource('admin.billing')
@Controller('system/billing')
export class SystemBillingQuotationsController {
  constructor(
    @Inject(BillingActorResolver) private readonly actors: BillingActorResolver,
    @Inject(ListQuotationsUseCase) private readonly listQuotations: ListQuotationsUseCase,
    @Inject(GetQuotationUseCase) private readonly getQuotation: GetQuotationUseCase,
  ) {}

  @Get('quotations')
  @Requires('admin.billing.read')
  @ApiOperation({ summary: 'Quotation history, newest first' })
  @ApiOkResponse({ type: QuotationsPageResponse })
  async list(@Query() query: ListQuotationsQueryDto, @Headers('authorization') authorization?: string) {
    return mapBillingErrors(async () => {
      await this.actors.resolve(bearerToken(authorization));
      return this.listQuotations.execute(query);
    });
  }

  @Get('quotations/:id')
  @Requires('admin.billing.read')
  @ApiOperation({ summary: 'One quotation with its lines and linked payments' })
  @ApiOkResponse({ type: QuotationDetailResponse })
  async get(@Param('id') id: string, @Headers('authorization') authorization?: string) {
    return mapBillingErrors(async () => {
      await this.actors.resolve(bearerToken(authorization));
      return this.getQuotation.execute(id);
    });
  }
}
