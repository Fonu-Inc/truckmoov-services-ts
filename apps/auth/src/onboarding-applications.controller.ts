import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  Headers,
  HttpException,
  HttpStatus,
  Inject,
  Ip,
  NotFoundException,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Res,
  ServiceUnavailableException,
  UnauthorizedException,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  applyDecorators,
} from '@nestjs/common';
import { ONBOARDING_VEHICLE_PURCHASE_TYPES, ONBOARDING_VEHICLE_TYPES } from '@auth/onboarding';
import type { UploadedDocumentFile } from './contexts/onboarding/domain/onboarding-document-file';
import { CheckEmailAvailabilityUseCase } from './contexts/onboarding/email-availability/check-email-availability.use-case';
import { FileInterceptor } from '@nestjs/platform-express';
import { MAX_DOCUMENT_UPLOAD_BYTES, uploadLimits } from '@shared/http';
import {
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiHeader,
  ApiOkResponse,
  ApiQuery,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  ApiErrorBody,
  ApiErrorResponse,
  ApiValidationErrorBody,
  DuplicateIdentityErrorBody,
  OnboardingFieldErrorBody,
  OnboardingIncompleteErrorBody,
} from './dto/api-error.dto';
import { ActivityLogService } from './activity-log.service';
import { BaseAuthController } from './base.controller';
import { Portals } from '@shared/access';
import {
  AddApplicationVehicleUseCase,
  ApplicationIncompleteError,
  ApplicationNotEditableError,
  ApplicationNotFoundError,
  BusinessEmailInUseError,
  ConfirmOnboardingVerificationCodeUseCase,
  buildOnboardingVehicleCsvTemplate,
  CreateOnboardingApplicationUseCase,
  DeleteOnboardingApplicationDocumentUseCase,
  DeviceRequestNotFoundError,
  DuplicateIdentityError,
  DuplicateVehicleError,
  ApplicationNotPayableError,
  BillingEmailNotVerifiedError,
  CreateApplicationPaymentUseCase,
  GetApplicationOrderUseCase,
  GetIndemnityTemplateUseCase,
  GetM2mLicensePlansUseCase,
  GetOnboardingApplicationStatusUseCase,
  GetOnboardingApplicationUseCase,
  ImportApplicationVehiclesUseCase,
  IndemnityTemplateNotFoundError,
  IndemnityTemplateSupersededError,
  InvalidDocumentFileError,
  InvalidVerificationCodeError,
  INDEMNITY_SIGNATURE_METHODS,
  UPLOADABLE_DOCUMENT_TYPES,
  ONBOARDING_VEHICLE_CSV_COLUMNS,
  OnboardingApplicationRateLimitGuard,
  OnboardingValidationError,
  RemoveApplicationDeviceRequestUseCase,
  RemoveApplicationVehicleUseCase,
  RequestApplicationDevicesUseCase,
  ResumeOnboardingApplicationUseCase,
  PaymentProviderUnavailableError,
  ChargeRefusedError,
  SendOnboardingVerificationCodeUseCase,
  SetBillingEmailUseCase,
  SignIndemnityAgreementUseCase,
  SubmitOnboardingApplicationUseCase,
  UpdateApplicationVehicleUseCase,
  UpdateOnboardingApplicationUseCase,
  UploadOnboardingApplicationDocumentUseCase,
  VehicleCsvColumnsMissingError,
  VehicleCsvEmptyError,
  VehicleNotFoundError,
  VerificationDispatchError,
  ChannelAlreadyVerifiedError,
  VerificationResendTooSoonError,
  VerificationSendLimitError,
} from '@auth/onboarding';
import {
  BillingEmailDto,
  OnboardingApplicationDto,
  ResumeApplicationDto,
  VerificationCodeDto,
} from './dto/onboarding-application.dto';
import {
  ApplicationOrderResponse,
  ApplicationPaymentResponse,
  BillingEmailResponse,
  CreatedOnboardingApplicationResponse,
  IndemnityAgreementResponse,
  IndemnitySignatureResponse,
  EmailAvailabilityResponse,
  M2mPlansResponse,
  OnboardingApplicationResponse,
  OnboardingApplicationStatusResponse,
  ResumeApplicationResponse,
  SubmittedOnboardingApplicationResponse,
  VehicleCsvColumnsResponse,
  VehicleImportResponse,
  VerificationCodeSentResponse,
  VerificationResendTooSoonSchema,
} from './dto/onboarding-application-response.dto';
import { ScheduledInstallationResponse } from './dto/installation-response.dto';
import {
  DeviceAssignmentMismatchError,
  InstallationNotSchedulableError,
  InvalidInstallationDateError,
  ScheduleInstallationUseCase,
  VehicleAlreadyAssignedError,
} from '@auth/installation';
import {
  OnboardingDeviceRequestDto,
  OnboardingVehicleDto,
} from './dto/onboarding-vehicle.dto';
import { ScheduleInstallationDto } from './dto/schedule-installation.dto';

const APPLICATION_TOKEN_HEADER = 'x-application-token';

const RateLimited = () =>
  ApiErrorResponse(
    429,
    'Per-IP limit on every application route: { statusCode: 429, message: "Too many requests, please try again shortly" }',
  );

const CodeSendLimited = () =>
  ApiErrorResponse(
    429,
    'Resend cooldown: { message: "Wait <n> seconds before requesting another code", retryAfterSeconds }. Hourly cap: { statusCode: 429, message: "Too many codes requested for this application, try again later" }. Per-IP limit: { statusCode: 429, message: "Too many requests, please try again shortly" }.',
    VerificationResendTooSoonSchema,
  );

const NOT_FOUND = '"Application not found": unknown id, wrong token, or an expired draft';
const NOT_EDITABLE = '"An application in <status> state cannot be changed"';
const FIELD_OR_WHITELIST =
  'A field failed a domain rule: { message, field }. An unknown property: the ValidationPipe array body.';

