// Domain errors
export { ApplicationNotEditableError } from "./domain/onboarding-application.support";
export { ApplicationNotFoundError } from "./domain/onboarding-application.support";
export { BusinessEmailInUseError } from "./domain/onboarding-application.support";
export { InvalidDocumentFileError } from "./domain/onboarding-document-file";
export { OnboardingValidationError } from "./domain/onboarding-application.validation";

// Domain ports and types
export { ONBOARDING_APPLICATION_REPOSITORY } from "./domain/onboarding-application.repository";
export { DRAFT_LIFETIME_MS } from "./domain/onboarding-application.support";
export {
  KYB_VERIFICATION,
  KYB_VERDICTS,
  KYB_VERIFICATION_CHECKS,
  type KybCheckResult,
  type KybVerification,
} from "./domain/ports/kyb-verification.port";
export {
  DOCUMENT_EXTRACTOR,
  EXTRACTION_FIELDS,
  type DocumentExtraction,
  type DocumentExtractor,
} from "./domain/ports/document-extraction.port";
export {
  ONBOARDING_PAYMENT_REPOSITORY,
  ONBOARDING_PAYMENT_STATUSES,
  type OnboardingPaymentRepository,
  type StoredOnboardingPayment,
} from "./domain/onboarding-payment.repository";
export {
  buildOrderSummary,
  INSTALLATION_FEE_PER_DEVICE_NGN,
  toKobo,
  type OnboardingOrderSummary,
} from "./domain/onboarding-order";
export {
  VERIFICATION_RESULT_REPOSITORY,
  type StoredVerificationResult,
  type VerificationResultRepository,
} from "./domain/verification-result.repository";
export {
  CONTRADICTION_CONFIDENCE_FLOOR,
  findDocumentContradictions,
  type DocumentContradiction,
} from "./domain/document-contradictions";
export {
  AUTOMATED_OUTCOMES,
  decideAutomatically,
  REQUIRED_CHECKS_BY_APPLICANT_TYPE,
  type AutomatedDecision,
  type AutomatedOutcome,
} from "./domain/automated-decision";
export {
  IDENTITY_CLAIM_REPOSITORY,
  IDENTITY_CLAIM_TYPES,
  type IdentityClaimRepository,
  type StoredIdentityClaim,
} from "./domain/identity-claim.repository";
export {
  blocksOtherApplications,
  identityClaimsOf,
} from "./domain/identity-claims";
export {
  INDEMNITY_AGREEMENT_REPOSITORY,
  INDEMNITY_SIGNATURE_METHODS,
  type IndemnityAgreementRepository,
  type StoredIndemnitySignature,
  type StoredIndemnityTemplate,
} from "./domain/indemnity-agreement.repository";
export {
  M2M_LICENSE_PLAN_REPOSITORY,
  type M2mLicensePlanRepository,
  type StoredM2mLicensePlan,
} from "./domain/m2m-license-plan.repository";
export {
  ONBOARDING_ADMIN_NOTIFIER,
  type NewApplicationAlert,
  type OnboardingAdminNotifier,
} from "./domain/ports/onboarding-admin-notifier.port";
export {
  ONBOARDING_STAGES,
  assertStageAdvance,
  canAdvanceTo,
  InvalidStageTransitionError,
  stageProgress,
  stageStatusLabel,
  type OnboardingStage,
} from "./domain/onboarding-stage";
export {
  ONBOARDING_DECISION_NOTIFIER,
  type OnboardingDecisionNotifier,
} from "./domain/ports/onboarding-decision-notifier.port";
export {
  SIGNED_AGREEMENT_RENDERER,
  type SignedAgreement,
  type SignedAgreementRenderer,
} from "./domain/ports/signed-agreement-renderer.port";
export {
  ONBOARDING_VERIFICATION_NOTIFIER,
  VerificationDispatchError,
  type OnboardingVerificationNotifier,
} from "./domain/ports/onboarding-verification-notifier.port";
export type {
  OnboardingApplicantType,
  OnboardingIdentificationType,
  OnboardingVehiclePurchaseType,
  OnboardingVehicleType,
  StoredOnboardingApplicationVehicle,
  StoredOnboardingDeviceRequest,
  OnboardingApplicationQueueFilters,
  OnboardingApplicationRepository,
  OnboardingApplicationStatus,
  OnboardingDocumentStatus,
  OnboardingDocumentType,
  OnboardingSetupLinkStatus,
  OnboardingVerificationChannel,
  StoredOnboardingApplication,
  StoredOnboardingApplicationDocument,
  StoredOnboardingVerificationCode,
} from "./domain/onboarding-application.repository";
export {
  ONBOARDING_APPLICANT_TYPES,
  ONBOARDING_IDENTIFICATION_TYPES,
  ONBOARDING_VEHICLE_PURCHASE_TYPES,
  ONBOARDING_VEHICLE_TYPES,
  PER_VEHICLE_DOCUMENT_TYPES,
  REQUIRED_DOCUMENTS_BY_APPLICANT_TYPE,
  ONBOARDING_APPLICATION_STATUSES,
  ONBOARDING_DOCUMENT_STATUSES,
  ONBOARDING_DOCUMENT_TYPES,
  SYSTEM_GENERATED_DOCUMENT_TYPES,
  UPLOADABLE_DOCUMENT_TYPES,
  ONBOARDING_SETUP_LINK_STATUSES,
  ONBOARDING_VERIFICATION_CHANNELS,
} from "./domain/onboarding-application.repository";

