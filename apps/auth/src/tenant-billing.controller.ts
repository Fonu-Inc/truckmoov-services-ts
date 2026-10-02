import {
  BadRequestException,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  HttpException,
  HttpStatus,
  Inject,
  Param,
  Post,
  Query,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SYSTEM_TENANT_ID } from '@shared/identity';
import { OnResource, Portals } from '@shared/access';
import { ForbiddenError } from '@auth/session';
import { BillingActorResolver } from './billing-actor';
import { bearerToken, mapBillingErrors } from './billing-controller.support';
import {
  GetTenantInvoiceUseCase,
  GetTenantLicenceUseCase,
  ListTenantInvoicesUseCase,
} from '@auth/onboarding/application/use-cases/billing/tenant-billing.use-cases';
import {
  GetTenantPaymentUseCase,
  GetTenantQuotationUseCase,
  ListTenantPaymentsUseCase,
  ListTenantQuotationsUseCase,
} from '@auth/onboarding/application/use-cases/billing/tenant-document-queries.use-cases';
import {
  GetTenantBillingOverviewUseCase,
  ListTenantBillingActivityUseCase,
} from '@auth/onboarding/application/use-cases/billing/tenant-billing-overview.use-cases';
import {
  PayRenewalByCardUseCase,
  PayRenewalFromWalletUseCase,
} from '@auth/onboarding/application/use-cases/billing/pay-renewal.use-cases';
import {
  ChargeRefusedError,
  PaymentProviderUnavailableError,
} from '@auth/onboarding/application/use-cases/pay-for-application.use-cases';
import {
  RenewalAmountTooLargeError,
  RenewalInsufficientBalanceError,
  RenewalNotPayableError,
} from '@auth/onboarding/domain/renewal-errors';
import { koboToNgn } from '@auth/onboarding/domain/quotation-totals';
import {
  ListTenantActivityQueryDto,
  ListTenantInvoicesQueryDto,
  ListTenantPaymentsQueryDto,
  ListTenantQuotationsQueryDto,
  PayRenewalCardResponse,
  PayRenewalWalletResponse,
  TenantActivityPageResponse,
  TenantBillingOverviewResponse,
  TenantInvoiceDetailResponse,
  TenantInvoicesPageResponse,
  TenantLicenceResponse,
  TenantPaymentDetailResponse,
  TenantPaymentsPageResponse,
  TenantQuotationDetailResponse,
  TenantQuotationsPageResponse,
} from './dto/tenant-billing.dto';

function mapPaymentErrors(error: unknown): never {
  if (error instanceof RenewalNotPayableError) {
    throw new ConflictException({ message: error.message, code: 'INVOICE_NOT_PAYABLE' });
  }
  if (error instanceof RenewalInsufficientBalanceError) {
    throw new BadRequestException({
      message: error.message,
      code: 'INSUFFICIENT_WALLET_BALANCE',
      shortfallNgn: koboToNgn(error.shortfallKobo),
    });
  }
  if (error instanceof RenewalAmountTooLargeError) throw new UnprocessableEntityException(error.message);
  if (error instanceof PaymentProviderUnavailableError) throw new ServiceUnavailableException(error.message);
  if (error instanceof ChargeRefusedError) throw new HttpException(error.message, HttpStatus.PAYMENT_REQUIRED);
  throw error;
}

@ApiTags('Tenant Billing')
@ApiBearerAuth()
@Portals('tenant')
@OnResource('tenant.bundles')
@Controller('billing')
export class TenantBillingController {
  constructor(
    @Inject(BillingActorResolver) private readonly actors: BillingActorResolver,
    @Inject(ListTenantInvoicesUseCase) private readonly listInvoices: ListTenantInvoicesUseCase,
    @Inject(GetTenantInvoiceUseCase) private readonly getInvoice: GetTenantInvoiceUseCase,
    @Inject(GetTenantLicenceUseCase) private readonly getLicence: GetTenantLicenceUseCase,
    @Inject(ListTenantQuotationsUseCase) private readonly listQuotations: ListTenantQuotationsUseCase,
    @Inject(GetTenantQuotationUseCase) private readonly getQuotation: GetTenantQuotationUseCase,
    @Inject(ListTenantPaymentsUseCase) private readonly listPayments: ListTenantPaymentsUseCase,
    @Inject(GetTenantPaymentUseCase) private readonly getPayment: GetTenantPaymentUseCase,
    @Inject(GetTenantBillingOverviewUseCase) private readonly getOverview: GetTenantBillingOverviewUseCase,
    @Inject(ListTenantBillingActivityUseCase) private readonly listActivity: ListTenantBillingActivityUseCase,
    @Inject(PayRenewalFromWalletUseCase) private readonly payFromWallet: PayRenewalFromWalletUseCase,
    @Inject(PayRenewalByCardUseCase) private readonly payByCard: PayRenewalByCardUseCase,
  ) {}

