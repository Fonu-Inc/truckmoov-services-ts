import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { StandardApiResponse } from '@shared/openapi';
import {
  AUTOMATED_OUTCOMES,
  ONBOARDING_APPLICANT_TYPES,
  ONBOARDING_APPLICATION_STATUSES,
  ONBOARDING_DOCUMENT_STATUSES,
  ONBOARDING_DOCUMENT_TYPES,
  ONBOARDING_IDENTIFICATION_TYPES,
  ONBOARDING_PAYMENT_STATUSES,
  ONBOARDING_STAGES,
  ONBOARDING_VEHICLE_PURCHASE_TYPES,
  ONBOARDING_VEHICLE_TYPES,
  ONBOARDING_VERIFICATION_CHANNELS,
} from '@auth/onboarding';

const NULLABLE_STRING = { type: String, nullable: true } as const;
const NULLABLE_NUMBER = { type: Number, nullable: true } as const;

export class OnboardingOrganizationSchema {
  @ApiProperty() organizationName!: string;
  @ApiProperty() businessEmail!: string;
  @ApiProperty({ description: 'E.164 form.' }) organizationPhone!: string;
  @ApiProperty() streetAddress!: string;
  @ApiProperty() city!: string;
  @ApiProperty() state!: string;
}

export class OnboardingContactSchema {
  @ApiProperty() fullName!: string;
  @ApiProperty(NULLABLE_STRING) role!: string | null;
}

export class OnboardingRegistrySchema {
  @ApiProperty(NULLABLE_STRING) rcNumber!: string | null;
  @ApiProperty(NULLABLE_STRING) taxIdentificationNumber!: string | null;
  @ApiProperty({
    enum: [...ONBOARDING_IDENTIFICATION_TYPES],
    nullable: true,
  })
  identificationType!: string | null;
  @ApiProperty(NULLABLE_STRING) identificationNumber!: string | null;
}

export class OnboardingVehicleSchema {
  @ApiProperty() id!: string;
  @ApiProperty() registrationNumber!: string;
  @ApiProperty({ enum: [...ONBOARDING_VEHICLE_TYPES] }) vehicleType!: string;
  @ApiProperty() make!: string;
  @ApiProperty() model!: string;
  @ApiProperty(NULLABLE_NUMBER) year!: number | null;
  @ApiProperty(NULLABLE_STRING) engineNumber!: string | null;
  @ApiProperty(NULLABLE_STRING) chassisNumber!: string | null;
  @ApiProperty(NULLABLE_STRING) color!: string | null;
  @ApiProperty(NULLABLE_STRING) engineCapacity!: string | null;
  @ApiProperty(NULLABLE_NUMBER) odometerReading!: number | null;
  @ApiProperty({
    enum: [...ONBOARDING_VEHICLE_PURCHASE_TYPES],
    nullable: true,
  })
  purchaseType!: string | null;
  @ApiProperty(NULLABLE_STRING) purchaseTypeOther!: string | null;
}

export class OnboardingDeviceRequestSchema {
  @ApiProperty() id!: string;
  @ApiProperty() quantity!: number;
  @ApiProperty() useCase!: string;
  @ApiProperty(NULLABLE_STRING) notes!: string | null;
}

export class OnboardingContactVerificationSchema {
  @ApiProperty() emailVerified!: boolean;
  @ApiProperty() phoneVerified!: boolean;
}

export class OnboardingDocumentSchema {
  @ApiProperty() id!: string;
  @ApiProperty(NULLABLE_STRING) vehicleId!: string | null;
  @ApiProperty({ enum: [...ONBOARDING_DOCUMENT_TYPES] }) documentType!: string;
  @ApiProperty() documentName!: string;
  @ApiProperty() fileSize!: number;
  @ApiProperty({ enum: [...ONBOARDING_DOCUMENT_STATUSES] }) status!: string;
  @ApiProperty(NULLABLE_STRING) rejectionReason!: string | null;
  @ApiProperty({ format: 'date-time' }) uploadedAt!: string;
}

export class OnboardingVehicleMissingDocumentSchema {
  @ApiProperty() vehicleId!: string;
  @ApiProperty() registrationNumber!: string;
  @ApiProperty({ enum: [...ONBOARDING_DOCUMENT_TYPES] }) documentType!: string;
}

