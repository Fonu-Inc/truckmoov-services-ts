import { ApiProperty } from '@nestjs/swagger';
import { StandardApiResponse } from '@shared/openapi';
import {
  KYB_VERDICTS,
  KYB_VERIFICATION_CHECKS,
  ONBOARDING_APPLICANT_TYPES,
  ONBOARDING_APPLICATION_STATUSES,
  ONBOARDING_DOCUMENT_STATUSES,
  ONBOARDING_DOCUMENT_TYPES,
  ONBOARDING_SETUP_LINK_STATUSES,
  ONBOARDING_STAGES,
  ONBOARDING_VEHICLE_TYPES,
} from '@auth/onboarding';

const NULLABLE_STRING = { type: String, nullable: true } as const;
const NULLABLE_DATE_TIME = { type: String, format: 'date-time', nullable: true } as const;

export class ReviewSetupLinkSchema {
  @ApiProperty({
    enum: [...ONBOARDING_SETUP_LINK_STATUSES],
    nullable: true,
    description: 'Null before any send. sent means the mail transport accepted it.',
  })
  status!: string | null;
  @ApiProperty(NULLABLE_DATE_TIME) sentAt!: string | null;
  @ApiProperty(NULLABLE_STRING) error!: string | null;
  @ApiProperty() attempts!: number;
}

export class ReviewApplicationSummarySchema {
  @ApiProperty() id!: string;
  @ApiProperty({ example: 'APP-2026-1A2B3C4D' }) reference!: string;
  @ApiProperty({ enum: [...ONBOARDING_APPLICANT_TYPES] }) applicantType!: string;
  @ApiProperty() organizationName!: string;
  @ApiProperty() businessEmail!: string;
  @ApiProperty() organizationPhone!: string;
  @ApiProperty() contactFullName!: string;
  @ApiProperty(NULLABLE_STRING) contactRole!: string | null;
  @ApiProperty({ example: '12 Mazi Fedelis Street, Ikeja, Lagos' }) address!: string;
  @ApiProperty({ enum: [...ONBOARDING_APPLICATION_STATUSES] }) status!: string;
  @ApiProperty({ enum: [...ONBOARDING_STAGES] }) stage!: string;
  @ApiProperty({
    example: 'Awaiting Payment',
    description: 'Display label derived from stage and status.',
  })
  stageStatus!: string;
  @ApiProperty() emailVerified!: boolean;
  @ApiProperty() phoneVerified!: boolean;
  @ApiProperty(NULLABLE_DATE_TIME) submittedAt!: string | null;
  @ApiProperty({ ...NULLABLE_STRING, description: 'User id, or "system" for an automated decision.' })
  reviewedBy!: string | null;
  @ApiProperty(NULLABLE_DATE_TIME) reviewedAt!: string | null;
  @ApiProperty(NULLABLE_STRING) decisionReason!: string | null;
  @ApiProperty({ ...NULLABLE_STRING, description: 'Set once the application is approved.' })
  tenantId!: string | null;
  @ApiProperty({ type: ReviewSetupLinkSchema }) setupLink!: ReviewSetupLinkSchema;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
}

export class ReviewQueueItemSchema extends ReviewApplicationSummarySchema {
  @ApiProperty() documentCount!: number;
  @ApiProperty() vehicleCount!: number;
  @ApiProperty() deviceCount!: number;
}

export class ReviewQueueSchema {
  @ApiProperty({ type: [ReviewQueueItemSchema] }) items!: ReviewQueueItemSchema[];
  @ApiProperty() total!: number;
  @ApiProperty({ example: 1 }) page!: number;
  @ApiProperty({ example: 50 }) limit!: number;
}

export class ReviewQueueResponse extends StandardApiResponse<ReviewQueueSchema> {
  @ApiProperty({ type: ReviewQueueSchema }) data!: ReviewQueueSchema;
}

export class ReviewCountersSchema {
  @ApiProperty() total!: number;
  @ApiProperty({ description: 'Submitted and under review together.' }) pendingReview!: number;
  @ApiProperty() approved!: number;
  @ApiProperty() rejected!: number;
  @ApiProperty() changesRequested!: number;
}

export class ReviewCountersResponse extends StandardApiResponse<ReviewCountersSchema> {
  @ApiProperty({ type: ReviewCountersSchema }) data!: ReviewCountersSchema;
}

export class StageProgressSchema {
  @ApiProperty({ enum: [...ONBOARDING_STAGES] }) stage!: string;
  @ApiProperty() complete!: boolean;
  @ApiProperty() current!: boolean;
}

export class ReviewVehicleSchema {
  @ApiProperty() id!: string;
  @ApiProperty() registrationNumber!: string;
  @ApiProperty({ enum: [...ONBOARDING_VEHICLE_TYPES] }) vehicleType!: string;
  @ApiProperty() make!: string;
  @ApiProperty() model!: string;
}