/** 401, 404 and 429 of every route that reads the application with its token. */
const TokenErrors = (notFound = NOT_FOUND, tooMany = RateLimited) =>
  applyDecorators(
    ApiErrorResponse(401, 'No x-application-token header: "Missing application token"'),
    ApiErrorResponse(404, notFound),
    tooMany(),
  );

const TooLarge = (limit: string) =>
  ApiErrorResponse(
    413,
    `The file is over ${limit}, refused by the upload limit before the handler runs: { statusCode: 413, message: "File too large", error: "Payload Too Large" }`,
  );

const ApplicationTokenHeader = () =>
  ApiHeader({
    name: APPLICATION_TOKEN_HEADER,
    required: true,
    description: 'The applicationToken returned when the application was started.',
  });

// A fleet of a few hundred vehicles is a file of tens of kilobytes. The limit
// is here to stop a large upload being parsed at all, not to bound a real one.
const MAX_VEHICLE_CSV_BYTES = 2 * 1024 * 1024;

// The two methods the CSV download needs. Typed here rather than pulled from
// express so the controller does not depend on the HTTP adapter in use.
type FileResponse = {
  setHeader(name: string, value: string): void;
  send(body: string): void;
};

type UploadedSignatureFile = {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
};

const MAX_SIGNATURE_UPLOAD_BYTES = 2 * 1024 * 1024;

@ApiTags('Onboarding Applications')
@Portals('public')
@Controller('onboarding/applications')
@UseGuards(OnboardingApplicationRateLimitGuard)
export class OnboardingApplicationsController extends BaseAuthController {
  constructor(
    @Inject(ActivityLogService) activityLogService: ActivityLogService,
    @Inject(CreateOnboardingApplicationUseCase)
    private readonly createApplication: CreateOnboardingApplicationUseCase,
    @Inject(GetOnboardingApplicationUseCase)
    private readonly getApplication: GetOnboardingApplicationUseCase,
    @Inject(UpdateOnboardingApplicationUseCase)
    private readonly updateApplication: UpdateOnboardingApplicationUseCase,
    @Inject(UploadOnboardingApplicationDocumentUseCase)
    private readonly uploadDocument: UploadOnboardingApplicationDocumentUseCase,
    @Inject(DeleteOnboardingApplicationDocumentUseCase)
    private readonly deleteDocument: DeleteOnboardingApplicationDocumentUseCase,
    @Inject(SendOnboardingVerificationCodeUseCase)
    private readonly sendCode: SendOnboardingVerificationCodeUseCase,
    @Inject(ConfirmOnboardingVerificationCodeUseCase)
    private readonly confirmCode: ConfirmOnboardingVerificationCodeUseCase,
    @Inject(SubmitOnboardingApplicationUseCase)
    private readonly submitApplication: SubmitOnboardingApplicationUseCase,
    @Inject(GetOnboardingApplicationStatusUseCase)
    private readonly applicationStatus: GetOnboardingApplicationStatusUseCase,
    @Inject(AddApplicationVehicleUseCase)
    private readonly addVehicle: AddApplicationVehicleUseCase,
    @Inject(UpdateApplicationVehicleUseCase)
    private readonly updateVehicle: UpdateApplicationVehicleUseCase,
    @Inject(RemoveApplicationVehicleUseCase)
    private readonly removeVehicle: RemoveApplicationVehicleUseCase,
    @Inject(ImportApplicationVehiclesUseCase)
    private readonly importVehicles: ImportApplicationVehiclesUseCase,
    @Inject(RequestApplicationDevicesUseCase)
    private readonly requestDevices: RequestApplicationDevicesUseCase,
    @Inject(RemoveApplicationDeviceRequestUseCase)
    private readonly removeDeviceRequest: RemoveApplicationDeviceRequestUseCase,
    @Inject(GetM2mLicensePlansUseCase)
    private readonly m2mPlans: GetM2mLicensePlansUseCase,
    @Inject(GetIndemnityTemplateUseCase)
    private readonly indemnityTemplate: GetIndemnityTemplateUseCase,
    @Inject(SignIndemnityAgreementUseCase)
    private readonly signIndemnity: SignIndemnityAgreementUseCase,
    @Inject(ResumeOnboardingApplicationUseCase)
    private readonly resumeApplication: ResumeOnboardingApplicationUseCase,
    @Inject(GetApplicationOrderUseCase)
    private readonly applicationOrder: GetApplicationOrderUseCase,
    @Inject(CreateApplicationPaymentUseCase)
    private readonly startPayment: CreateApplicationPaymentUseCase,
    @Inject(SetBillingEmailUseCase)
    private readonly setBillingEmail: SetBillingEmailUseCase,
    @Inject(ScheduleInstallationUseCase)
    private readonly scheduleInstallation: ScheduleInstallationUseCase,
    @Inject(CheckEmailAvailabilityUseCase)
    private readonly emailAvailability: CheckEmailAvailabilityUseCase,
  ) {
    super(activityLogService);
  }

  @Post()
  @ApiOperation({
    summary: 'Start an onboarding application',
    description:
      'Creates a draft application from the landing page and returns the application token. No account is created at this point.',
  })
  @ApiCreatedResponse({
    description: 'Draft application created',
    type: CreatedOnboardingApplicationResponse,
  })
  @ApiErrorResponse(400, FIELD_OR_WHITELIST, OnboardingFieldErrorBody, ApiValidationErrorBody)
  @ApiErrorResponse(
    409,
    '"An account or application already exists for this email", or an identity detail already on another application: { message, claimTypes }',
    ApiErrorBody,
    DuplicateIdentityErrorBody,
  )
  @RateLimited()
  async create(@Body() payload: OnboardingApplicationDto) {
    return this.run(() => this.createApplication.execute(payload));
  }

  @Get('m2m-plans')
  @ApiOperation({
    summary: 'List the M2M licence plans',
    description:
      'The plans shown on the customer details step. Each is priced per device, with a first year price and a renewal price.',
  })
  @ApiOkResponse({ description: 'Plans returned', type: M2mPlansResponse })
  @RateLimited()
  async listM2mPlans() {
    return this.m2mPlans.execute();
  }