export class OnboardingApplicationViewSchema {
  @ApiProperty() id!: string;
  @ApiProperty({ example: 'APP-2026-1A2B3C4D' }) reference!: string;
  @ApiProperty({ enum: [...ONBOARDING_APPLICANT_TYPES] })
  applicantType!: string;
  @ApiProperty({ enum: [...ONBOARDING_APPLICATION_STATUSES] }) status!: string;
  @ApiProperty({ enum: [...ONBOARDING_STAGES] }) stage!: string;
  @ApiProperty({ type: OnboardingOrganizationSchema })
  organization!: OnboardingOrganizationSchema;
  @ApiProperty({ type: OnboardingContactSchema })
  contact!: OnboardingContactSchema;
  @ApiProperty(NULLABLE_STRING) m2mPlanCode!: string | null;
  @ApiProperty({ type: OnboardingRegistrySchema })
  registry!: OnboardingRegistrySchema;
  @ApiProperty({ type: [OnboardingVehicleSchema] })
  vehicles!: OnboardingVehicleSchema[];
  @ApiProperty({ type: [OnboardingDeviceRequestSchema] })
  deviceRequests!: OnboardingDeviceRequestSchema[];
  @ApiProperty() requestedDevices!: number;
  @ApiProperty({ type: OnboardingContactVerificationSchema })
  verification!: OnboardingContactVerificationSchema;
  @ApiProperty({ type: [OnboardingDocumentSchema] })
  documents!: OnboardingDocumentSchema[];
  @ApiProperty({ enum: [...ONBOARDING_DOCUMENT_TYPES], isArray: true })
  missingDocuments!: string[];
  @ApiProperty({ type: [OnboardingVehicleMissingDocumentSchema] })
  vehiclesMissingDocuments!: OnboardingVehicleMissingDocumentSchema[];
  @ApiProperty(NULLABLE_STRING) decisionReason!: string | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  submittedAt!: string | null;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
}

export class CreatedOnboardingApplicationSchema extends OnboardingApplicationViewSchema {
  @ApiProperty({
    description:
      'Returned once. Send it as the x-application-token header on every later call.',
  })
  applicationToken!: string;
}

export class SubmittedOnboardingApplicationSchema extends OnboardingApplicationViewSchema {
  @ApiProperty({ enum: [...AUTOMATED_OUTCOMES] }) automatedDecision!: string;
}

export class OnboardingApplicationResponse extends StandardApiResponse<OnboardingApplicationViewSchema> {
  @ApiProperty({ type: OnboardingApplicationViewSchema })
  data!: OnboardingApplicationViewSchema;
}

export class CreatedOnboardingApplicationResponse extends StandardApiResponse<CreatedOnboardingApplicationSchema> {
  @ApiProperty({ type: CreatedOnboardingApplicationSchema })
  data!: CreatedOnboardingApplicationSchema;
}

export class SubmittedOnboardingApplicationResponse extends StandardApiResponse<SubmittedOnboardingApplicationSchema> {
  @ApiProperty({ type: SubmittedOnboardingApplicationSchema })
  data!: SubmittedOnboardingApplicationSchema;
}

export class OnboardingStatusTimelineStepSchema {
  @ApiProperty({ example: 'application_review' }) key!: string;
  @ApiProperty() label!: string;
  @ApiProperty() complete!: boolean;
  @ApiProperty({ required: false }) inProgress?: boolean;
}

export class OnboardingStatusDocumentSchema {
  @ApiProperty({ enum: [...ONBOARDING_DOCUMENT_TYPES] }) documentType!: string;
  @ApiProperty({ enum: [...ONBOARDING_DOCUMENT_STATUSES] }) status!: string;
  @ApiProperty(NULLABLE_STRING) rejectionReason!: string | null;
}

export class OnboardingApplicationStatusSchema {
  @ApiProperty({ example: 'APP-2026-1A2B3C4D' }) reference!: string;
  @ApiProperty({ enum: [...ONBOARDING_APPLICATION_STATUSES] })
  applicationStatus!: string;
  @ApiProperty({ enum: [...ONBOARDING_STAGES] }) stage!: string;
  @ApiProperty(NULLABLE_STRING) decisionReason!: string | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  submittedAt!: string | null;
  @ApiProperty({ type: [OnboardingStatusTimelineStepSchema] })
  timeline!: OnboardingStatusTimelineStepSchema[];
  @ApiProperty({ type: [OnboardingStatusDocumentSchema] })
  documents!: OnboardingStatusDocumentSchema[];
}

