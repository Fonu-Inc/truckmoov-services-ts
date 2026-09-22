// Domain errors
export { ApplicationNotEditableError } from "./domain/onboarding-application.support";
export { ApplicationNotFoundError } from "./domain/onboarding-application.support";
export { BusinessEmailInUseError } from "./domain/onboarding-application.support";
export { InvalidDocumentFileError } from "./domain/onboarding-document-file";
export { OnboardingValidationError } from "./domain/onboarding-application.validation";

// Domain ports and types
export { ONBOARDING_APPLICATION_REPOSITORY } from "./domain/onboarding-application.repository";
export {
  ONBOARDING_DECISION_NOTIFIER,
  type OnboardingDecisionNotifier,
} from "./domain/ports/onboarding-decision-notifier.port";
export {
  ONBOARDING_VERIFICATION_NOTIFIER,
  VerificationDispatchError,
  type OnboardingVerificationNotifier,
} from "./domain/ports/onboarding-verification-notifier.port";
export type {
  OnboardingApplicantType,
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
  ONBOARDING_APPLICATION_STATUSES,
  ONBOARDING_DOCUMENT_STATUSES,
  ONBOARDING_DOCUMENT_TYPES,
  ONBOARDING_SETUP_LINK_STATUSES,
  ONBOARDING_VERIFICATION_CHANNELS,
} from "./domain/onboarding-application.repository";

// Application use cases
export { CreateOnboardingApplicationUseCase } from "./application/use-cases/create-onboarding-application.use-case";
export {
  ApplicationDocumentsIncompleteError,
  ApproveOnboardingApplicationUseCase,
  RejectOnboardingApplicationUseCase,
  RequestOnboardingApplicationChangesUseCase,
  ResendOnboardingSetupLinkUseCase,
  SetupLinkNotResendableError,
} from "./application/use-cases/decide-onboarding-application.use-cases";
export { DeleteOnboardingApplicationDocumentUseCase } from "./application/use-cases/delete-onboarding-application-document.use-case";
export { GetOnboardingApplicationUseCase } from "./application/use-cases/get-onboarding-application.use-case";
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
export { OnboardingApplicationRateLimitGuard } from "./infrastructure/http/onboarding-application-rate-limit.guard";
export { MailerOnboardingDecisionNotifier } from "./infrastructure/notifications/mailer-onboarding-decision.notifier";
export { MailerOnboardingVerificationNotifier } from "./infrastructure/notifications/mailer-onboarding-verification.notifier";
export { InMemoryOnboardingApplicationRepository } from "./infrastructure/persistence/in-memory-onboarding-application.repository";
export { MikroOnboardingApplicationRepository } from "./infrastructure/persistence/mikro-onboarding-application.repository";
