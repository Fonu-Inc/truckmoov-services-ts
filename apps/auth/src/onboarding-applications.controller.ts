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
  Res,
  ServiceUnavailableException,
  UnauthorizedException,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { MAX_DOCUMENT_UPLOAD_BYTES, uploadLimits } from '@shared/http';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiConflictResponse,
  ApiConsumes,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ActivityLogService } from './activity-log.service';
import { BaseAuthController } from './base.controller';
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
  ONBOARDING_DOCUMENT_TYPES,
  ONBOARDING_VEHICLE_CSV_COLUMNS,
  OnboardingApplicationRateLimitGuard,
  OnboardingValidationError,
  RemoveApplicationDeviceRequestUseCase,
  RemoveApplicationVehicleUseCase,
  RequestApplicationDevicesUseCase,
  ResumeOnboardingApplicationUseCase,
  SendOnboardingVerificationCodeUseCase,
  SignIndemnityAgreementUseCase,
  SubmitOnboardingApplicationUseCase,
  UpdateApplicationVehicleUseCase,
  UpdateOnboardingApplicationUseCase,
  UploadOnboardingApplicationDocumentUseCase,
  VehicleCsvColumnsMissingError,
  VehicleCsvEmptyError,
  VehicleNotFoundError,
  VerificationDispatchError,
  VerificationResendTooSoonError,
  VerificationSendLimitError,
} from '@auth/onboarding';
import { OnboardingApplicationDto } from './dto/onboarding-application.dto';
import {
  OnboardingDeviceRequestDto,
  OnboardingVehicleDto,
} from './dto/onboarding-vehicle.dto';

