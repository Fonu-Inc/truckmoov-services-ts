import { randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import {
  Sse,
  Body,
  HttpException,
  HttpStatus,
  Put,
  Param,
  BadRequestException,
  ConflictException,
  Post,
  Headers,
  UnauthorizedException,
  UploadedFile,
  ForbiddenException,
  Get,
  Req,
  Inject,
  ServiceUnavailableException,
  Controller,
  NotFoundException,
  RawBodyRequest,
  UseInterceptors,
  Delete,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { MAX_DOCUMENT_UPLOAD_BYTES, uploadLimits } from '@shared/http';
import {
  ApiConsumes,
  ApiBody,
  ApiNotFoundResponse,
  ApiCreatedResponse,
  ApiUnauthorizedResponse,
  ApiOkResponse,
  ApiBadRequestResponse,
  ApiTags,
  ApiConflictResponse,
  ApiBearerAuth,
  ApiOperation,
} from '@nestjs/swagger';
import { AppConfigService } from '@shared/config';
import { ObjectStorageService } from '@shared/object-storage';
import { Observable } from 'rxjs';
import { ActivateSubscriptionUseCase, OnboardingNotFoundError } from './activate-subscription.use-case';
import { SettleWalletTopUpUseCase } from './settle-wallet-top-up.use-case';
import { ConfirmApplicationPaymentUseCase } from '@auth/onboarding';
import { ActivityLogService } from './activity-log.service';
import { BaseAuthController } from './base.controller';
import { BodyOrDataPipe } from './body-or-data.pipe';
import { CompleteOnboardingUseCase } from './complete-onboarding.use-case';
import { ForbiddenError } from './contexts/auth/session';
import {
  PlanNotFoundError,
  InvalidPlanPriceError,
  PlanChangeNotAllowedError,
  CreatePaymentIntentUseCase,
} from './create-payment-intent.use-case';
import { DeleteKycDocumentUseCase, KycDocumentNotFoundError } from './delete-kyc-document.use-case';
import {
  EnterpriseEnquiryResponse,
  FeatureTogglesResponse,
  SystemSubscriptionPlansResponse,
  RequestIdResponse,
  MessageResponse,
  PaystackWebhookAckSchema,
  PaymentIntentResponse,
  KycDocumentsResponse,
  ExchangeRateResponse,
  SubscriptionCapsResponse,
  BusinessInfoResponse,
  RegisterSimsResultResponse,
  CompleteOnboardingResponse,
  OnboardingStatusResponse,
  ImportSimsResponse,
} from './dto/auth.schema';
import {
  CreatePaymentIntentDto,
  EnterpriseEnquiryDto,
  RegisterSimsDto,
  SubmitSimProvisioningRequestDto,
  SaveBusinessInfoDto,
  SaveFeatureTogglesDto,
  KYC_DOCUMENT_TYPE_ENUM,
  SubmitDeviceProvisioningRequestDto,
} from './dto/onboarding.dto';
import { Portals, OnResource, Requires, SignedIn } from '@shared/access';
import { PaystackWebhookDto } from './dto/paystack-webhook.dto';
import { PaymentGatewayRegistry, type PaidAmount, type PaymentCallback } from './contexts/payments';
import { StorageQuotaService } from './storage-quota.service';
import { StorageQuotaExceededError } from './storage-usage.repository';
import { TOKEN_SERVICE } from './contexts/auth/session';
import type { TokenService } from './contexts/auth/session/domain/ports/token-service.port';
import { GetBusinessInfoUseCase } from './get-business-info.use-case';
import { GetExchangeRateUseCase } from './get-exchange-rate.use-case';
import { GetOnboardingPlansUseCase } from './get-onboarding-plans.use-case';
import { GetOnboardingStatusUseCase } from './get-onboarding-status.use-case';
import { GetSubscriptionCapsUseCase } from './get-subscription-caps.use-case';
import { ImportSimsCsvUseCase, InvalidCsvError } from './import-sims-csv.use-case';
import { ListKycDocumentsUseCase } from './list-kyc-documents.use-case';
import { PaymentEventService } from './payment-event.service';
import { RegisterSimsUseCase } from './register-sims.use-case';
import { SaveBusinessInfoUseCase } from './save-business-info.use-case';
import { OnboardingNotFoundForFeaturesError, SaveFeatureTogglesUseCase } from './save-feature-toggles.use-case';
import { SaveKycDocumentUseCase } from './save-kyc-document.use-case';
import { SubmitEnterpriseEnquiryUseCase } from './submit-enterprise-enquiry.use-case';
import { SubmitSimProvisioningRequestUseCase } from './submit-sim-provisioning-request.use-case';
import { SubscribePaymentEventsUseCase } from './subscribe-payment-events.use-case';

@ApiTags('Onboarding')
@Portals('tenant')
@OnResource('tenant.onboarding')
@Controller('onboarding')
export class OnboardingController extends BaseAuthController {
  constructor(
    @Inject(ActivityLogService) activityLogService: ActivityLogService,
    @Inject(ObjectStorageService) private readonly objectStorageService: ObjectStorageService,
    @Inject(AppConfigService) private readonly appConfig: AppConfigService,
    @Inject(GetOnboardingPlansUseCase) private readonly getOnboardingPlansUseCase: GetOnboardingPlansUseCase,
    @Inject(GetExchangeRateUseCase) private readonly getExchangeRateUseCase: GetExchangeRateUseCase,
    @Inject(CreatePaymentIntentUseCase) private readonly createPaymentIntentUseCase: CreatePaymentIntentUseCase,
    @Inject(ActivateSubscriptionUseCase) private readonly activateSubscriptionUseCase: ActivateSubscriptionUseCase,
    @Inject(SettleWalletTopUpUseCase) private readonly settleWalletTopUpUseCase: SettleWalletTopUpUseCase,
    @Inject(PaymentGatewayRegistry) private readonly gatewayRegistry: PaymentGatewayRegistry,
    @Inject(StorageQuotaService) private readonly storageQuota: StorageQuotaService,
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(SubscribePaymentEventsUseCase) private readonly subscribePaymentEventsUseCase: SubscribePaymentEventsUseCase,
    @Inject(PaymentEventService) private readonly paymentEventService: PaymentEventService,
    @Inject(ConfirmApplicationPaymentUseCase)
    private readonly confirmApplicationPayment: ConfirmApplicationPaymentUseCase,
    @Inject(SubmitEnterpriseEnquiryUseCase) private readonly submitEnterpriseEnquiryUseCase: SubmitEnterpriseEnquiryUseCase,
    @Inject(GetSubscriptionCapsUseCase) private readonly getSubscriptionCapsUseCase: GetSubscriptionCapsUseCase,
    @Inject(GetBusinessInfoUseCase) private readonly getBusinessInfoUseCase: GetBusinessInfoUseCase,
    @Inject(SaveBusinessInfoUseCase) private readonly saveBusinessInfoUseCase: SaveBusinessInfoUseCase,
    @Inject(ListKycDocumentsUseCase) private readonly listKycDocumentsUseCase: ListKycDocumentsUseCase,
    @Inject(GetOnboardingStatusUseCase) private readonly getOnboardingStatusUseCase: GetOnboardingStatusUseCase,
    @Inject(SaveKycDocumentUseCase) private readonly saveKycDocumentUseCase: SaveKycDocumentUseCase,
    @Inject(DeleteKycDocumentUseCase) private readonly deleteKycDocumentUseCase: DeleteKycDocumentUseCase,
    @Inject(RegisterSimsUseCase) private readonly registerSimsUseCase: RegisterSimsUseCase,
    @Inject(ImportSimsCsvUseCase) private readonly importSimsCsvUseCase: ImportSimsCsvUseCase,
    @Inject(SubmitSimProvisioningRequestUseCase) private readonly submitSimProvisioningRequestUseCase: SubmitSimProvisioningRequestUseCase,
    @Inject(SaveFeatureTogglesUseCase) private readonly saveFeatureTogglesUseCase: SaveFeatureTogglesUseCase,
    @Inject(CompleteOnboardingUseCase) private readonly completeOnboardingUseCase: CompleteOnboardingUseCase,
  ) {
    super(activityLogService);
  }

  @Portals('public')
  @Get('plans')
  @ApiOperation({ summary: 'List subscription plans', description: 'Returns all active subscription plans with NGN prices and limits.' })
  @ApiOkResponse({ type: SystemSubscriptionPlansResponse })
  async getOnboardingPlans() {
    return this.getOnboardingPlansUseCase.execute();
  }

  @Portals('public')
  @Get('exchange-rate')
  @ApiOperation({
    summary: 'Platform currency',
    description:
      'The currency every figure on the platform is expressed in. No conversion is performed while international currency is off, so ngnPerUsd is null.',
  })
  @ApiOkResponse({ description: 'Exchange rate data', type: ExchangeRateResponse })
  async getExchangeRate() {
    return this.getExchangeRateUseCase.execute();
  }

  @Post('payment/intent')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create payment intent', description: 'Initialises a Paystack transaction (card) or MoMo USSD push. Returns authorization URL or USSD string.' })
  @ApiCreatedResponse({ type: PaymentIntentResponse })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiBadRequestResponse({ description: 'Plan not found or invalid gateway' })
  async createPaymentIntent(
    @Body(BodyOrDataPipe) payload: CreatePaymentIntentDto,
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      return await this.createPaymentIntentUseCase.execute(accessToken, payload);
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      if (error instanceof PlanNotFoundError) throw new NotFoundException(error.message);
      if (error instanceof OnboardingNotFoundError) throw new NotFoundException(error.message);
      if (error instanceof InvalidPlanPriceError) throw new BadRequestException(error.message);
      if (error instanceof PlanChangeNotAllowedError) throw new ConflictException(error.message);
      throw error;
    }
  }

  @Sse('payment/events')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Subscribe to payment confirmation events (SSE)', description: 'Server-sent event stream. Emits once when the Paystack webhook confirms payment and activates the subscription.' })
  @ApiOkResponse({ description: 'Server-sent events stream (text/event-stream)', content: { 'text/event-stream': {} } })
  onboardingPaymentEvents(
    @Headers('authorization') authorization?: string,
  ): Observable<{ data: unknown }> {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    return this.subscribePaymentEventsUseCase.execute(accessToken);
  }

  /**
   * One endpoint for every payment provider.
   *
   * The sender is established by verifying the signature against each
   * configured provider, not by the path, a header or the source address. A
   * header only decides which adapter is tried first.
   */
  @Portals('public')
  @Post('payment/webhook')
  @ApiOperation({ summary: 'Payment provider webhook (no auth)', description: 'Receives payment callbacks from any configured provider. The sender is identified by verifying its signature; a callback no provider claims is refused.' })
  @ApiBody({ type: PaystackWebhookDto })
  @ApiCreatedResponse({ description: 'Acknowledged', type: PaystackWebhookAckSchema })
  async paystackWebhook(
    @Req() req: RawBodyRequest<{ headers: Record<string, string | undefined> }>,
    @Body() body: Record<string, unknown>,
  ) {
    if (this.gatewayRegistry.configured().length === 0) {
      throw new ServiceUnavailableException('No payment provider is configured');
    }

    const rawBody = (req as unknown as { rawBody?: Buffer }).rawBody;
    // The raw bytes, not a re-serialised body: re-encoding JSON can reorder
    // keys or change spacing, and the signature is over what was actually sent.
    const payload = rawBody ?? Buffer.from(JSON.stringify(body));

    const callback = this.gatewayRegistry.parse(payload, req.headers, body);
    if (!callback) throw new ForbiddenException('Invalid webhook signature');

    const paid: PaidAmount = {
      amountKobo: callback.amountKobo,
      currency: callback.currency,
      channel: callback.channel,
    };
    const failures = [
      await this.settleOnboardingPayment(callback, paid),
      await this.settleSubscription(callback, paid),
      await this.settleWalletTopUp(callback, paid),
    ].filter((failed) => failed);

    if (failures.length > 0) {
      throw new ServiceUnavailableException('Payment settlement failed, retry later');
    }

    return { received: true };
  }

  private async settle(label: string, run: () => Promise<void>): Promise<boolean> {
    try {
      await run();
      return false;
    } catch (error) {
      this.logger.error(
        `Failed to settle ${label}: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
      return true;
    }
  }

  private settleOnboardingPayment(callback: PaymentCallback, paid: PaidAmount): Promise<boolean> {
    if (!callback.reference || callback.metadata['kind'] !== 'onboarding') return Promise.resolve(false);
    if (!callback.succeeded && !callback.failed) return Promise.resolve(false);
    return this.settle(`onboarding payment ${callback.reference}`, () =>
      this.confirmApplicationPayment.execute(callback.reference, callback.succeeded, paid),
    );
  }

  private settleSubscription(callback: PaymentCallback, paid: PaidAmount): Promise<boolean> {
    const { metadata, reference } = callback;
    const tenantId = metadata['tenantId'] as string | undefined;
    if (!callback.succeeded || !tenantId || !reference) return Promise.resolve(false);
    return this.settle(`subscription for tenant ${tenantId}`, async () => {
      await this.activateSubscriptionUseCase.execute(
        tenantId,
        reference,
        {
          planCode: metadata['planCode'] as string | undefined,
          billingCycle: metadata['billingCycle'] as string | undefined,
        },
        paid,
      );
      this.paymentEventService.emit(tenantId, { event: 'payment.confirmed', reference });
    });
  }

  private settleWalletTopUp(callback: PaymentCallback, paid: PaidAmount): Promise<boolean> {
    const { reference } = callback;
    if (!callback.succeeded || !reference) return Promise.resolve(false);
    return this.settle(`wallet top-up ${reference}`, async () => {
      const settlement = await this.settleWalletTopUpUseCase.execute(reference, paid);
      if (settlement.outcome === 'credited' && settlement.tenantId) {
        this.paymentEventService.emit(settlement.tenantId, {
          event: 'payment.confirmed',
          reference,
        });
      }
    });
  }

  @Requires('tenant.upgrades.manage')
  @Post('enterprise/enquiry')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Submit enterprise plan enquiry', description: 'Creates a support ticket of category enterprise_enquiry for the sales team.' })
  @ApiCreatedResponse({ type: EnterpriseEnquiryResponse })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  async submitEnterpriseEnquiry(
    @Body(BodyOrDataPipe) payload: EnterpriseEnquiryDto,
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      return await this.submitEnterpriseEnquiryUseCase.execute(accessToken, payload);
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      throw error;
    }
  }

  @SignedIn()
  @Get('subscription/caps')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get device & SIM caps for active plan', description: 'Returns maxDevices, maxSims, maxUsers from the tenant\'s active subscription plan.' })
  @ApiOkResponse({ description: 'Subscription capability limits', type: SubscriptionCapsResponse })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  async getSubscriptionCaps(@Headers('authorization') authorization?: string) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      return await this.getSubscriptionCapsUseCase.execute(accessToken);
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      throw error;
    }
  }

  @SignedIn()
  @Get('status')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get onboarding status', description: 'Returns the onboarding completion status and active subscription info for the calling tenant.' })
  @ApiOkResponse({ type: OnboardingStatusResponse })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  async getOnboardingStatus(@Headers('authorization') authorization?: string) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      return await this.getOnboardingStatusUseCase.execute(accessToken);
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      throw error;
    }
  }

  @Get('business-info')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get business info', description: 'Returns stored business registration details and verification status for the calling tenant.' })
  @ApiOkResponse({ type: BusinessInfoResponse })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  async getBusinessInfo(@Headers('authorization') authorization?: string) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      return await this.getBusinessInfoUseCase.execute(accessToken);
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      throw error;
    }
  }

  @Put('business-info')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Save/update business info', description: 'Upserts business registration details for the calling tenant. Verification status is managed by the system.' })
  @ApiOkResponse({ type: BusinessInfoResponse })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  async saveBusinessInfo(
    @Body(BodyOrDataPipe) payload: SaveBusinessInfoDto,
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      return await this.saveBusinessInfoUseCase.execute(accessToken, {
        companyName: payload.companyName,
        registrationNumber: payload.registrationNumber ?? null,
        taxId: payload.taxId ?? null,
        businessType: payload.businessType ?? null,
        industry: payload.industry ?? null,
        addressLine1: payload.addressLine1 ?? null,
        addressLine2: payload.addressLine2 ?? null,
        city: payload.city ?? null,
        state: payload.state ?? null,
        postalCode: payload.postalCode ?? null,
        country: payload.country ?? null,
        phone: payload.phone ?? null,
        email: payload.email ?? null,
        billingEmail: payload.billingEmail ?? null,
        website: payload.website ?? null,
        yearEstablished: payload.yearEstablished ?? null,
        numberOfEmployees: payload.numberOfEmployees ?? null,
      });
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      throw error;
    }
  }

  @Get('kyc/documents')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List KYC documents', description: 'Lists all uploaded KYC documents for the calling tenant with their id, type, name, size, and status.' })
  @ApiOkResponse({ type: KycDocumentsResponse })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  async listKycDocuments(@Headers('authorization') authorization?: string) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      return await this.listKycDocumentsUseCase.execute(accessToken);
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      throw error;
    }
  }

  @Post('kyc/documents')
  @ApiBearerAuth()
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload KYC document', description: 'Uploads a KYC document file (stored privately in Wasabi) and records the document metadata.' })
  @ApiCreatedResponse({ type: KycDocumentsResponse })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiBadRequestResponse({ description: 'Missing file or invalid document_type' })
  @UseInterceptors(FileInterceptor('file', uploadLimits(MAX_DOCUMENT_UPLOAD_BYTES)))
  @ApiBody({
    schema: {
      type: 'object',
      required: ['document_type', 'file'],
      properties: {
        document_type: { type: 'string', enum: [...KYC_DOCUMENT_TYPE_ENUM] },
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  async uploadKycDocument(
    @UploadedFile() file?: { originalname: string; mimetype: string; size: number; buffer: Buffer },
    @Body('document_type') documentType?: string,
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    if (!file?.buffer?.length) throw new BadRequestException('Missing upload file');
    if (!documentType || !KYC_DOCUMENT_TYPE_ENUM.includes(documentType as typeof KYC_DOCUMENT_TYPE_ENUM[number])) {
      throw new BadRequestException('Invalid or missing document_type');
    }

    const ext = extname(file.originalname).toLowerCase();
    const key = `auth/kyc/${randomUUID()}${ext}`;

    const tenantId = this.tokenService.resolveAccessToken(accessToken)?.tenantId;
    if (!tenantId) throw new UnauthorizedException('Invalid access token');

    // Reserved before the bytes are written, so a refused upload leaves nothing
    // in object storage to clean up.
    try {
      await this.storageQuota.assertRoomFor(tenantId, file.buffer.byteLength);
    } catch (error) {
      if (error instanceof StorageQuotaExceededError) {
        throw new HttpException(error.message, HttpStatus.PAYLOAD_TOO_LARGE);
      }
      throw error;
    }

    try {
      await this.objectStorageService.putObject({
        key,
        body: file.buffer,
        contentType: file.mimetype,
        visibility: 'private',
      });
    } catch {
      throw new ServiceUnavailableException('File upload failed');
    }

    await this.storageQuota.record(tenantId, 'kyc', file.buffer.byteLength);

    try {
      return await this.saveKycDocumentUseCase.execute(accessToken, {
        documentType: documentType as typeof KYC_DOCUMENT_TYPE_ENUM[number],
        documentName: file.originalname,
        fileKey: key,
        fileSize: file.size,
      });
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      throw error;
    }
  }

  @Delete('kyc/documents/:docId')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete KYC document', description: 'Removes a KYC document record by ID. Only the owning tenant can delete their own documents.' })
  @ApiOkResponse({ type: MessageResponse })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiNotFoundResponse({ description: 'Document not found' })
  async deleteKycDocument(
    @Param('docId') docId: string,
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      return await this.deleteKycDocumentUseCase.execute(accessToken, docId);
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof KycDocumentNotFoundError) throw new NotFoundException(error.message);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      throw error;
    }
  }

  @Post('sims/register')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Register individual SIMs', description: 'Registers one or more SIMs (by ICCID + mobile number + operator) directly to the tenant in the SIM inventory.' })
  @ApiCreatedResponse({ type: RegisterSimsResultResponse })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  async registerSims(
    @Body(BodyOrDataPipe) payload: RegisterSimsDto,
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      return await this.registerSimsUseCase.execute(accessToken, payload.sims);
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      throw error;
    }
  }

  @Post('sims/import')
  @ApiBearerAuth()
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Bulk CSV SIM import', description: 'Accepts a CSV file with columns iccid, msisdn, carrier and bulk-registers the SIMs.' })
  @ApiCreatedResponse({ type: ImportSimsResponse })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiBadRequestResponse({ description: 'Invalid CSV or missing required column: iccid' })
  @UseInterceptors(FileInterceptor('file', uploadLimits(MAX_DOCUMENT_UPLOAD_BYTES)))
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: { file: { type: 'string', format: 'binary', description: 'CSV with columns: iccid, msisdn, carrier' } },
    },
  })
  async importSimsCsv(
    @UploadedFile() file?: { buffer: Buffer },
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    if (!file?.buffer?.length) throw new BadRequestException('Missing CSV file');
    try {
      return await this.importSimsCsvUseCase.execute(accessToken, file.buffer);
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof InvalidCsvError) throw new BadRequestException(error.message);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      throw error;
    }
  }

  @Post('sims/provision')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Submit SIM provisioning request', description: 'Submits a SIM provisioning request to Fonu. Reviewed and fulfilled by the system team.' })
  @ApiCreatedResponse({ type: RequestIdResponse })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  async submitSimProvisioningRequest(
    @Body(BodyOrDataPipe) payload: SubmitSimProvisioningRequestDto,
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      return await this.submitSimProvisioningRequestUseCase.execute(accessToken, payload);
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      throw error;
    }
  }

  @Put('features')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Save feature toggle preferences', description: 'Updates feature toggles (live_tracking, geofencing, etc.) on the tenant onboarding record.' })
  @ApiOkResponse({ type: FeatureTogglesResponse })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiNotFoundResponse({ description: 'Onboarding record not found' })
  async saveFeatureToggles(
    @Body(BodyOrDataPipe) payload: SaveFeatureTogglesDto,
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      return await this.saveFeatureTogglesUseCase.execute(accessToken, payload);
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      if (error instanceof OnboardingNotFoundForFeaturesError) throw new NotFoundException(error.message);
      throw error;
    }
  }

  @Post('complete')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Mark onboarding as complete', description: 'Sets onboarding_completed_at server-side so completion persists across devices and sessions.' })
  @ApiCreatedResponse({ type: CompleteOnboardingResponse })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiConflictResponse({ description: 'Onboarding already completed' })
  async completeOnboarding(@Headers('authorization') authorization?: string) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      return await this.completeOnboardingUseCase.execute(accessToken);
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      throw error;
    }
  }

  // ─── SIM Inventory (tenant) ───────────────────────────────────────────────
}