export class ReviewDeviceRequestSchema {
  @ApiProperty() id!: string;
  @ApiProperty() quantity!: number;
  @ApiProperty() useCase!: string;
}

export class VerificationFieldSchema {
  @ApiProperty() name!: string;
  @ApiProperty(NULLABLE_STRING) expected!: string | null;
  @ApiProperty(NULLABLE_STRING) actual!: string | null;
  @ApiProperty() matched!: boolean;
}

export class ReviewVerificationSchema {
  @ApiProperty({ enum: [...KYB_VERIFICATION_CHECKS] }) check!: string;
  @ApiProperty({ enum: [...KYB_VERDICTS] }) verdict!: string;
  @ApiProperty() summary!: string;
  @ApiProperty({ type: [VerificationFieldSchema] }) fields!: VerificationFieldSchema[];
  @ApiProperty({ example: 'dojah' }) provider!: string;
  @ApiProperty({ format: 'date-time' }) checkedAt!: string;
}

export class ReviewDocumentSchema {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: [...ONBOARDING_DOCUMENT_TYPES] }) documentType!: string;
  @ApiProperty() documentName!: string;
  @ApiProperty() fileSize!: number;
  @ApiProperty({ example: 'application/pdf' }) mimeType!: string;
  @ApiProperty({ enum: [...ONBOARDING_DOCUMENT_STATUSES] }) status!: string;
  @ApiProperty(NULLABLE_STRING) rejectionReason!: string | null;
  @ApiProperty(NULLABLE_STRING) reviewedBy!: string | null;
  @ApiProperty(NULLABLE_DATE_TIME) reviewedAt!: string | null;
  @ApiProperty({ format: 'date-time' }) uploadedAt!: string;
  @ApiProperty({
    ...NULLABLE_STRING,
    description: 'Presigned, valid for 5 minutes. Null when storage could not sign one.',
  })
  downloadUrl!: string | null;
}

export class ReviewPaymentSchema {
  @ApiProperty() paymentId!: string;
  @ApiProperty() reference!: string;
  @ApiProperty({ enum: ['mismatch', 'refunded'] }) status!: string;
  @ApiProperty(NULLABLE_DATE_TIME) refundedAt!: string | null;
  @ApiProperty({ ...NULLABLE_STRING, description: 'Why the provider refused the last refund attempt.' })
  refundError!: string | null;
  @ApiProperty({ description: 'True while the provider has accepted a refund but not finished it.' })
  refundProcessing!: boolean;
  @ApiProperty({ description: 'Amount asked for, in naira.' }) expectedNgn!: number;
  @ApiProperty({ type: Number, nullable: true, description: 'Amount the provider reported, in naira.' })
  paidNgn!: number | null;
  @ApiProperty(NULLABLE_STRING) currency!: string | null;
  @ApiProperty({ enum: ['resolved', 'refund_needed'], nullable: true }) reviewOutcome!: string | null;
  @ApiProperty(NULLABLE_STRING) reviewNote!: string | null;
  @ApiProperty(NULLABLE_STRING) reviewedBy!: string | null;
  @ApiProperty(NULLABLE_DATE_TIME) reviewedAt!: string | null;
}

export class ReviewApplicationSchema extends ReviewApplicationSummarySchema {
  @ApiProperty({ type: [StageProgressSchema] }) progress!: StageProgressSchema[];
  @ApiProperty({
    type: ReviewPaymentSchema,
    nullable: true,
    description: 'The newest wrong-amount onboarding payment, or null. Kept for older clients; read paymentReviews.',
  })
  paymentReview!: ReviewPaymentSchema | null;
  @ApiProperty({
    type: [ReviewPaymentSchema],
    description: 'Every onboarding payment with a wrong-amount mismatch, newest first, then the refunded ones.',
  })
  paymentReviews!: ReviewPaymentSchema[];
  @ApiProperty() vehicleCount!: number;
  @ApiProperty() deviceCount!: number;
  @ApiProperty({ type: [ReviewVehicleSchema] }) vehicles!: ReviewVehicleSchema[];
  @ApiProperty({ type: [ReviewDeviceRequestSchema] })
  deviceRequests!: ReviewDeviceRequestSchema[];
  @ApiProperty({ type: [ReviewVerificationSchema] })
  verifications!: ReviewVerificationSchema[];
  @ApiProperty({ type: [ReviewDocumentSchema] }) documents!: ReviewDocumentSchema[];
}

export class ReviewApplicationResponse extends StandardApiResponse<ReviewApplicationSchema> {
  @ApiProperty({ type: ReviewApplicationSchema }) data!: ReviewApplicationSchema;
}

export class TimelineEntrySchema {
  @ApiProperty({ example: 'onboarding.application.approved' }) action!: string;
  @ApiProperty() summary!: string;
  @ApiProperty({ description: 'Actor name or id, or SYSTEM when nobody acted by hand.' })
  actor!: string;
  @ApiProperty({ format: 'date-time' }) at!: string;
}