export class OnboardingApplicationStatusResponse extends StandardApiResponse<OnboardingApplicationStatusSchema> {
  @ApiProperty({ type: OnboardingApplicationStatusSchema })
  data!: OnboardingApplicationStatusSchema;
}

export class M2mPlanSchema {
  @ApiProperty() code!: string;
  @ApiProperty() name!: string;
  @ApiProperty() description!: string;
  @ApiProperty() perDeviceYear1Ngn!: number;
  @ApiProperty() perDeviceRenewalNgn!: number;
}

export class M2mPlansDataSchema {
  @ApiProperty({ type: [M2mPlanSchema] }) plans!: M2mPlanSchema[];
}

export class EmailAvailabilitySchema {
  @ApiProperty({ description: 'False when an account or an open application already uses the address.' })
  available!: boolean;
}

export class EmailAvailabilityResponse extends StandardApiResponse<EmailAvailabilitySchema> {
  @ApiProperty({ type: EmailAvailabilitySchema }) data!: EmailAvailabilitySchema;
}

export class M2mPlansResponse extends StandardApiResponse<M2mPlansDataSchema> {
  @ApiProperty({ type: M2mPlansDataSchema }) data!: M2mPlansDataSchema;
}

export class IndemnityAgreementSchema {
  @ApiProperty({ description: 'Send back as template_version when signing.' })
  version!: string;
  @ApiProperty() title!: string;
  @ApiProperty() body!: string;
}

export class IndemnityAgreementResponse extends StandardApiResponse<IndemnityAgreementSchema> {
  @ApiProperty({ type: IndemnityAgreementSchema })
  data!: IndemnityAgreementSchema;
}

export class IndemnitySignatureSchema {
  @ApiProperty({ format: 'date-time' }) signedAt!: string;
  @ApiProperty() templateVersion!: string;
  @ApiProperty() signerName!: string;
  @ApiProperty({ type: OnboardingApplicationViewSchema })
  application!: OnboardingApplicationViewSchema;
}

export class IndemnitySignatureResponse extends StandardApiResponse<IndemnitySignatureSchema> {
  @ApiProperty({ type: IndemnitySignatureSchema })
  data!: IndemnitySignatureSchema;
}

export class VerificationCodeSentSchema {
  @ApiProperty({ enum: [...ONBOARDING_VERIFICATION_CHANNELS] })
  channel!: string;
  @ApiProperty({ example: 'ja**@arne.com' }) destination!: string;
  @ApiProperty({ example: 600 }) expiresInSeconds!: number;
  @ApiProperty({
    example: 60,
    description: 'Seconds before another code can be requested.',
  })
  resendAfterSeconds!: number;
}

export class VerificationCodeSentResponse extends StandardApiResponse<VerificationCodeSentSchema> {
  @ApiProperty({ type: VerificationCodeSentSchema })
  data!: VerificationCodeSentSchema;
}

export class VerificationResendTooSoonSchema {
  @ApiProperty({
    example: 429,
    required: false,
    description: 'Present on the hourly cap and the IP rate limit, absent on the resend cooldown.',
  })
  statusCode?: number;
  @ApiProperty() message!: string;
  @ApiProperty({
    example: 42,
    required: false,
    description: 'Present on the resend cooldown only, absent on the hourly cap.',
  })
  retryAfterSeconds?: number;
}

export class ResumeApplicationResponse extends StandardApiResponse<null> {
  @ApiProperty({ type: Object, nullable: true, example: null }) data!: null;
}

export class OnboardingOrderSchema {
  @ApiProperty() planCode!: string;
  @ApiProperty() planName!: string;
  @ApiProperty() deviceCount!: number;
  @ApiProperty() perDeviceNgn!: number;
  @ApiProperty() devicesNgn!: number;
  @ApiProperty() installationNgn!: number;
  @ApiProperty() totalNgn!: number;
  @ApiProperty() renewalPerDeviceNgn!: number;
}

