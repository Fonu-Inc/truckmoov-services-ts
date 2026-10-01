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
  ListTenantInvoicesQueryDto,
  PayRenewalCardResponse,
  PayRenewalWalletResponse,
  TenantInvoiceDetailResponse,
  TenantInvoicesPageResponse,
  TenantLicenceResponse,
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