// Domain services
export {
  buildOnboardingVehicleCsvTemplate,
  ONBOARDING_VEHICLE_CSV_COLUMNS,
  parseOnboardingVehicleCsv,
  VehicleCsvColumnsMissingError,
  VehicleCsvEmptyError,
} from "./domain/onboarding-vehicle-csv";

// Application use cases
export { CreateOnboardingApplicationUseCase } from "./application/use-cases/create-onboarding-application.use-case";
export {
  AddApplicationVehicleUseCase,
  DuplicateVehicleError,
  ImportApplicationVehiclesUseCase,
  RemoveApplicationVehicleUseCase,
  UpdateApplicationVehicleUseCase,
  VehicleNotFoundError,
} from "./application/use-cases/manage-application-vehicles.use-cases";
export {
  DeviceRequestNotFoundError,
  RemoveApplicationDeviceRequestUseCase,
  RequestApplicationDevicesUseCase,
} from "./application/use-cases/manage-application-device-requests.use-cases";
export {
  ApplicationDocumentsIncompleteError,
  ApproveOnboardingApplicationUseCase,
  RejectOnboardingApplicationUseCase,
  RequestOnboardingApplicationChangesUseCase,
  ResendOnboardingSetupLinkUseCase,
  SetupLinkNotResendableError,
} from "./application/use-cases/decide-onboarding-application.use-cases";
export { DeleteOnboardingApplicationDocumentUseCase } from "./application/use-cases/delete-onboarding-application-document.use-case";
export { ApplyAutomatedDecisionUseCase } from "./application/use-cases/apply-automated-decision.use-case";
export { DuplicateIdentityError } from "./application/use-cases/support/enforce-identity-claims";
export { VerifyApplicationAutomaticallyUseCase } from "./application/use-cases/verify-application-automatically.use-case";
export { GetM2mLicensePlansUseCase } from "./application/use-cases/get-m2m-license-plans.use-case";
export { GetOnboardingApplicationTimelineUseCase } from "./application/use-cases/get-application-timeline.use-case";
export { CompleteProvisioningUseCase } from "./application/use-cases/complete-provisioning.use-case";
export { SetBillingEmailUseCase } from "./application/use-cases/set-billing-email.use-case";
export {
  ApplicationNotPayableError,
  BillingEmailNotVerifiedError,
  ConfirmApplicationPaymentUseCase,
  CreateApplicationPaymentUseCase,
  GetApplicationOrderUseCase,
  PaymentProviderUnavailableError,
} from "./application/use-cases/pay-for-application.use-cases";
export {
  GetIndemnityTemplateUseCase,
  IndemnityTemplateNotFoundError,
  IndemnityTemplateSupersededError,
  SignIndemnityAgreementUseCase,
} from "./application/use-cases/sign-indemnity-agreement.use-cases";
export { GetOnboardingApplicationUseCase } from "./application/use-cases/get-onboarding-application.use-case";
export { ResumeOnboardingApplicationUseCase } from "./application/use-cases/resume-onboarding-application.use-case";
export {
  ApplicationDocumentNotFoundError,
  ApplicationNotUnderReviewError,
  DecisionReasonRequiredError,
  GetOnboardingApplicationForReviewUseCase,
  GetOnboardingReviewSummaryUseCase,
  ListOnboardingApplicationsUseCase,
  REVIEWABLE_STATUSES,
  ReviewOnboardingApplicationDocumentUseCase,
} from "./application/use-cases/review-onboarding-application.use-cases";
export {
  ApplicationIncompleteError,
  GetOnboardingApplicationStatusUseCase,
  SubmitOnboardingApplicationUseCase,
} from "./application/use-cases/submit-onboarding-application.use-case";
export { UpdateOnboardingApplicationUseCase } from "./application/use-cases/update-onboarding-application.use-case";
export { UploadOnboardingApplicationDocumentUseCase } from "./application/use-cases/upload-onboarding-application-document.use-case";
export {
  ConfirmOnboardingVerificationCodeUseCase,
  InvalidVerificationCodeError,
  SendOnboardingVerificationCodeUseCase,
  VerificationResendTooSoonError,
  VerificationSendLimitError,
} from "./application/use-cases/verify-onboarding-application-contact.use-cases";