  @Get('invoices')
  @ApiOperation({ summary: 'Your invoices, first purchase and licence renewals' })
  @ApiOkResponse({ type: TenantInvoicesPageResponse })
  invoices(@Query() query: ListTenantInvoicesQueryDto, @Headers('authorization') authorization?: string) {
    return this.run(authorization, (tenantId) => this.listInvoices.execute(tenantId, query));
  }

  @Get('invoices/:id')
  @ApiOperation({ summary: 'One of your invoices with its lines' })
  @ApiOkResponse({ type: TenantInvoiceDetailResponse })
  invoice(@Param('id') id: string, @Headers('authorization') authorization?: string) {
    return this.run(authorization, (tenantId) => this.getInvoice.execute(tenantId, id));
  }

  @Get('licence')
  @ApiOperation({ summary: 'Your current licence period, or null when you have none' })
  @ApiOkResponse({ type: TenantLicenceResponse })
  licence(@Headers('authorization') authorization?: string) {
    return this.run(authorization, (tenantId) => this.getLicence.execute(tenantId));
  }

  @Get('quotations')
  @ApiOperation({ summary: 'Quotations sent to your organization, including the onboarding one' })
  @ApiOkResponse({ type: TenantQuotationsPageResponse })
  quotations(@Query() query: ListTenantQuotationsQueryDto, @Headers('authorization') authorization?: string) {
    return this.run(authorization, (tenantId) => this.listQuotations.execute(tenantId, query));
  }

  @Get('quotations/:id')
  @ApiOperation({ summary: 'One of your quotations with its lines and totals' })
  @ApiOkResponse({ type: TenantQuotationDetailResponse })
  quotation(@Param('id') id: string, @Headers('authorization') authorization?: string) {
    return this.run(authorization, (tenantId) => this.getQuotation.execute(tenantId, id));
  }

  @Get('payments')
  @ApiOperation({ summary: 'Payments made by your organization' })
  @ApiOkResponse({ type: TenantPaymentsPageResponse })
  payments(@Query() query: ListTenantPaymentsQueryDto, @Headers('authorization') authorization?: string) {
    return this.run(authorization, (tenantId) => this.listPayments.execute(tenantId, query));
  }

  @Get('payments/:id')
  @ApiOperation({ summary: 'One of your payments with the invoice and quotation it settled' })
  @ApiOkResponse({ type: TenantPaymentDetailResponse })
  payment(@Param('id') id: string, @Headers('authorization') authorization?: string) {
    return this.run(authorization, (tenantId) => this.getPayment.execute(tenantId, id));
  }

  @Get('overview')
  @ApiOperation({ summary: 'Billing totals and chart series for your organization' })
  @ApiOkResponse({ type: TenantBillingOverviewResponse })
  overview(@Headers('authorization') authorization?: string) {
    return this.run(authorization, (tenantId) => this.getOverview.execute(tenantId));
  }

  @Get('activity')
  @ApiOperation({ summary: 'Billing events: invoices, payments, quotations, renewals and device requests' })
  @ApiOkResponse({ type: TenantActivityPageResponse })
  activity(@Query() query: ListTenantActivityQueryDto, @Headers('authorization') authorization?: string) {
    return this.run(authorization, (tenantId) => this.listActivity.execute(tenantId, query));
  }

  @Post('invoices/:id/pay-wallet')
  @ApiOperation({ summary: 'Pay a renewal invoice in full from the wallet' })
  @ApiCreatedResponse({ type: PayRenewalWalletResponse })
  payWallet(@Param('id') id: string, @Headers('authorization') authorization?: string) {
    return this.run(authorization, (tenantId) => this.payFromWallet.execute(tenantId, id));
  }

  @Post('invoices/:id/pay-card')
  @ApiOperation({ summary: 'Start a card payment for a renewal invoice' })
  @ApiCreatedResponse({ type: PayRenewalCardResponse })
  payCard(@Param('id') id: string, @Headers('authorization') authorization?: string) {
    return this.run(authorization, (tenantId) => this.payByCard.execute(tenantId, id));
  }

  private run<T>(authorization: string | undefined, work: (tenantId: string) => Promise<T>): Promise<T> {
    return mapBillingErrors(async () => {
      const actor = await this.actors.resolve(bearerToken(authorization));
      if (actor.tenantId === SYSTEM_TENANT_ID) throw new ForbiddenError('Staff accounts have no tenant billing');
      try {
        return await work(actor.tenantId);
      } catch (error) {
        if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
        return mapPaymentErrors(error);
      }
    });
  }
}