  @Get('email-availability')
  @ApiOperation({
    summary: 'Check whether a business email can still be used',
    description:
      'Called while the applicant types. available is false when an account or an open application already uses the address. The save still answers 409 if the address was taken in between. Pass applicationId while editing so the application does not count against itself.',
  })
  @ApiQuery({ name: 'email', required: true })
  @ApiQuery({ name: 'applicationId', required: false })
  @ApiOkResponse({ description: 'Availability returned', type: EmailAvailabilityResponse })
  @ApiErrorResponse(400, 'The address is not a valid email: { message, field: "businessEmail" }', OnboardingFieldErrorBody)
  @RateLimited()
  async checkEmailAvailability(@Query('email') email?: string, @Query('applicationId') applicationId?: string) {
    return this.run(() => this.emailAvailability.execute(email, applicationId));
  }

  @Post('resume')
  @ApiOperation({
    summary: 'Email a link back into an open application',
    description:
      'Sends a fresh link to the verified business email and retires the previous one. The reply is the same whether or not an application exists for the address.',
  })
  @ApiBody({ type: ResumeApplicationDto })
  @ApiCreatedResponse({
    description: 'Request accepted',
    type: ResumeApplicationResponse,
  })
  @ApiErrorResponse(400, 'The address is not a valid email: { message, field: "businessEmail" }', OnboardingFieldErrorBody)
  @RateLimited()
  async resume(@Body('businessEmail') businessEmail?: string) {
    return this.run(() => this.resumeApplication.execute(businessEmail));
  }

  @Get('indemnity-agreement')
  @ApiOperation({
    summary: 'Read the indemnity agreement',
    description:
      'The wording currently in force, with the version to send back when signing.',
  })
  @ApiOkResponse({
    description: 'Agreement returned',
    type: IndemnityAgreementResponse,
  })
  @RateLimited()
  @ApiErrorResponse(503, '"No indemnity agreement is published"')
  async readIndemnityAgreement() {
    return this.run(() => this.indemnityTemplate.execute());
  }