// Infrastructure
export { IndemnityTemplateBootstrapService } from "./infrastructure/bootstrap/indemnity-template-bootstrap.service";
export { PdfSignedAgreementRenderer } from "./infrastructure/documents/pdf-signed-agreement.renderer";
export { AbandonedApplicationSweepService } from "./infrastructure/retention/abandoned-application-sweep.service";
export { HttpDocumentExtractor } from "./infrastructure/extraction/http-document.extractor";
export { DojahKybAdapter } from "./infrastructure/kyb/dojah-kyb.adapter";
export { QoreIdKybAdapter } from "./infrastructure/kyb/qoreid-kyb.adapter";
export { RoutedKybVerification } from "./infrastructure/kyb/routed-kyb-verification";
export { InMemoryVerificationResultRepository } from "./infrastructure/persistence/in-memory-verification-result.repository";
export { MikroVerificationResultRepository } from "./infrastructure/persistence/mikro-verification-result.repository";
export {
  M2M_LICENSE_PLAN_SEEDS,
  M2mLicensePlansBootstrapService,
} from "./infrastructure/bootstrap/m2m-license-plans-bootstrap.service";
export { OnboardingApplicationRateLimitGuard } from "./infrastructure/http/onboarding-application-rate-limit.guard";
export { MailerOnboardingAdminNotifier } from "./infrastructure/notifications/mailer-onboarding-admin.notifier";
export { MailerOnboardingDecisionNotifier } from "./infrastructure/notifications/mailer-onboarding-decision.notifier";
export { MailerOnboardingVerificationNotifier } from "./infrastructure/notifications/mailer-onboarding-verification.notifier";
export { InMemoryIdentityClaimRepository } from "./infrastructure/persistence/in-memory-identity-claim.repository";
export { InMemoryOnboardingPaymentRepository } from "./infrastructure/persistence/in-memory-onboarding-payment.repository";
export { MikroOnboardingPaymentRepository } from "./infrastructure/persistence/mikro-onboarding-payment.repository";
export { InMemoryIndemnityAgreementRepository } from "./infrastructure/persistence/in-memory-indemnity-agreement.repository";
export { MikroIdentityClaimRepository } from "./infrastructure/persistence/mikro-identity-claim.repository";
export { InMemoryM2mLicensePlanRepository } from "./infrastructure/persistence/in-memory-m2m-license-plan.repository";
export { MikroIndemnityAgreementRepository } from "./infrastructure/persistence/mikro-indemnity-agreement.repository";
export { InMemoryOnboardingApplicationRepository } from "./infrastructure/persistence/in-memory-onboarding-application.repository";
export { MikroM2mLicensePlanRepository } from "./infrastructure/persistence/mikro-m2m-license-plan.repository";
export { MikroOnboardingApplicationRepository } from "./infrastructure/persistence/mikro-onboarding-application.repository";