const APPLICATION_TOKEN_HEADER = 'x-application-token';

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
  ) {
    super(activityLogService);
  }

  @Post()
  @ApiOperation({
    summary: 'Start an onboarding application',
    description:
      'Creates a draft application from the landing page and returns the application token. No account is created at this point.',
  })
  @ApiCreatedResponse({ description: 'Draft application created' })
  @ApiBadRequestResponse({ description: 'A submitted field is invalid' })
  @ApiConflictResponse({
    description: 'An account or live application already exists for this email',
  })
  async create(@Body() payload: OnboardingApplicationDto) {
    return this.run(() => this.createApplication.execute(payload));
  }

  @Get('m2m-plans')
  @ApiOperation({
    summary: 'List the M2M licence plans',
    description:
      'The plans shown on the customer details step. Each is priced per device, with a first year price and a renewal price.',
  })
  @ApiOkResponse({ description: 'Plans returned' })
  async listM2mPlans() {
    return this.m2mPlans.execute();
  }

  @Post('resume')
  @ApiOperation({
    summary: 'Email a link back into an open application',
    description:
      'Sends a fresh link to the verified business email and retires the previous one. The reply is the same whether or not an application exists for the address.',
  })
  @ApiCreatedResponse({ description: 'Request accepted' })
  async resume(@Body('businessEmail') businessEmail?: string) {
    return this.run(() => this.resumeApplication.execute(businessEmail));
  }

  @Get('indemnity-agreement')
  @ApiOperation({
    summary: 'Read the indemnity agreement',
    description:
      'The wording currently in force, with the version to send back when signing.',
  })
  @ApiOkResponse({ description: 'Agreement returned' })
  async readIndemnityAgreement() {
    return this.run(() => this.indemnityTemplate.execute());
  }

  @Get('vehicle-import/template')
  @ApiOperation({
    summary: 'Download the vehicle CSV template',
    description:
      'Returns the column layout the vehicle import expects, with one example row.',
  })
  @ApiOkResponse({ description: 'CSV file', content: { 'text/csv': {} } })
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
  @ApiOkResponse({ description: 'Column definitions' })
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
  @ApiOkResponse({ description: 'Application returned' })
  @ApiNotFoundResponse({ description: 'Application not found' })
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
  @ApiOkResponse({ description: 'Application updated' })
  @ApiBadRequestResponse({ description: 'A submitted field is invalid' })
  @ApiNotFoundResponse({ description: 'Application not found' })
  @ApiConflictResponse({ description: 'Application can no longer be changed' })
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
  @ApiOperation({
    summary: 'Add a vehicle',
    description:
      'Adds one vehicle to the application. A registration can only appear once per application.',
  })
  @ApiCreatedResponse({ description: 'Vehicle added' })
  @ApiBadRequestResponse({ description: 'A submitted field is invalid' })
  @ApiConflictResponse({ description: 'This registration is already on the application' })
  async addApplicationVehicle(
    @Param('applicationId') applicationId: string,
    @Body() payload: OnboardingVehicleDto,
    @Headers(APPLICATION_TOKEN_HEADER) applicationToken?: string,
  ) {
    const token = this.requireApplicationToken(applicationToken);
    return this.run(() =>
      this.addVehicle.execute({
        applicationId,
        applicationToken: token,
        vehicle: payload,
      }),
    );
  }

  @Patch(':applicationId/vehicles/:vehicleId')
  @ApiOperation({ summary: 'Update a vehicle' })
  @ApiOkResponse({ description: 'Vehicle updated' })
  @ApiNotFoundResponse({ description: 'Vehicle not found' })
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
  @ApiOkResponse({ description: 'Vehicle removed' })
  @ApiNotFoundResponse({ description: 'Vehicle not found' })
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
  @ApiCreatedResponse({ description: 'Vehicles imported' })
  @ApiBadRequestResponse({ description: 'The file is empty or missing columns' })
  @UseInterceptors(FileInterceptor('file', uploadLimits(MAX_VEHICLE_CSV_BYTES)))
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
      'Devices are fitted one per vehicle, so the total requested cannot exceed the vehicles on the application.',
  })
  @ApiCreatedResponse({ description: 'Device request submitted' })
  @ApiBadRequestResponse({ description: 'More devices than vehicles, or an invalid field' })
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
      }),
    );
  }

  @Delete(':applicationId/device-requests/:requestId')
  @ApiOperation({ summary: 'Withdraw a device request' })
  @ApiOkResponse({ description: 'Device request removed' })
  @ApiNotFoundResponse({ description: 'Device request not found' })
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
  @ApiCreatedResponse({ description: 'Agreement signed' })
  @ApiBadRequestResponse({ description: 'Missing signature image or an invalid field' })
  @ApiConflictResponse({ description: 'A newer version of the agreement is in force' })
  @UseInterceptors(FileInterceptor('file', uploadLimits(MAX_SIGNATURE_UPLOAD_BYTES)))
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
        document_type: { type: 'string', enum: [...ONBOARDING_DOCUMENT_TYPES] },
        vehicle_id: {
          type: 'string',
          description: 'Required for per-vehicle documents such as the vehicle licence.',
        },
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  @ApiCreatedResponse({ description: 'Document stored' })
  @ApiBadRequestResponse({
    description: 'Missing file, unsupported format or invalid document_type',
  })
  @ApiNotFoundResponse({ description: 'Application not found' })
  @ApiConflictResponse({ description: 'Application can no longer be changed' })
  @UseInterceptors(FileInterceptor('file', uploadLimits(MAX_DOCUMENT_UPLOAD_BYTES)))
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
  @ApiOkResponse({ description: 'Document removed' })
  @ApiNotFoundResponse({ description: 'Application or document not found' })
  @ApiConflictResponse({ description: 'Application can no longer be changed' })
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
  @ApiOkResponse({ description: 'Code sent' })
  @ApiNotFoundResponse({ description: 'Application not found' })
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
  @ApiOkResponse({ description: 'Email verified' })
  @ApiBadRequestResponse({ description: 'The code is wrong or has expired' })
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
  @ApiOkResponse({ description: 'Code sent' })
  @ApiNotFoundResponse({ description: 'Application not found' })
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
  @ApiOkResponse({ description: 'Phone number verified' })
  @ApiBadRequestResponse({ description: 'The code is wrong or has expired' })
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
      'Locks the application and places it in the review queue. Requires both contacts verified and all ten documents uploaded.',
  })
  @ApiOkResponse({ description: 'Application submitted' })
  @ApiBadRequestResponse({
    description: 'Verification or documents are still outstanding',
  })
  @ApiConflictResponse({ description: 'Application can no longer be changed' })
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
  @ApiOkResponse({ description: 'Status returned' })
  @ApiNotFoundResponse({ description: 'Application not found' })
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
      if (
        error instanceof VerificationResendTooSoonError ||
        error instanceof VerificationSendLimitError
      ) {
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