  @Get('vehicle-import/template')
  @ApiOperation({
    summary: 'Download the vehicle CSV template',
    description:
      'Returns the column layout the vehicle import expects, with one example row.',
  })
  @ApiOkResponse({
    description: 'CSV file',
    content: { 'text/csv': { schema: { type: 'string', format: 'binary' } } },
  })
  @RateLimited()
  downloadVehicleTemplate(@Res() res: FileResponse): void {
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename=vehicle-import-template.csv',
    );
    res.send(buildOnboardingVehicleCsvTemplate());
  }

  @Get('vehicle-import/columns')
  @ApiOperation({
    summary: 'Describe the vehicle CSV columns',
    description:
      'The column list behind the template, so the upload screen can explain the format without parsing a CSV.',
  })
  @ApiOkResponse({ description: 'Column definitions', type: VehicleCsvColumnsResponse })
  @RateLimited()
  describeVehicleColumns() {
    return {
      status: true,
      message: 'success',
      data: { columns: ONBOARDING_VEHICLE_CSV_COLUMNS },
    };
  }

  @Get(':applicationId')
  @ApiOperation({
    summary: 'Get an application',
    description:
      'Returns the application, its documents and which required documents are still missing. Requires the application token.',
  })
  @ApiOkResponse({ description: 'Application returned', type: OnboardingApplicationResponse })
  @TokenErrors()
  @ApplicationTokenHeader()
  async get(
    @Param('applicationId') applicationId: string,
    @Headers(APPLICATION_TOKEN_HEADER) applicationToken?: string,
  ) {
    const token = this.requireApplicationToken(applicationToken);
    return this.run(() => this.getApplication.execute(applicationId, token));
  }

  @Patch(':applicationId')
  @ApiOperation({
    summary: 'Update application details',
    description:
      'Replaces the organization and contact details. Changing a verified email or phone clears that verification.',
  })
  @ApiOkResponse({ description: 'Application updated', type: OnboardingApplicationResponse })
  @ApiErrorResponse(400, FIELD_OR_WHITELIST, OnboardingFieldErrorBody, ApiValidationErrorBody)
  @TokenErrors()
  @ApiErrorResponse(
    409,
    `${NOT_EDITABLE}, "An account or application already exists for this email", or an identity detail already on another application: { message, claimTypes }`,
    ApiErrorBody,
    DuplicateIdentityErrorBody,
  )
  @ApplicationTokenHeader()
  async update(
    @Param('applicationId') applicationId: string,
    @Body() payload: OnboardingApplicationDto,
    @Headers(APPLICATION_TOKEN_HEADER) applicationToken?: string,
  ) {
    const token = this.requireApplicationToken(applicationToken);
    return this.run(() =>
      this.updateApplication.execute(applicationId, token, payload),
    );
  }

  @Post(':applicationId/vehicles')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Add a vehicle with its licence',
    description:
      'Adds one vehicle to the application together with its vehicle licence (PDF, JPG or PNG up to 10MB). A vehicle cannot be added without the licence. A registration can only appear once per application.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['registrationNumber', 'vehicleType', 'make', 'model', 'file'],
      properties: {
        registrationNumber: { type: 'string', example: 'LAG-123-ABC' },
        vehicleType: { type: 'string', enum: [...ONBOARDING_VEHICLE_TYPES] },
        make: { type: 'string' },
        model: { type: 'string' },
        year: { type: 'integer' },
        engineNumber: { type: 'string' },
        chassisNumber: { type: 'string' },
        color: { type: 'string' },
        engineCapacity: { type: 'string' },
        odometerReading: { type: 'integer' },
        purchaseType: { type: 'string', enum: [...ONBOARDING_VEHICLE_PURCHASE_TYPES] },
        purchaseTypeOther: { type: 'string' },
        file: { type: 'string', format: 'binary', description: 'The vehicle licence.' },
      },
    },
  })
  @ApiCreatedResponse({ description: 'Vehicle added', type: OnboardingApplicationResponse })
  @ApiErrorResponse(
    400,
    'A field: { message, field }, with field "vehicleLicense" when the licence is missing. Or an unsupported or oversized file: { statusCode, message, error }.',
    OnboardingFieldErrorBody,
    ApiErrorBody,
  )
  @TokenErrors()
  @ApiErrorResponse(409, `${NOT_EDITABLE}, or "<registration> has already been added to this application"`)
  @TooLarge('10MB')
  @ApiErrorResponse(503, '"File upload failed"')
  @UseInterceptors(FileInterceptor('file', uploadLimits(MAX_DOCUMENT_UPLOAD_BYTES)))
  @ApplicationTokenHeader()
  async addApplicationVehicle(
    @Param('applicationId') applicationId: string,
    @Body() payload: OnboardingVehicleDto,
    @UploadedFile() licence?: UploadedDocumentFile,
    @Headers(APPLICATION_TOKEN_HEADER) applicationToken?: string,
  ) {
    const token = this.requireApplicationToken(applicationToken);
    return this.run(() =>
      this.addVehicle.execute({
        applicationId,
        applicationToken: token,
        vehicle: payload,
        licence,
      }),
    );
  }

  @Patch(':applicationId/vehicles/:vehicleId')
  @ApiOperation({ summary: 'Update a vehicle' })
  @ApiOkResponse({ description: 'Vehicle updated', type: OnboardingApplicationResponse })
  @ApiErrorResponse(400, FIELD_OR_WHITELIST, OnboardingFieldErrorBody, ApiValidationErrorBody)
  @TokenErrors(`${NOT_FOUND}, or "Vehicle not found"`)
  @ApiErrorResponse(409, `${NOT_EDITABLE}, or "<registration> has already been added to this application"`)
  @ApplicationTokenHeader()
  async updateApplicationVehicle(
    @Param('applicationId') applicationId: string,
    @Param('vehicleId') vehicleId: string,
    @Body() payload: OnboardingVehicleDto,
    @Headers(APPLICATION_TOKEN_HEADER) applicationToken?: string,
  ) {
    const token = this.requireApplicationToken(applicationToken);
    return this.run(() =>
      this.updateVehicle.execute({
        applicationId,
        applicationToken: token,
        vehicleId,
        vehicle: payload,
      }),
    );
  }

  @Delete(':applicationId/vehicles/:vehicleId')
  @ApiOperation({
    summary: 'Remove a vehicle',
    description: 'Removes the vehicle and any document filed against it.',
  })
  @ApiOkResponse({ description: 'Vehicle removed', type: OnboardingApplicationResponse })
  @TokenErrors(`${NOT_FOUND}, or "Vehicle not found"`)
  @ApiErrorResponse(409, NOT_EDITABLE)
  @ApplicationTokenHeader()
  async removeApplicationVehicle(
    @Param('applicationId') applicationId: string,
    @Param('vehicleId') vehicleId: string,
    @Headers(APPLICATION_TOKEN_HEADER) applicationToken?: string,
  ) {
    const token = this.requireApplicationToken(applicationToken);
    return this.run(() =>
      this.removeVehicle.execute({
        applicationId,
        applicationToken: token,
        vehicleId,
      }),
    );
  }

  @Post(':applicationId/vehicles/import')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Import vehicles from a CSV',
    description:
      'Adds the rows in the uploaded CSV. A row whose registration is already on the application updates that vehicle, so the same file can be uploaded twice without duplicating the fleet. Unreadable rows are reported and the rest are still imported.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiCreatedResponse({
    description:
      'Vehicles imported. Rows that could not be read are listed in data.skipped; message is "<n> vehicle(s) added, <m> updated".',
    type: VehicleImportResponse,
  })
  @ApiErrorResponse(
    400,
    '"A CSV file is required", "The uploaded file has no rows", "The uploaded file is missing these columns: <list>", or a multipart error such as "Unexpected field"',
  )
  @TokenErrors()
  @ApiErrorResponse(409, NOT_EDITABLE)
  @TooLarge('2MB')
  @UseInterceptors(FileInterceptor('file', uploadLimits(MAX_VEHICLE_CSV_BYTES)))
  @ApplicationTokenHeader()
  async importApplicationVehicles(
    @Param('applicationId') applicationId: string,
    @UploadedFile() file?: { buffer: Buffer },
    @Headers(APPLICATION_TOKEN_HEADER) applicationToken?: string,
  ) {
    const token = this.requireApplicationToken(applicationToken);
    if (!file) throw new BadRequestException('A CSV file is required');
    return this.run(() =>
      this.importVehicles.execute({
        applicationId,
        applicationToken: token,
        content: file.buffer.toString('utf8'),
      }),
    );
  }

  @Post(':applicationId/device-requests')
  @ApiOperation({
    summary: 'Request tracking devices',
    description:
      'Devices are fitted one per vehicle, so the total requested cannot exceed the vehicles on the application, and submit needs one per vehicle unless a stock shortfall was accepted. The body is validated first. Both outcomes are a 201 with status true, so read data.requestSaved.',
  })
  @ApiCreatedResponse({
    description:
      'Saved: data is the application plus requestSaved: true, requiresConfirmation: false, requestedQuantity (all devices requested on the application, this request included), availableQuantity and simAllocationQuantity. Nothing saved because stock is short: data is only { requestSaved: false, requiresConfirmation: true, requestedQuantity, availableQuantity, simAllocationQuantity, message }. Send the same request again with confirmAvailableQuantity: true to place it anyway.',
    type: OnboardingApplicationResponse,
  })
  @ApiErrorResponse(
    400,
    `${FIELD_OR_WHITELIST} Asking for more devices than vehicles is field "quantity".`,
    OnboardingFieldErrorBody,
    ApiValidationErrorBody,
  )
  @TokenErrors()
  @ApiErrorResponse(409, NOT_EDITABLE)
  @ApplicationTokenHeader()
  async requestApplicationDevices(
    @Param('applicationId') applicationId: string,
    @Body() payload: OnboardingDeviceRequestDto,
    @Headers(APPLICATION_TOKEN_HEADER) applicationToken?: string,
  ) {
    const token = this.requireApplicationToken(applicationToken);
    return this.run(() =>
      this.requestDevices.execute({
        applicationId,
        applicationToken: token,
        quantity: payload.quantity,
        useCase: payload.useCase,
        notes: payload.notes,
        confirmAvailableQuantity: payload.confirmAvailableQuantity,
      }),
    );
  }

  @Delete(':applicationId/device-requests/:requestId')
  @ApiOperation({ summary: 'Withdraw a device request' })
  @ApiOkResponse({
    description: 'Device request removed',
    type: OnboardingApplicationResponse,
  })
  @TokenErrors(`${NOT_FOUND}, or "Device request not found"`)
  @ApiErrorResponse(409, NOT_EDITABLE)
  @ApplicationTokenHeader()
  async removeApplicationDeviceRequest(
    @Param('applicationId') applicationId: string,
    @Param('requestId') requestId: string,
    @Headers(APPLICATION_TOKEN_HEADER) applicationToken?: string,
  ) {
    const token = this.requireApplicationToken(applicationToken);
    return this.run(() =>
      this.removeDeviceRequest.execute({
        applicationId,
        applicationToken: token,
        requestId,
      }),
    );
  }

  @Get(':applicationId/order')
  @ApiOperation({
    summary: 'Get the order for an application',
    description:
      'What the applicant owes: the licence per device, the installation fee, and the total. Priced from the application, never from the request.',
  })
  @ApiOkResponse({ description: 'Order returned', type: ApplicationOrderResponse })
  @TokenErrors()
  @ApiErrorResponse(
    409,
    'Cannot be priced: "No M2M licence plan was chosen", "The chosen M2M licence plan is no longer available", or "No devices were requested"',
  )
  @ApplicationTokenHeader()
  async order(
    @Param('applicationId') applicationId: string,
    @Headers(APPLICATION_TOKEN_HEADER) applicationToken?: string,
  ) {
    const token = this.requireApplicationToken(applicationToken);
    return this.run(() => this.applicationOrder.execute(applicationId, token));
  }

  @Put(':applicationId/billing-email')
  @ApiOperation({
    summary: 'Set the billing email',
    description:
      'Where the invoice and receipt go. Changing it clears its verification, so a code has to be confirmed again before payment.',
  })
  @ApiBody({ type: BillingEmailDto })
  @ApiOkResponse({
    description: 'Billing email saved',
    type: BillingEmailResponse,
  })
  @ApiErrorResponse(400, 'The address is not a valid email: { message, field }', OnboardingFieldErrorBody)
  @TokenErrors()
  @ApiErrorResponse(409, `Past the payment stage or already paid: ${NOT_EDITABLE}`)
  @ApplicationTokenHeader()
  async billingEmail(
    @Param('applicationId') applicationId: string,
    @Body('billingEmail') billingEmail?: string,
    @Headers(APPLICATION_TOKEN_HEADER) applicationToken?: string,
  ) {
    const token = this.requireApplicationToken(applicationToken);
    return this.run(() =>
      this.setBillingEmail.execute({
        applicationId,
        applicationToken: token,
        billingEmail,
      }),
    );
  }

  @Post(':applicationId/verify/billing-email/send')
  @ApiOperation({
    summary: 'Send the billing email verification code',
    description: 'Sends a 6 digit code to the billing address.',
  })
  @ApiCreatedResponse({ description: 'Code sent', type: VerificationCodeSentResponse })
  @ApiErrorResponse(
    400,
    'No billing email yet: { message: "Set a billing email before requesting a code for it", field: "billingEmail" }',
    OnboardingFieldErrorBody,
  )
  @TokenErrors(NOT_FOUND, CodeSendLimited)
  @ApiErrorResponse(409, `Past the payment stage or already paid: ${NOT_EDITABLE}`)
  @ApiErrorResponse(503, '"Could not send the billing_email verification code"')
  @ApplicationTokenHeader()
  async sendBillingEmailCode(
    @Param('applicationId') applicationId: string,
    @Headers(APPLICATION_TOKEN_HEADER) applicationToken?: string,
  ) {
    const token = this.requireApplicationToken(applicationToken);
    return this.run(() =>
      this.sendCode.execute({
        applicationId,
        applicationToken: token,
        channel: 'billing_email',
      }),
    );
  }

  @Post(':applicationId/verify/billing-email')
  @ApiOperation({ summary: 'Verify the billing email code' })
  @ApiBody({ type: VerificationCodeDto })
  @ApiCreatedResponse({ description: 'Billing email verified', type: OnboardingApplicationResponse })
  @ApiErrorResponse(
    400,
    '"The verification code is incorrect or has expired", or "Too many incorrect attempts, request a new code". Not 6 digits: { message, field: "code" }.',
    ApiErrorBody,
    OnboardingFieldErrorBody,
  )
  @TokenErrors()
  @ApiErrorResponse(409, `Past the payment stage or already paid: ${NOT_EDITABLE}`)
  @ApplicationTokenHeader()
  async verifyBillingEmail(
    @Param('applicationId') applicationId: string,
    @Body('code') code?: string,
    @Headers(APPLICATION_TOKEN_HEADER) applicationToken?: string,
  ) {
    const token = this.requireApplicationToken(applicationToken);
    return this.run(() =>
      this.confirmCode.execute({
        applicationId,
        applicationToken: token,
        channel: 'billing_email',
        code,
      }),
    );
  }

  @Post(':applicationId/payment')
  @ApiOperation({
    summary: 'Start the payment',
    description:
      'Initialises a charge for the order. The amount is computed from the application, so a request cannot name its own price.',
  })
  @ApiBody({
    required: false,
    schema: {
      type: 'object',
      properties: {
        redirectUrl: { type: 'string', description: 'Where the provider returns the applicant after paying.' },
      },
    },
  })
  @ApiCreatedResponse({ description: 'Payment initialised', type: ApplicationPaymentResponse })
  @ApiErrorResponse(400, '"Verify the billing email before paying"')
  @TokenErrors()
  @ApiErrorResponse(
    409,
    '"An application at the <stage> stage cannot be paid for", "This application is already paid", "No M2M licence plan was chosen", "The chosen M2M licence plan is no longer available", or "No devices were requested"',
  )
  @ApiErrorResponse(
    402,
    'The provider refused to initialise the charge: "The payment provider refused to start this payment. Try again shortly."',
  )
  @ApiErrorResponse(503, '"No payment provider is configured"')
  @ApplicationTokenHeader()
  async pay(
    @Param('applicationId') applicationId: string,
    @Body('redirectUrl') redirectUrl?: string,
    @Headers(APPLICATION_TOKEN_HEADER) applicationToken?: string,
  ) {
    const token = this.requireApplicationToken(applicationToken);
    return this.run(() =>
      this.startPayment.execute({
        applicationId,
        applicationToken: token,
        redirectUrl,
      }),
    );
  }

  @Post(':applicationId/installation')
  @ApiOperation({
    summary: 'Schedule the installation',
    description:
      'Books the fitting and assigns an installer. Every paid-for device is assigned to one vehicle, and no vehicle takes two. The account setup link is emailed once this succeeds.',
  })
  @ApiCreatedResponse({
    description:
      'Installation scheduled. message says whether an installer was assigned at once.',
    type: ScheduledInstallationResponse,
  })
  @ApiErrorResponse(
    400,
    'Every field error is { message, field }. The date errors ("The installation date is not a date", "An installation must be booked at least one day ahead", "An installation cannot be booked more than 90 days ahead") name field "scheduledDate". The assignment errors ("<n> device(s) were paid for but <m> were assigned", "Device <i> is not on this order", "Device <i> was assigned twice", "A device was assigned to a vehicle that is not on this application", "<vehicleId> already has a device assigned to it") name field "assignments", and add deviceIndex when the error is about one device. An unknown property gives the ValidationPipe array body. The body is validated before the stage is checked, so a bad body is a 400 at any stage.',
    OnboardingFieldErrorBody,
    ApiValidationErrorBody,
    ApiErrorBody,
  )
  @TokenErrors()
  @ApiErrorResponse(
    409,
    '"An onboarding at the <stage> stage cannot be scheduled", "This application has no tenant yet", or "An installation is already scheduled"',
  )
  @ApplicationTokenHeader()
  async schedule(
    @Param('applicationId') applicationId: string,
    @Body() payload: ScheduleInstallationDto,
    @Headers(APPLICATION_TOKEN_HEADER) applicationToken?: string,
  ) {
    const token = this.requireApplicationToken(applicationToken);
    return this.run(() =>
      this.scheduleInstallation.execute({
        applicationId,
        applicationToken: token,
        scheduledDate: payload.scheduledDate,
        timeSlot: payload.timeSlot,
        addressLine: payload.addressLine,
        city: payload.city,
        state: payload.state,
        siteContactName: payload.siteContactName,
        siteContactPhone: payload.siteContactPhone,
        notes: payload.notes,
        requiredCapabilities: payload.requiredCapabilities,
        assignments: payload.assignments ?? [],
      }),
    );
  }

  @Post(':applicationId/indemnity-signature')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Sign the indemnity agreement',
    description:
      'Records the signature drawn or uploaded on the agreement panel, against the version that was on screen. Signing again replaces the previous signature.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['signer_name', 'template_version', 'method', 'file'],
      properties: {
        signer_name: { type: 'string' },
        template_version: { type: 'string' },
        method: { type: 'string', enum: [...INDEMNITY_SIGNATURE_METHODS] },
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  @ApiCreatedResponse({
    description: 'Agreement signed',
    type: IndemnitySignatureResponse,
  })
  @ApiErrorResponse(
    400,
    'signer_name or method: { message, field }. The image: "Missing signature image" or "Signature must be a JPG or PNG image". Or a multipart error such as "Unexpected field".',
    OnboardingFieldErrorBody,
    ApiErrorBody,
  )
  @TokenErrors()
  @ApiErrorResponse(
    409,
    `${NOT_EDITABLE}, or "This form is version <x> but version <y> is now in force. Read the current form and sign again."`,
  )
  @TooLarge('2MB')
  @ApiErrorResponse(503, '"No indemnity agreement is published", or "Signature upload failed"')
  @UseInterceptors(FileInterceptor('file', uploadLimits(MAX_SIGNATURE_UPLOAD_BYTES)))
  @ApplicationTokenHeader()
  async signIndemnityAgreement(
    @Param('applicationId') applicationId: string,
    @UploadedFile() file?: UploadedSignatureFile,
    @Body('signer_name') signerName?: string,
    @Body('template_version') templateVersion?: string,
    @Body('method') method?: string,
    @Headers(APPLICATION_TOKEN_HEADER) applicationToken?: string,
    @Headers('user-agent') userAgent?: string,
    @Ip() ipAddress?: string,
  ) {
    const token = this.requireApplicationToken(applicationToken);
    return this.run(() =>
      this.signIndemnity.execute({
        applicationId,
        applicationToken: token,
        signerName,
        templateVersion,
        method,
        file,
        ipAddress,
        userAgent,
      }),
    );
  }

  @Post(':applicationId/documents')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Upload a supporting document',
    description:
      'Uploads one supporting document. Accepted formats are PDF, JPG and PNG up to 10MB, decided by the file contents rather than the declared type. Re-uploading a document type replaces the previous file.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['document_type', 'file'],
      properties: {
        document_type: { type: 'string', enum: [...UPLOADABLE_DOCUMENT_TYPES] },
        vehicle_id: {
          type: 'string',
          description: 'Required for per-vehicle documents such as the vehicle licence.',
        },
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  @ApiCreatedResponse({ description: 'Document stored', type: OnboardingApplicationResponse })
  @ApiErrorResponse(
    400,
    'The file or type: "Invalid or missing document_type", "Missing upload file", or an unsupported format: { statusCode, message, error }. A type this applicant does not file, or a bad vehicle_id: { message, field }. Or a multipart error such as "Unexpected field".',
    ApiErrorBody,
    OnboardingFieldErrorBody,
  )
  @TokenErrors()
  @ApiErrorResponse(
    409,
    `${NOT_EDITABLE}, or the file or an identity detail is already on another application: { message, claimTypes }`,
    ApiErrorBody,
    DuplicateIdentityErrorBody,
  )
  @TooLarge('10MB')
  @ApiErrorResponse(503, '"File upload failed"')
  @UseInterceptors(FileInterceptor('file', uploadLimits(MAX_DOCUMENT_UPLOAD_BYTES)))
  @ApplicationTokenHeader()
  async upload(
    @Param('applicationId') applicationId: string,
    @UploadedFile()
    file?: {
      originalname: string;
      mimetype: string;
      size: number;
      buffer: Buffer;
    },
    @Body('document_type') documentType?: string,
    @Body('vehicle_id') vehicleId?: string,
    @Headers(APPLICATION_TOKEN_HEADER) applicationToken?: string,
  ) {
    const token = this.requireApplicationToken(applicationToken);
    return this.run(() =>
      this.uploadDocument.execute({
        applicationId,
        applicationToken: token,
        documentType,
        vehicleId,
        file,
      }),
    );
  }

  @Delete(':applicationId/documents/:documentId')
  @ApiOperation({
    summary: 'Remove a supporting document',
    description: 'Deletes one uploaded document and its stored file.',
  })
  @ApiOkResponse({ description: 'Document removed', type: OnboardingApplicationResponse })
  @TokenErrors(`${NOT_FOUND}. An unknown document also answers "Application not found"`)
  @ApiErrorResponse(
    409,
    `${NOT_EDITABLE}, or an identity conflict re-checked after the removal: { message, claimTypes }`,
    ApiErrorBody,
    DuplicateIdentityErrorBody,
  )
  @ApplicationTokenHeader()
  async remove(
    @Param('applicationId') applicationId: string,
    @Param('documentId') documentId: string,
    @Headers(APPLICATION_TOKEN_HEADER) applicationToken?: string,
  ) {
    const token = this.requireApplicationToken(applicationToken);
    return this.run(() =>
      this.deleteDocument.execute({
        applicationId,
        applicationToken: token,
        documentId,
      }),
    );
  }

  @Post(':applicationId/verify/email/send')
  @ApiOperation({
    summary: 'Send the email verification code',
    description:
      'Sends a 6 digit code to the business email. Any previous code stops working. Rate limited per application.',
  })
  @ApiCreatedResponse({ description: 'Code sent', type: VerificationCodeSentResponse })
  @TokenErrors(NOT_FOUND, CodeSendLimited)
  @ApiErrorResponse(409, NOT_EDITABLE)
  @ApiErrorResponse(503, '"Could not send the email verification code"')
  @ApplicationTokenHeader()
  async sendEmailCode(
    @Param('applicationId') applicationId: string,
    @Headers(APPLICATION_TOKEN_HEADER) applicationToken?: string,
  ) {
    const token = this.requireApplicationToken(applicationToken);
    return this.run(() =>
      this.sendCode.execute({
        applicationId,
        applicationToken: token,
        channel: 'email',
      }),
    );
  }

  @Post(':applicationId/verify/email')
  @ApiOperation({
    summary: 'Verify the email code',
    description: 'Confirms the 6 digit code sent to the business email.',
  })
  @ApiBody({ type: VerificationCodeDto })
  @ApiCreatedResponse({ description: 'Email verified', type: OnboardingApplicationResponse })
  @ApiErrorResponse(
    400,
    '"The verification code is incorrect or has expired", or "Too many incorrect attempts, request a new code". Not 6 digits: { message, field: "code" }.',
    ApiErrorBody,
    OnboardingFieldErrorBody,
  )
  @TokenErrors()
  @ApiErrorResponse(409, NOT_EDITABLE)
  @ApplicationTokenHeader()
  async verifyEmail(
    @Param('applicationId') applicationId: string,
    @Body('code') code?: string,
    @Headers(APPLICATION_TOKEN_HEADER) applicationToken?: string,
  ) {
    const token = this.requireApplicationToken(applicationToken);
    return this.run(() =>
      this.confirmCode.execute({
        applicationId,
        applicationToken: token,
        channel: 'email',
        code,
      }),
    );
  }

  @Post(':applicationId/verify/phone/send')
  @ApiOperation({
    summary: 'Send the phone verification code',
    description:
      'Sends a 6 digit code by SMS to the organization phone number. The platform pays for the message, never the applicant.',
  })
  @ApiCreatedResponse({ description: 'Code sent', type: VerificationCodeSentResponse })
  @TokenErrors(NOT_FOUND, CodeSendLimited)
  @ApiErrorResponse(409, NOT_EDITABLE)
  @ApiErrorResponse(503, '"Could not send the sms verification code"')
  @ApplicationTokenHeader()
  async sendPhoneCode(
    @Param('applicationId') applicationId: string,
    @Headers(APPLICATION_TOKEN_HEADER) applicationToken?: string,
  ) {
    const token = this.requireApplicationToken(applicationToken);
    return this.run(() =>
      this.sendCode.execute({
        applicationId,
        applicationToken: token,
        channel: 'sms',
      }),
    );
  }

  @Post(':applicationId/verify/phone')
  @ApiOperation({
    summary: 'Verify the phone code',
    description: 'Confirms the 6 digit code sent by SMS.',
  })
  @ApiBody({ type: VerificationCodeDto })
  @ApiCreatedResponse({ description: 'Phone number verified', type: OnboardingApplicationResponse })
  @ApiErrorResponse(
    400,
    '"The verification code is incorrect or has expired", or "Too many incorrect attempts, request a new code". Not 6 digits: { message, field: "code" }.',
    ApiErrorBody,
    OnboardingFieldErrorBody,
  )
  @TokenErrors()
  @ApiErrorResponse(409, NOT_EDITABLE)
  @ApplicationTokenHeader()
  async verifyPhone(
    @Param('applicationId') applicationId: string,
    @Body('code') code?: string,
    @Headers(APPLICATION_TOKEN_HEADER) applicationToken?: string,
  ) {
    const token = this.requireApplicationToken(applicationToken);
    return this.run(() =>
      this.confirmCode.execute({
        applicationId,
        applicationToken: token,
        channel: 'sms',
        code,
      }),
    );
  }

  @Post(':applicationId/submit')
  @ApiOperation({
    summary: 'Submit the application for review',
    description:
      'Locks the application, runs the automated checks and places it in the review queue. Requires: business email and phone verified, an M2M plan chosen, the indemnity agreement signed, at least one vehicle, every document required for the applicant type, a vehicle licence for each vehicle, and one device per vehicle: exactly as many devices as vehicles, unless the customer accepted a disclosed stock shortfall, and never more. The 400 body says which gate failed through deviceAllocationComplete and inventoryShortfallAccepted. The response carries automatedDecision.',
  })
  @ApiCreatedResponse({
    description:
      'Application submitted. data.automatedDecision is approve, reject or manual_review.',
    type: SubmittedOnboardingApplicationResponse,
  })
  @ApiErrorResponse(
    400,
    'Incomplete. message lists every reason; the other keys say which gate failed.',
    OnboardingIncompleteErrorBody,
  )
  @TokenErrors()
  @ApiErrorResponse(409, NOT_EDITABLE)
  @ApplicationTokenHeader()
  async submit(
    @Param('applicationId') applicationId: string,
    @Headers(APPLICATION_TOKEN_HEADER) applicationToken?: string,
  ) {
    const token = this.requireApplicationToken(applicationToken);
    return this.run(() =>
      this.submitApplication.execute(applicationId, token),
    );
  }

  @Get(':applicationId/status')
  @ApiOperation({
    summary: 'Get application progress',
    description:
      'Returns the review timeline shown after submission, plus any decision reason.',
  })
  @ApiOkResponse({
    description: 'Status returned',
    type: OnboardingApplicationStatusResponse,
  })
  @TokenErrors()
  @ApplicationTokenHeader()
  async status(
    @Param('applicationId') applicationId: string,
    @Headers(APPLICATION_TOKEN_HEADER) applicationToken?: string,
  ) {
    const token = this.requireApplicationToken(applicationToken);
    return this.run(() =>
      this.applicationStatus.execute(applicationId, token),
    );
  }

  private requireApplicationToken(header?: string): string {
    const token = header?.trim();
    if (!token) {
      throw new UnauthorizedException('Missing application token');
    }
    return token;
  }

  private async run<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      if (error instanceof OnboardingValidationError) {
        throw new BadRequestException({
          message: error.message,
          field: error.field,
        });
      }
      if (error instanceof InvalidDocumentFileError) {
        throw new BadRequestException(error.message);
      }
      if (error instanceof InvalidVerificationCodeError) {
        throw new BadRequestException(error.message);
      }
      if (error instanceof ApplicationIncompleteError) {
        throw new BadRequestException({
          message: error.message,
          ...error.details,
        });
      }
      if (error instanceof VerificationResendTooSoonError) {
        throw new HttpException(
          { message: error.message, retryAfterSeconds: error.secondsRemaining },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      if (error instanceof ChannelAlreadyVerifiedError) {
        throw new ConflictException(error.message);
      }
      if (error instanceof VerificationSendLimitError) {
        throw new HttpException(error.message, HttpStatus.TOO_MANY_REQUESTS);
      }
      if (error instanceof VerificationDispatchError) {
        throw new ServiceUnavailableException(error.message);
      }
      if (
        error instanceof VehicleCsvEmptyError ||
        error instanceof VehicleCsvColumnsMissingError
      ) {
        throw new BadRequestException(error.message);
      }
      if (
        error instanceof ApplicationNotFoundError ||
        error instanceof VehicleNotFoundError ||
        error instanceof DeviceRequestNotFoundError
      ) {
        throw new NotFoundException(error.message);
      }
      if (error instanceof DuplicateVehicleError) {
        throw new ConflictException(error.message);
      }
      if (error instanceof DuplicateIdentityError) {
        throw new ConflictException({
          message: error.message,
          claimTypes: error.claimTypes,
        });
      }
      if (error instanceof IndemnityTemplateSupersededError) {
        throw new ConflictException(error.message);
      }
      if (error instanceof IndemnityTemplateNotFoundError) {
        throw new ServiceUnavailableException(error.message);
      }
      if (error instanceof PaymentProviderUnavailableError) {
        throw new ServiceUnavailableException(error.message);
      }
      if (error instanceof ChargeRefusedError) {
        throw new HttpException(error.message, HttpStatus.PAYMENT_REQUIRED);
      }
      if (
        error instanceof ApplicationNotPayableError ||
        error instanceof InstallationNotSchedulableError
      ) {
        throw new ConflictException(error.message);
      }
      if (
        error instanceof InvalidInstallationDateError ||
        error instanceof DeviceAssignmentMismatchError ||
        error instanceof VehicleAlreadyAssignedError
      ) {
        throw new BadRequestException({
          message: error.message,
          field: error.field,
          ...('deviceIndex' in error && error.deviceIndex !== undefined
            ? { deviceIndex: error.deviceIndex }
            : {}),
        });
      }
      if (error instanceof BillingEmailNotVerifiedError) {
        throw new BadRequestException(error.message);
      }
      if (
        error instanceof ApplicationNotEditableError ||
        error instanceof BusinessEmailInUseError
      ) {
        throw new ConflictException(error.message);
      }
      throw error;
    }
  }
}
