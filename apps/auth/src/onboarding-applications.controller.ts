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
  NotFoundException,
  Param,
  Patch,
  Post,
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
  ApplicationIncompleteError,
  ApplicationNotEditableError,
  ApplicationNotFoundError,
  BusinessEmailInUseError,
  ConfirmOnboardingVerificationCodeUseCase,
  CreateOnboardingApplicationUseCase,
  DeleteOnboardingApplicationDocumentUseCase,
  GetOnboardingApplicationStatusUseCase,
  GetOnboardingApplicationUseCase,
  InvalidDocumentFileError,
  InvalidVerificationCodeError,
  ONBOARDING_DOCUMENT_TYPES,
  OnboardingApplicationRateLimitGuard,
  OnboardingValidationError,
  SendOnboardingVerificationCodeUseCase,
  SubmitOnboardingApplicationUseCase,
  UpdateOnboardingApplicationUseCase,
  UploadOnboardingApplicationDocumentUseCase,
  VerificationDispatchError,
  VerificationResendTooSoonError,
  VerificationSendLimitError,
} from '@auth/onboarding';
import { OnboardingApplicationDto } from './dto/onboarding-application.dto';

const APPLICATION_TOKEN_HEADER = 'x-application-token';

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
    @Headers(APPLICATION_TOKEN_HEADER) applicationToken?: string,
  ) {
    const token = this.requireApplicationToken(applicationToken);
    return this.run(() =>
      this.uploadDocument.execute({
        applicationId,
        applicationToken: token,
        documentType,
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
      if (error instanceof ApplicationNotFoundError) {
        throw new NotFoundException(error.message);
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
