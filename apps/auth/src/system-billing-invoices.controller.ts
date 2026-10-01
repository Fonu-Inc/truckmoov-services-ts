import { Controller, Get, Headers, Inject, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { OnResource, Portals, Requires } from '@shared/access';
import { BillingActorResolver } from './billing-actor';
import { bearerToken, mapBillingErrors } from './billing-controller.support';
import { GetBillingSummaryUseCase } from '@auth/onboarding/application/use-cases/billing/billing-summary.use-case';
import {
  GetInvoiceUseCase,
  ListInvoicesUseCase,
} from '@auth/onboarding/application/use-cases/billing/invoice-queries.use-cases';
import {
  GetPaymentUseCase,
  ListPaymentsUseCase,
} from '@auth/onboarding/application/use-cases/billing/payment-queries.use-cases';
import {
  BillingSummaryResponse,
  InvoiceDetailResponse,
  InvoicesPageResponse,
  ListInvoicesQueryDto,
} from './dto/billing-invoices.dto';
import {
  ListPaymentsQueryDto,
  PaymentDetailResponse,
  PaymentsPageResponse,
} from './dto/billing-payments.dto';

@ApiTags('System Billing')
@ApiBearerAuth()
@Portals('admin')
@OnResource('admin.billing')
@Controller('system/billing')
export class SystemBillingInvoicesController {
  constructor(
    @Inject(BillingActorResolver) private readonly actors: BillingActorResolver,
    @Inject(ListInvoicesUseCase) private readonly listInvoices: ListInvoicesUseCase,
    @Inject(GetInvoiceUseCase) private readonly getInvoice: GetInvoiceUseCase,
    @Inject(ListPaymentsUseCase) private readonly listPayments: ListPaymentsUseCase,
    @Inject(GetPaymentUseCase) private readonly getPayment: GetPaymentUseCase,
    @Inject(GetBillingSummaryUseCase) private readonly getSummary: GetBillingSummaryUseCase,
  ) {}

  @Get('summary')
  @Requires('admin.billing.read')
  @ApiOperation({ summary: 'Billing KPIs' })
  @ApiOkResponse({ type: BillingSummaryResponse })
  async summary(@Headers('authorization') authorization?: string) {
    return mapBillingErrors(async () => {
      await this.actors.resolve(bearerToken(authorization));
      return this.getSummary.execute();
    });
  }

  @Get('invoices')
  @Requires('admin.billing.read')
  @ApiOperation({ summary: 'Invoice history, newest first' })
  @ApiOkResponse({ type: InvoicesPageResponse })
  async invoices(@Query() query: ListInvoicesQueryDto, @Headers('authorization') authorization?: string) {
    return mapBillingErrors(async () => {
      await this.actors.resolve(bearerToken(authorization));
      return this.listInvoices.execute(query);
    });
  }

  @Get('invoices/:id')
  @Requires('admin.billing.read')
  @ApiOperation({ summary: 'One invoice with its lines and applied payments' })
  @ApiOkResponse({ type: InvoiceDetailResponse })
  async invoice(@Param('id') id: string, @Headers('authorization') authorization?: string) {
    return mapBillingErrors(async () => {
      await this.actors.resolve(bearerToken(authorization));
      return this.getInvoice.execute(id);
    });
  }

  @Get('payments')
  @Requires('admin.billing.read')
  @ApiOperation({ summary: 'Payment history, newest first' })
  @ApiOkResponse({ type: PaymentsPageResponse })
  async payments(@Query() query: ListPaymentsQueryDto, @Headers('authorization') authorization?: string) {
    return mapBillingErrors(async () => {
      await this.actors.resolve(bearerToken(authorization));
      return this.listPayments.execute(query);
    });
  }

  @Get('payments/:id')
  @Requires('admin.billing.read')
  @ApiOperation({ summary: 'One payment with its plan breakdown' })
  @ApiOkResponse({ type: PaymentDetailResponse })
  async payment(@Param('id') id: string, @Headers('authorization') authorization?: string) {
    return mapBillingErrors(async () => {
      await this.actors.resolve(bearerToken(authorization));
      return this.getPayment.execute(id);
    });
  }
}