export class ApplicationTimelineSchema {
  @ApiProperty() applicationId!: string;
  @ApiProperty() reference!: string;
  @ApiProperty({ type: [TimelineEntrySchema] }) entries!: TimelineEntrySchema[];
}

export class ApplicationTimelineResponse extends StandardApiResponse<ApplicationTimelineSchema> {
  @ApiProperty({ type: ApplicationTimelineSchema }) data!: ApplicationTimelineSchema;
}

export class DocumentDecisionSchema {
  @ApiProperty() documentId!: string;
  @ApiProperty({ enum: ['approved', 'rejected'] }) status!: string;
}

export class DocumentDecisionResponse extends StandardApiResponse<DocumentDecisionSchema> {
  @ApiProperty({ type: DocumentDecisionSchema }) data!: DocumentDecisionSchema;
}

export class ApprovedApplicationSchema {
  @ApiProperty() applicationId!: string;
  @ApiProperty() reference!: string;
  @ApiProperty({ enum: ['approved'] }) status!: string;
  @ApiProperty({ enum: ['provisioning'] }) stage!: string;
  @ApiProperty() tenantId!: string;
  @ApiProperty({ example: 'FLEET_ADMIN' }) bootstrapRole!: string;
}

export class ApprovedApplicationResponse extends StandardApiResponse<ApprovedApplicationSchema> {
  @ApiProperty({ type: ApprovedApplicationSchema }) data!: ApprovedApplicationSchema;
}

export class RejectedApplicationSchema {
  @ApiProperty() applicationId!: string;
  @ApiProperty() reference!: string;
  @ApiProperty({ enum: ['rejected'] }) status!: string;
  @ApiProperty() decisionReason!: string;
}

export class RejectedApplicationResponse extends StandardApiResponse<RejectedApplicationSchema> {
  @ApiProperty({ type: RejectedApplicationSchema }) data!: RejectedApplicationSchema;
}

export class ChangesRequestedSchema {
  @ApiProperty() applicationId!: string;
  @ApiProperty() reference!: string;
  @ApiProperty({ enum: ['changes_requested'] }) status!: string;
  @ApiProperty() decisionReason!: string;
}

export class ChangesRequestedResponse extends StandardApiResponse<ChangesRequestedSchema> {
  @ApiProperty({ type: ChangesRequestedSchema }) data!: ChangesRequestedSchema;
}

export class SetupLinkResentSchema {
  @ApiProperty() applicationId!: string;
  @ApiProperty() setupLinkEmail!: string;
  @ApiProperty({ format: 'date-time' }) setupLinkExpiresAt!: string;
  @ApiProperty() resentBy!: string;
  @ApiProperty({ format: 'date-time' }) resentAt!: string;
  @ApiProperty({ enum: [...ONBOARDING_SETUP_LINK_STATUSES] }) setupLinkStatus!: string;
  @ApiProperty({ ...NULLABLE_STRING, description: 'Why the send failed, null when it was sent.' })
  setupLinkError!: string | null;
}

export class SetupLinkResentResponse extends StandardApiResponse<SetupLinkResentSchema> {
  @ApiProperty({ type: SetupLinkResentSchema }) data!: SetupLinkResentSchema;
}

export class ProvisionedSchema {
  @ApiProperty() applicationId!: string;
  @ApiProperty({ enum: ['payment'] }) stage!: string;
  @ApiProperty() confirmedWithoutStock!: boolean;
  @ApiProperty(NULLABLE_STRING) reason!: string | null;
}

export class ProvisionedResponse extends StandardApiResponse<ProvisionedSchema> {
  @ApiProperty({ type: ProvisionedSchema }) data!: ProvisionedSchema;
}

export class PaymentReviewedSchema {
  @ApiProperty() applicationId!: string;
  @ApiProperty() paymentId!: string;
  @ApiProperty() reference!: string;
  @ApiProperty({ enum: ['resolved', 'refund_needed'] }) outcome!: string;
  @ApiProperty() note!: string;
}

export class PaymentReviewedResponse extends StandardApiResponse<PaymentReviewedSchema> {
  @ApiProperty({ type: PaymentReviewedSchema }) data!: PaymentReviewedSchema;
}

export class PaymentRefundedSchema {
  @ApiProperty() applicationId!: string;
  @ApiProperty() paymentId!: string;
  @ApiProperty() reference!: string;
  @ApiProperty(NULLABLE_STRING) refundReference!: string | null;
  @ApiProperty() note!: string;
  @ApiProperty({ enum: ['refunded', 'processing'] }) refundStatus!: string;
  @ApiProperty() alreadyRefunded!: boolean;
}

export class PaymentRefundedResponse extends StandardApiResponse<PaymentRefundedSchema> {
  @ApiProperty({ type: PaymentRefundedSchema }) data!: PaymentRefundedSchema;
}