export class OnboardingPaymentSummarySchema {
  @ApiProperty() reference!: string;
  @ApiProperty({ enum: [...ONBOARDING_PAYMENT_STATUSES] }) status!: string;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  paidAt!: string | null;
}

export class ApplicationOrderSchema {
  @ApiProperty({ type: OnboardingOrderSchema }) order!: OnboardingOrderSchema;
  @ApiProperty({ enum: [...ONBOARDING_STAGES] }) stage!: string;
  @ApiProperty({
    description: 'True at the payment stage while no payment has succeeded.',
  })
  payable!: boolean;
  @ApiProperty(NULLABLE_STRING) billingEmail!: string | null;
  @ApiProperty() billingEmailVerified!: boolean;
  @ApiProperty({ type: OnboardingPaymentSummarySchema, nullable: true })
  payment!: OnboardingPaymentSummarySchema | null;
}

export class ApplicationOrderResponse extends StandardApiResponse<ApplicationOrderSchema> {
  @ApiProperty({ type: ApplicationOrderSchema }) data!: ApplicationOrderSchema;
}

export class BillingEmailSchema {
  @ApiProperty() billingEmail!: string;
  @ApiProperty() billingEmailVerified!: boolean;
}

export class BillingEmailResponse extends StandardApiResponse<BillingEmailSchema> {
  @ApiProperty({ type: BillingEmailSchema }) data!: BillingEmailSchema;
}

export class ApplicationPaymentSchema {
  @ApiProperty({ example: 'FPA-APP-2026-1A2B3C4D-1767225600000' }) reference!: string;
  @ApiProperty({
    ...NULLABLE_STRING,
    description: 'Where to send the applicant to pay. Null when the provider returns no page.',
  })
  authorizationUrl!: string | null;
  @ApiProperty({ example: 'paystack' }) provider!: string;
  @ApiProperty({ type: OnboardingOrderSchema }) order!: OnboardingOrderSchema;
  @ApiPropertyOptional({ description: 'True when the server settled the payment without a hosted checkout.' })
  paid?: boolean;
}

export class ApplicationPaymentResponse extends StandardApiResponse<ApplicationPaymentSchema> {
  @ApiProperty({ type: ApplicationPaymentSchema }) data!: ApplicationPaymentSchema;
}

export class VehicleImportSkippedRowSchema {
  @ApiProperty({ example: 3, description: 'Position among the non-blank lines, the header being line 1.' })
  line!: number;
  @ApiProperty() message!: string;
}

export class VehicleImportSchema {
  @ApiProperty() created!: number;
  @ApiProperty() updated!: number;
  @ApiProperty({ type: [VehicleImportSkippedRowSchema] })
  skipped!: VehicleImportSkippedRowSchema[];
  @ApiProperty({ type: OnboardingApplicationViewSchema })
  application!: OnboardingApplicationViewSchema;
}

export class VehicleImportResponse extends StandardApiResponse<VehicleImportSchema> {
  @ApiProperty({ type: VehicleImportSchema }) data!: VehicleImportSchema;
}

export class VehicleCsvColumnSchema {
  @ApiProperty({ example: 'registration_number' }) header!: string;
  @ApiProperty() required!: boolean;
  @ApiProperty({ example: 'LAG-123-ABC' }) example!: string;
  @ApiProperty({ description: 'Empty string when there is nothing to add.' }) note!: string;
}

export class VehicleCsvColumnsSchema {
  @ApiProperty({ type: [VehicleCsvColumnSchema] }) columns!: VehicleCsvColumnSchema[];
}

export class VehicleCsvColumnsResponse extends StandardApiResponse<VehicleCsvColumnsSchema> {
  @ApiProperty({ type: VehicleCsvColumnsSchema }) data!: VehicleCsvColumnsSchema;
}

export class PickupLocationSchema {
  @ApiProperty() id!: string;
  @ApiProperty({ example: 'Lagos' }) state!: string;
  @ApiProperty({ example: 'Ikeja' }) area!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ type: String, nullable: true }) address!: string | null;
  @ApiProperty({ description: 'A placeholder row until MTN\'s list is loaded' }) isDemo!: boolean;
}

export class PickupLocationsResponse extends StandardApiResponse<PickupLocationSchema[]> {
  @ApiProperty({ type: [PickupLocationSchema] }) data!: PickupLocationSchema[];
}
