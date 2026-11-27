import { type MiddlewareConsumer, type NestModule, Module } from '@nestjs/common';
import { APP_FILTER, HttpAdapterHost } from '@nestjs/core';
import { SentryExceptionFilter } from '@shared/observability';
import { CryptoModule } from "@shared/crypto";
import { ConfigModule, AppConfigService } from '@shared/config';
import { LoginRateLimitGuard } from './login-rate-limit.guard';
import { IdempotencyGuard, REDIS_CLIENT, RedisClientProvider } from '@shared/rbac';
import { CheckEmailAvailabilityUseCase } from './contexts/onboarding/email-availability/check-email-availability.use-case';
import {
  ListPickupLocationsUseCase,
  SetApplicationFulfilmentUseCase,
} from './contexts/onboarding/application/use-cases/application-fulfilment.use-cases';
import { PICKUP_LOCATION_REPOSITORY, type PickupLocationRepository } from './contexts/onboarding/domain/pickup-location.repository';
import { InMemoryPickupLocationRepository } from './contexts/onboarding/infrastructure/persistence/in-memory-pickup-location.repository';
import { MikroPickupLocationRepository } from './contexts/onboarding/infrastructure/persistence/mikro-pickup-location.repository';
import { ContactController, SubmitContactEnquiryUseCase } from './contact-enquiry';
import { EMAIL_BITSET, InMemoryEmailBitset } from './contexts/onboarding/email-availability/email-bitset';
import { EmailBloomService } from './contexts/onboarding/email-availability/email-bloom.service';
import { RedisEmailBitset, type BitRedis } from './contexts/onboarding/email-availability/redis-email-bitset';
import { MikroTakenEmailSource, TAKEN_EMAIL_SOURCE } from './contexts/onboarding/email-availability/taken-email-source';
import { EventBusModule } from '@shared/eventbus';
import { MetricsModule } from '@shared/metrics';
import { ReadinessController } from './readiness.controller';
import { LoggerModule } from '@shared/logger';
import { MailerModule } from '@shared/mailer';
import { ObjectStorageModule } from '@shared/object-storage';
import {
  ChangeRoleUseCase,
  ChangeSystemPasswordUseCase,
  AUTH_HEALTH_CHECK,
  AUTH_NOTIFIER,
  CreateSystemAdminUseCase,
  GetDispatcherPreferencesUseCase,
  GetHealthUseCase,
  GetNotificationPreferencesUseCase,
  GetOrganizationSettingsUseCase,
  GetProfileUseCase,
  ListSystemAdminsUseCase,
  ListOrganizationUsersUseCase,
  DbIdentityProvider,
  UserTokenService,
  ForgotPasswordUseCase,
  ResendVerificationUseCase,
  GetMeUseCase,
  ID_GENERATOR,
  IDENTITY_PROVIDER,
  InMemoryInviteRepository,
  InMemoryPasswordResetStore,
  InMemorySessionStore,
  InMemoryUserRepository,
  INVITE_REPOSITORY,
  InviteUserUseCase,
  LoginUseCase,
  LogoutUseCase,
  InMemoryOrganizationSettingsRepository,
  MikroInviteRepository,
  MikroOrganizationSettingsRepository,
  MikroPasswordResetStore,
  MikroSessionStore,
  MikroUserRepository,
  ORGANIZATION_SETTINGS_REPOSITORY,
  PASSWORD_RESET_STORE,
  PASSWORD_HASHER,
  RefreshUseCase,
  RegisterInvitedUseCase,
  RemoveOrganizationUserUseCase,
  ResendPendingInviteUseCase,
  ResetPasswordUseCase,
  SESSION_STORE,
  ScryptPasswordHasher,
  TOKEN_SERVICE,
  UuidIdGenerator,
  USER_REPOSITORY,
  ValidateInviteUseCase,
  VerifyResetUseCase,
  UpdateDispatcherPreferencesUseCase,
  UpdateNotificationPreferencesUseCase,
  UpdateOrganizationUserStatusUseCase,
  UpdateSystemAdminStatusUseCase,
  DeleteSystemAdminUseCase,
  UpdateOrganizationUserUseCase,
  UpdateOrganizationSettingsUseCase,
  UpdateProfileUseCase,
  VerifyEmailUseCase,
  CompleteProfileUseCase,
  MailerAuthNotifier,
  AuthPersistenceHealthCheck,
} from './contexts/auth/session';
import { AuthController } from './auth.controller';
import { AppVersionController } from './app-version.controller';
import { ProfileController } from './profile.controller';
import { OrganizationController } from './organization.controller';
import { SystemController } from './system.controller';
import { SystemReferenceDataController } from './system-reference-data.controller';
import { SystemTenantsController } from './system-tenants.controller';
import { SystemTelecomMasterController } from './system-telecom-master.controller';
import { SystemDevicesController } from './system-devices.controller';
import { SystemSimsController } from './system-sims.controller';
import { SystemSupportController } from './system-support.controller';
import { SupportTicketsController } from './support-tickets.controller';
import { SystemBillingController } from './system-billing.controller';
import { SystemBillingPricingController } from './system-billing-pricing.controller';
import { SystemBillingQuotationsController } from './system-billing-quotations.controller';
import { InvoiceSeriesQuotationNumbers } from './quotation-number.allocator';
import { InvoiceSeriesInvoiceNumbers } from './invoice-number.allocator';
import { SystemBillingInvoicesController } from './system-billing-invoices.controller';
import { SystemBillingEnforcementController } from './system-billing-enforcement.controller';
import { TenantBillingController } from './tenant-billing.controller';
import { StorageUsageController } from './storage-usage.controller';
import {
  GetTenantPaymentUseCase,
  GetTenantQuotationUseCase,
  ListTenantPaymentsUseCase,
  ListTenantQuotationsUseCase,
} from '@auth/onboarding/application/use-cases/billing/tenant-document-queries.use-cases';
import {
  GetTenantBillingOverviewUseCase,
  ListTenantBillingActivityUseCase,
} from '@auth/onboarding/application/use-cases/billing/tenant-billing-overview.use-cases';
import { RenewalSweepService } from './renewal-sweep.service';
import { BundleExpirySweepService } from './bundle-expiry-sweep.service';
import { RenewalAudit } from './renewal-audit';
import { RenewalInvoiceService } from '@auth/onboarding/application/services/renewal-invoice.service';
import { ApplicationDeviceAllocationService } from '@auth/onboarding/application/services/application-device-allocation.service';
import { ApplicationDeviceAllocationLedger } from '@auth/onboarding/application/services/application-device-allocation.ledger';
import { DeviceAllocationSweepService } from '@auth/onboarding/infrastructure/sweeps/device-allocation-sweep.service';
import { SettleRenewalPaymentUseCase } from '@auth/onboarding/application/settle-renewal-payment.use-case';
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
  LICENCE_PERIOD_REPOSITORY,
  RENEWAL_FACTS_READER,
} from '@auth/onboarding/domain/licence-period.repository';
import { InMemoryLicencePeriodRepository, InMemoryRenewalFactsReader } from '@auth/onboarding/infrastructure/persistence/in-memory-licence-period.repository';
import { MikroLicencePeriodRepository } from '@auth/onboarding/infrastructure/persistence/mikro-licence-period.repository';
import { MikroRenewalFactsReader } from '@auth/onboarding/infrastructure/persistence/mikro-renewal-facts.reader';
import { SuspensionsController } from './suspensions.controller';
import { TenantSuspensionService } from './tenant-suspension.service';
import { EnforcementPlanService } from './enforcement-plan.service';
import { EnforcementAudit } from './enforcement-audit';
import { EnforcementNoticeService } from './enforcement-notice.service';
import { EnforcementRestoreService } from './enforcement-restore.service';
import { EnforcementSweepService } from './enforcement-sweep.service';
import { ARREARS_REPOSITORY, MikroArrearsRepository } from './arrears.repository';
import {
  ENFORCEMENT_NOTICE_REPOSITORY,
  MikroEnforcementNoticeRepository,
} from './enforcement-notice.repository';
import {
  ENFORCEMENT_RUN_REPOSITORY,
  MikroEnforcementRunRepository,
} from './enforcement-run.repository';
import {
  InMemoryArrearsRepository,
  InMemoryEnforcementNoticeRepository,
  InMemoryEnforcementRunRepository,
} from './in-memory-enforcement-automation.repositories';
import { ENFORCEMENT_NOTIFIER } from './contexts/onboarding/domain/ports/enforcement-notifier.port';
import { MailerEnforcementNotifier } from './contexts/onboarding/infrastructure/notifications/mailer-enforcement.notifier';
import { TrialDaysResolver } from './trial-days.resolver';
import { ENFORCEMENT_SETTINGS_REPOSITORY } from './enforcement-settings.repository';
import { MikroEnforcementSettingsRepository } from './mikro-enforcement-settings.repository';
import {
  ENFORCEMENT_QUERIES_REPOSITORY,
  MikroEnforcementQueriesRepository,
} from './enforcement-queries.repository';
import {
  InMemoryEnforcementQueriesRepository,
  InMemoryEnforcementSettingsRepository,
} from './in-memory-enforcement.repositories';
import { GetEnforcementSettingsUseCase } from '@auth/onboarding/application/use-cases/billing/get-enforcement-settings.use-case';
import { UpdateEnforcementSettingsUseCase } from '@auth/onboarding/application/use-cases/billing/update-enforcement-settings.use-case';
import { ListEnforcementUseCase } from '@auth/onboarding/application/use-cases/billing/list-enforcement.use-case';
import { PreviewEnforcementUseCase } from '@auth/onboarding/application/use-cases/billing/preview-enforcement.use-case';
import { ActivityLogBillingAudit, BillingActorResolver } from './billing-actor';
import { SystemKycController } from './system-kyc.controller';
import {
  ApproveKycDocumentUseCase,
  ListKycReviewQueueUseCase,
  RejectKycDocumentUseCase,
} from './review-kyc-document.use-cases';
import { OnboardingController } from './onboarding.controller';
import { TenantSimsController } from './tenant-sims.controller';
import { DataBundlesController } from './data-bundles.controller';
import { CommunicationsWalletController } from './communications-wallet.controller';
import { GetCommunicationsRatesUseCase } from './get-communications-rates.use-case';
import {
  GetCommunicationsSpendBreakdownUseCase,
  GetCommunicationsSpendTrendUseCase,
} from './get-communications-spend-analytics.use-case';
import { ActivityLogListener } from './activity-log.listener';
import { ComplianceReminderListener } from './compliance-reminder.listener';
import { ACTIVITY_LOG_REPOSITORY } from './activity-log.repository';
import {
  INSTALLATION_ORDER_REPOSITORY,
  INSTALLER_REPOSITORY,
  InMemoryInstallationOrderRepository,
  InMemoryInstallerRepository,
  InstallerAccountsAdapter,
  InstallerAssignmentService,
  InstallerDeviceScopeUseCase,
  InstallerJobsUseCases,
  InstallerLoginUseCase,
  InstallerProfileUseCases,
  InstallerJobActionsUseCases,
  RejectJobOfferUseCase,
  InstallerJobRecordsUseCases,
  InstallationSweepScheduler,
  INSTALLATION_FLEET,
  INSTALLATION_COMPLETION,
  InMemoryInstallationCompletion,
  MikroInstallationCompletion,
  INSTALLATION_EVIDENCE_STORAGE,
  FleetInstallationAdapter,
  ObjectStorageInstallationEvidence,
  INSTALLATION_JOB_READER,
  INSTALLER_PHOTO_STORAGE,
  InMemoryInstallationJobReader,
  IssueSetupLinkUseCase,
  JOB_DEVICE_LOOKUP,
  FleetJobDeviceLookup,
  ManageInstallationOrdersUseCases,
  ManageInstallersUseCases,
  MikroInstallationJobReader,
  ObjectStorageInstallerPhotos,
  SweepInstallationOrdersUseCase,
  MikroInstallationOrderRepository,
  MikroInstallerRepository,
  ConfirmInstallationUseCase,
  CancelInstallationUseCase,
  CONNECTIVITY_VERIFICATION,
  FleetConnectivityVerification,
  GetInstallationStatusUseCase,
  SubmitInstallationFeedbackUseCase,
  ScheduleInstallationUseCase,
  AdminJobChangesUseCases,
  InstallerSupportUseCases,
  InstallerTicketContextService,
  ReportJobIssueUseCase,
  JOB_ISSUE_RECORDER,
  InMemoryJobIssueRecorder,
  MikroJobIssueRecorder,
  INSTALLER_TICKET_FILES,
  ObjectStorageInstallerTicketFiles,
  INSTALLER_NOTIFICATION_REPOSITORY,
  InMemoryInstallerNotificationRepository,
  MikroInstallerNotificationRepository,
  InstallerNotifier,
  InstallerNotificationsUseCases,
  NotifyDeviceVerificationUseCase,
  DeviceVerificationListener,
  ChangeInstallerPasswordUseCase,
  InstallerPreferencesUseCases,
} from '@auth/installation';
import { InstallationController } from './installation.controller';
import { InstallerSupportController } from './installer-support.controller';
import { InstallerAuthController } from './installer-auth.controller';
import { SystemInstallersController } from './system-installers.controller';
import { InstallerPortalController } from './installer-portal.controller';
import { InstallerJobWorkController } from './installer-job-work.controller';
import { InstallerDeviceRequestsController } from './installer-device-requests.controller';
import { InstallerNotificationsController } from './installer-notifications.controller';
import { InstallerSettingsController } from './installer-settings.controller';
import { InternalInstallersController } from './internal-installers.controller';
import { InternalNotificationRecipientsController } from './internal-notification-recipients.controller';
import { InternalTenantContactController } from './internal-tenant-contact.controller';
import { InternalOnboardingGateController } from './internal-onboarding-gate.controller';
import { OnboardingGate, OnboardingSettledGuard } from './onboarding-gate';
import { InternalOtpController } from './contexts/otp/internal-otp.controller';
import { DotgoTransactionalSmsProvider } from './contexts/otp/dotgo-transactional-sms.provider';
import { UnifiedSmsService } from './contexts/otp/unified-sms.service';
import { SystemInstallationOrdersController } from './system-installation-orders.controller';
import { INSTALLER_ACCOUNTS } from './contexts/auth/session';
import { ActivityLogService } from './activity-log.service';
import { SystemAiController } from './system-ai.controller';
import { SystemAuditController } from './system-audit.controller';
import {
  GetMySupportSummaryUseCase,
  GetSupportOptionsUseCase,
} from './my-support.use-cases';
import {
  ExportMySupportTicketsUseCase,
  PreviewTicketContextUseCase,
} from './my-support-export.use-cases';
import { TerminateSystemTenantUseCase } from './terminate-system-tenant.use-case';
import { TENANT_ASSET_STORE, defaultTenantAssetStore } from './tenant-asset-store';
import {
  GetTenantAuditLogUseCase,
  GetTenantDocumentsUseCase,
  GetTenantResourceUseCase,
} from './system-tenant-detail.use-cases';
import { TENANT_SUSPENSION_REPOSITORY } from './tenant-suspension.repository';
import {
  InMemoryTenantSuspensionRepository,
  MikroTenantSuspensionRepository,
} from './mikro-tenant-suspension.repository';
import { TENANT_TERMINATION_REPOSITORY } from './tenant-termination.repository';
import {
  InMemoryTenantTerminationRepository,
  MikroTenantTerminationRepository,
} from './mikro-tenant-termination.repository';
import { RequestContextMiddleware } from './request-context.middleware';
import { TENANT_NAME_READER } from './tenant-name-reader.port';
import { MikroTenantNameReader, NoopTenantNameReader } from './mikro-tenant-name-reader';
import {
  GetAuditFilterOptionsUseCase,
  ListAuditLogUseCase,
  VerifyAuditChainsUseCase,
} from './audit-log.use-cases';
import { TwoFactorController } from './two-factor.controller';
import { TWO_FACTOR_REPOSITORY } from './two-factor.repository';
import {
  InMemoryTwoFactorRepository,
  MikroTwoFactorRepository,
} from './mikro-two-factor.repository';
import {
  BeginTwoFactorEnrolmentUseCase,
  ConfirmTwoFactorEnrolmentUseCase,
  DisableTwoFactorUseCase,
  GetTwoFactorStatusUseCase,
} from './two-factor.use-cases';
import { SystemSessionPolicyAdapter } from './system-session-policy.adapter';
import { SESSION_POLICY_READER } from './contexts/auth/session/domain/ports/session-policy.port';
import { AiGatewayService } from './ai-gateway.service';
import { AI_GOVERNANCE_REPOSITORY } from './ai-governance.repository';
import { AI_REQUEST_LOG_REPOSITORY } from './ai-request-log.repository';
import {
  InMemoryAiGovernanceRepository,
  MikroAiGovernanceRepository,
} from './mikro-ai-governance.repository';
import { MikroAiRequestLogRepository } from './mikro-ai-request-log.repository';
import { InMemoryAiRequestLogRepository } from './in-memory-ai-request-log.repository';
import {
  GetAiGovernanceUseCase,
  GetAiUsageUseCase,
  ListAiRequestsUseCase,
  UpdateAiGovernanceUseCase,
} from './ai-governance.use-cases';
import { CreateSystemTenantUseCase } from './create-system-tenant.use-case';
import { CreateSystemDeviceModelUseCase } from './create-system-device-model.use-case';
import { DeleteSystemTenantUseCase } from './delete-system-tenant.use-case';
import { DeleteSystemDeviceModelUseCase } from './delete-system-device-model.use-case';
import { DEVICE_MODEL_CATALOG_REPOSITORY } from './device-model-catalog.repository';
import { SUBSCRIPTION_PLAN_REPOSITORY } from './subscription-plan.repository';
import { InMemorySubscriptionPlanRepository } from './in-memory-subscription-plan.repository';
import { MikroSubscriptionPlanRepository } from './mikro-subscription-plan.repository';
import { SubscriptionPlansBootstrapService } from './subscription-plans-bootstrap.service';
import { CheckTenantSeatLimitUseCase } from './check-tenant-seat-limit.use-case';
import { SIM_REPOSITORY } from './sim.repository';
import { AUTH_EVENT_REPOSITORY } from './auth-event.repository';
import { InMemoryAuthEventRepository } from './in-memory-auth-event.repository';
import { MikroAuthEventRepository } from './mikro-auth-event.repository';
import { BLOCKED_IP_REPOSITORY } from './blocked-ip.repository';
import { InMemoryBlockedIpRepository } from './in-memory-blocked-ip.repository';
import { MikroBlockedIpRepository } from './mikro-blocked-ip.repository';
import { AUTO_BLOCK_RULE_REPOSITORY } from './auto-block-rule.repository';
import { InMemoryAutoBlockRuleRepository } from './in-memory-auto-block-rule.repository';
import { MikroAutoBlockRuleRepository } from './mikro-auto-block-rule.repository';
import { SECURITY_EVENT_REPOSITORY } from './security-event.repository';
import { InMemorySecurityEventRepository } from './in-memory-security-event.repository';
import { MikroSecurityEventRepository } from './mikro-security-event.repository';
import { RecordAuthEventUseCase } from './record-auth-event.use-case';
import { IpBlockGuard } from './ip-block.guard';
import { ListSystemAuthEventsUseCase, ListSystemFailedLoginsUseCase } from './list-system-auth-events.use-case';
import { ListAutoBlockRulesUseCase, UpdateAutoBlockRuleUseCase } from './auto-block-rule.use-cases';
import { ListSecurityEventsUseCase } from './list-security-events.use-case';
import { GetSecurityOverviewUseCase } from './get-security-overview.use-case';
import { SystemSecurityController } from './system-security.controller';
import { SUPPORT_TICKET_REPOSITORY } from './support-ticket.repository';
import { SUPPORT_MESSAGE_REPOSITORY } from './support-message.repository';
import { SUPPORT_TICKET_ATTACHMENT_REPOSITORY } from './support-ticket-attachment.repository';
import { TICKET_FILE_SCANNER, UnscannedTicketFileScanner } from './ticket-file-scanner.port';
import { SupportTicketNotifierService } from './support-ticket-notifier.service';
import { SUPPORT_TICKET_CSAT_REPOSITORY } from './support-ticket-csat.repository';
import { InMemorySupportTicketCsatRepository } from './in-memory-support-ticket-csat.repository';
import { MikroSupportTicketCsatRepository } from './mikro-support-ticket-csat.repository';
import { MyTicketCsatUseCases } from './my-support-ticket-csat.use-cases';
import { GetMyTicketAttachmentLinkUseCase } from './get-my-ticket-attachment-link.use-case';
import { TicketAttachmentUploaderService } from './ticket-attachment-uploader.service';
import { CreateSupportTicketUseCase } from './create-support-ticket.use-case';
import { ListMySupportTicketsUseCase } from './list-my-support-tickets.use-case';
import { GetMySupportTicketUseCase } from './get-my-support-ticket.use-case';
import { AddMyTicketAttachmentUseCase } from './add-my-ticket-attachment.use-case';
import {
  CloseMySupportTicketUseCase,
  ReopenMySupportTicketUseCase,
  ReplyToMySupportTicketUseCase,
} from './support-ticket-lifecycle.use-cases';
import { SIM_PROVISIONING_REQUEST_REPOSITORY } from './sim-provisioning-request.repository';
import { SIM_ACTIVATION_BATCH_REPOSITORY } from './sim-activation-batch.repository';
import { ExportSystemDeviceInventoryUseCase } from './export-system-device-inventory.use-case';
import { ExportSystemTenantsUseCase } from './export-system-tenants.use-case';
import { GetActivityLogUseCase } from './get-activity-log.use-case';
import { GetTenantStatusUseCase } from './get-tenant-status.use-case';
import {
  PAYMENT_GATEWAY,
  PAYMENT_GATEWAYS,
  PaymentGatewayRegistry,
  PaystackGateway,
} from './contexts/payments';
import { MailCredentialsController } from './mail-credentials.controller';
import { TelephonyController } from './telephony.controller';
import { GetClickToCallCredentialsUseCase } from './get-click-to-call-credentials.use-case';
import { MailboxController } from './mailbox.controller';
import { AdminMailboxController, AdminMailCredentialsController } from './admin-mailbox.controllers';
import { PlatformAlertsController } from './platform-alerts.controller';
import { AdminNotificationsController, InternalAdminNotificationsController } from './admin-notifications.controller';
import { AdminNotificationsUseCases, SendTestAlertUseCase } from './admin-notifications.use-cases';
import { ADMIN_NOTIFICATION_REPOSITORY, type AdminNotificationRepository } from './admin-notification.repository';
import { InMemoryAdminNotificationRepository } from './in-memory-admin-notification.repository';
import { MikroAdminNotificationRepository } from './mikro-admin-notification.repository';
import { CommunicationRatesController } from './communication-rates.controller';
import { InternalDeviceCatalogController } from './internal-device-catalog.controller';
import { InternalBundleCatalogController } from './internal-bundle-catalog.controller';
import { PlatformWalletsController } from './platform-wallets.controller';
import { PlatformIntegrationCredentialsController } from './platform-integration-credentials.controller';
import { LowBalanceNotifierService } from './low-balance-notifier.service';
import {
  ListCrossTenantLedgerUseCase,
  ListTenantWalletsUseCase,
  PlatformTopUpWalletUseCase,
  UpdateWalletCreditSettingsUseCase,
} from './platform-wallet.use-cases';
import { InternalUsageController } from './internal-usage.controller';
import { CommunicationRateService } from './communication-rate.service';
import { ChargeUsageUseCase } from './charge-usage.use-case';
import { EntitlementService } from './entitlement.service';
import { StorageQuotaService } from './storage-quota.service';
import { OrganisationUpgradesController } from './organisation-upgrades.controller';
import {
  RequestOrganisationUpgradeUseCase,
  ReviewOrganisationUpgradeUseCase,
} from './organisation-upgrade.use-cases';
import {
  ORGANISATION_UPGRADE_REPOSITORY,
  type OrganisationUpgradeRepository,
} from './organisation-upgrade.repository';
import { InMemoryOrganisationUpgradeRepository } from './in-memory-organisation-upgrade.repository';
import { MikroOrganisationUpgradeRepository } from './mikro-organisation-upgrade.repository';
import { FleetFactsService } from './fleet-facts.service';
import { TENANT_FIELD_ACTIVITY_READER } from './contexts/onboarding/domain/tenant-field-activity.reader';
import { InMemoryTenantFieldActivityReader } from './contexts/onboarding/infrastructure/persistence/in-memory-tenant-field-activity.reader';
import { MikroTenantFieldActivityReader } from './contexts/onboarding/infrastructure/persistence/mikro-tenant-field-activity.reader';
import { PlatformAlertPublisher } from './platform-alert.publisher';
import { TenantNotificationPublisher } from './tenant-notification.publisher';
import { StorageReconciliationService } from './storage-reconciliation.service';
import {
  STORAGE_USAGE_REPOSITORY,
  type StorageUsageRepository,
} from './storage-usage.repository';
import { InMemoryStorageUsageRepository } from './in-memory-storage-usage.repository';
import { MikroStorageUsageRepository } from './mikro-storage-usage.repository';
import { PlanEntitlementsBootstrapService } from './plan-entitlements-bootstrap.service';
import {
  PLAN_ENTITLEMENTS_REPOSITORY,
  type PlanEntitlementsRepository,
} from './plan-entitlements.repository';
import { InMemoryPlanEntitlementsRepository } from './in-memory-plan-entitlements.repository';
import { MikroPlanEntitlementsRepository } from './mikro-plan-entitlements.repository';
import { UpdatePlanEntitlementsUseCase } from './update-plan-entitlements.use-case';
import { SimRecurringChargeService } from './sim-recurring-charge.service';
import {
  COMMUNICATION_RATES_REPOSITORY,
  type CommunicationRatesRepository,
} from './communication-rates.repository';
import { InMemoryCommunicationRatesRepository } from './in-memory-communication-rates.repository';
import { MikroCommunicationRatesRepository } from './mikro-communication-rates.repository';
import { PlatformAlertSettingsUseCase } from './platform-alert-settings.use-case';
import {
  PLATFORM_ALERT_SETTINGS_REPOSITORY,
  type PlatformAlertSettingsRepository,
} from './platform-alert-settings.repository';
import { InMemoryPlatformAlertSettingsRepository } from './in-memory-platform-alert-settings.repository';
import { MikroPlatformAlertSettingsRepository } from './mikro-platform-alert-settings.repository';
import {
  PLATFORM_INTEGRATION_CREDENTIALS_REPOSITORY,
  type PlatformIntegrationCredentialsRepository,
} from './platform-integration-credentials.repository';
import { InMemoryPlatformIntegrationCredentialsRepository } from './in-memory-platform-integration-credentials.repository';
import { MikroPlatformIntegrationCredentialsRepository } from './mikro-platform-integration-credentials.repository';
import { UpdatePlatformIntegrationCredentialsUseCase } from './update-platform-integration-credentials.use-case';
import { AiRouterService } from './ai-routing/ai-router.service';
import { ImapMailboxReader } from './contexts/mailbox/imap-mailbox.reader';
import { MAILBOX_READER } from './contexts/mailbox/mailbox-reader.port';
import { MAILBOX_FLAGS_WRITER } from './contexts/mailbox/mailbox-flags-writer.port';
import { UpdateMessageFlagsUseCase } from './contexts/mailbox/update-message-flags.use-case';
import { MAILBOX_SENDER } from './contexts/mailbox/mailbox-sender.port';
import { SmtpImapMailSender } from './contexts/mailbox/smtp-imap.mail-sender';
import {
  MAILBOX_REPOSITORY,
  type MailboxRepository,
} from './contexts/mailbox/mailbox.repository';
import { InMemoryMailboxRepository } from './contexts/mailbox/in-memory-mailbox.repository';
import { MikroMailboxRepository } from './contexts/mailbox/mikro-mailbox.repository';
import { SyncMailboxUseCase } from './contexts/mailbox/sync-mailbox.use-case';
import { SendMailUseCase } from './contexts/mailbox/send-mail.use-case';
import { ListMailboxUseCase } from './contexts/mailbox/list-mailbox.use-case';
import { DownloadAttachmentUseCase } from './contexts/mailbox/download-attachment.use-case';
import { MailboxSyncScheduler } from './contexts/mailbox/mailbox-sync.scheduler';
import { MailboxIdleSupervisor } from './contexts/mailbox/mailbox-idle.supervisor';
import { ImapMailboxWatcher } from './contexts/mailbox/imap-mailbox.watcher';
import { MAILBOX_WATCHER } from './contexts/mailbox/mailbox-watcher.port';
import {
  MAIL_CREDENTIALS_REPOSITORY,
  type MailCredentialsRepository,
} from './mail-credentials.repository';
import { InMemoryMailCredentialsRepository } from './in-memory-mail-credentials.repository';
import { MikroMailCredentialsRepository } from './mikro-mail-credentials.repository';
import { SaveMailCredentialsUseCase } from './save-mail-credentials.use-case';
import { GetMailCredentialsUseCase } from './get-mail-credentials.use-case';
import { DeleteMailCredentialsUseCase } from './delete-mail-credentials.use-case';
import { GetSystemDeviceCatalogReferenceDataUseCase } from './get-system-device-catalog-reference-data.use-case';
import { GetSystemDeviceSummaryUseCase } from './get-system-device-summary.use-case';
import { GetSystemDashboardUseCase } from './get-system-dashboard.use-case';
import { GetSystemSubscriptionPlansUseCase } from './get-system-subscription-plans.use-case';
import { UpdateSubscriptionPlanPriceUseCase } from './update-subscription-plan-price.use-case';
import { GetSystemActivityLogUseCase } from './get-system-activity-log.use-case';
import { GetSystemTenantsSummaryUseCase } from './get-system-tenants-summary.use-case';
import { GetSystemRevenueByMonthUseCase } from './get-system-revenue-by-month.use-case';
import { GetSystemDeviceManufacturersUseCase } from './get-system-device-manufacturers.use-case';
import { GetSystemDeviceMessageRateUseCase } from './get-system-device-message-rate.use-case';
import { GetSystemTenantGrowthUseCase } from './get-system-tenant-growth.use-case';
import { GetSystemSimDataUsageUseCase } from './get-system-sim-data-usage.use-case';
import { SimUsageSnapshotService } from './sim-usage-snapshot.service';
import { SIM_USAGE_REPOSITORY } from './sim-usage.repository';
import { InMemorySimUsageRepository } from './in-memory-sim-usage.repository';
import { MikroSimUsageRepository } from './mikro-sim-usage.repository';
import { TENANT_GROWTH_REPOSITORY } from './tenant-growth.repository';
import { TENANT_QUOTA_OVERRIDES_REPOSITORY } from './tenant-quota-overrides.repository';
import { InMemoryTenantQuotaOverridesRepository } from './in-memory-tenant-quota-overrides.repository';
import { MikroTenantQuotaOverridesRepository } from './mikro-tenant-quota-overrides.repository';
import { UpdateTenantQuotasUseCase } from './update-tenant-quotas.use-case';
import { TENANT_TRIAL_REPOSITORY } from './tenant-trial.repository';
import { InMemoryTenantTrialRepository } from './in-memory-tenant-trial.repository';
import { MikroTenantTrialRepository } from './mikro-tenant-trial.repository';
import { ConvertTenantTrialUseCase, ExtendTenantTrialUseCase } from './tenant-trial.use-cases';
import { TENANT_DATA_EXPORT_REPOSITORY } from './tenant-data-export.repository';
import { InMemoryTenantDataExportRepository } from './in-memory-tenant-data-export.repository';
import { MikroTenantDataExportRepository } from './mikro-tenant-data-export.repository';
import {
  InMemoryTenantExportFileStore,
  ObjectStorageTenantExportFileStore,
  TENANT_EXPORT_FILE_STORE,
} from './tenant-export-file-store';
import { TenantExportBuilder } from './tenant-export-builder';
import {
  DownloadTenantExportUseCase,
  ListTenantExportsUseCase,
  RequestTenantExportUseCase,
} from './tenant-data-export.use-cases';
import { InMemoryTenantGrowthRepository } from './in-memory-tenant-growth.repository';
import { MikroTenantGrowthRepository } from './mikro-tenant-growth.repository';
import { GetSystemTenantUseCase } from './get-system-tenant.use-case';
import { GetSystemTenantOnboardingReferenceDataUseCase } from './get-system-tenant-onboarding-reference-data.use-case';
import { InMemoryActivityLogRepository } from './in-memory-activity-log.repository';
import { InMemoryDeviceModelCatalogRepository } from './in-memory-device-model-catalog.repository';
import { InMemoryTenantOnboardingRepository } from './in-memory-tenant-onboarding.repository';
import { InMemorySimRepository } from './in-memory-sim.repository';
import { InMemorySupportTicketRepository } from './in-memory-support-ticket.repository';
import { InMemorySupportTicketAttachmentRepository } from './in-memory-support-ticket-attachment.repository';
import { InMemorySupportMessageRepository } from './in-memory-support-message.repository';
import { InMemorySimProvisioningRequestRepository } from './in-memory-sim-provisioning-request.repository';
import { InMemorySimActivationBatchRepository } from './in-memory-sim-activation-batch.repository';
import { InMemorySystemFeatureFlagRepository } from './in-memory-system-feature-flag.repository';
import { InMemorySystemSettingsRepository } from './in-memory-system-settings.repository';
import { ListSystemAdminInvitesUseCase } from './list-system-admin-invites.use-case';
import { ListMisplacedSystemAccountsUseCase } from './list-misplaced-system-accounts.use-case';
import { InternalCallerService } from './internal-caller.service';
import { AccessChangeNotifier, AccessResolver } from './access-resolver';
import { TenantOrganizationTypeReader } from './tenant-organization-type.reader';
import { AccessNotifyingUserRepository } from './access-notifying-user.repository';
import { CapabilitiesController, InternalAccessController } from './access.controller';
import { TENANT_ROLE_REPOSITORY } from './tenant-role.repository';
import { InMemoryTenantRoleRepository } from './in-memory-tenant-role.repository';
import { MikroTenantRoleRepository } from './mikro-tenant-role.repository';
import { SystemRolesUseCases, TenantRolesUseCases } from './tenant-roles.use-cases';
import { SystemRolesController, TenantRolesController } from './tenant-roles.controller';
import { AccessGrantCheck } from './access-grant-check';
import { TwoFactorLogin } from './two-factor-login.use-case';
import { LoginEvents } from './login-events';
import { GovernanceUseCases, PermissionRemovalSweep } from './governance.use-cases';
import { GovernanceController, StaffRolesController } from './governance.controller';
import { PERMISSION_REMOVAL_REPOSITORY } from './permission-removal.repository';
import { InMemoryPermissionRemovalRepository } from './in-memory-permission-removal.repository';
import { MikroPermissionRemovalRepository } from './mikro-permission-removal.repository';
import { GRANT_CHECK } from './contexts/auth/session/domain/ports/grant-check.port';
import { accessProviders } from '@shared/access';
import { AccessRefusedListener, AuthCallerAudience, AuthPermissions, AuthRefusalReporter } from './access-refusals';
import { ListSystemDeviceCatalogUseCase } from './list-system-device-catalog.use-case';
import { ListSystemDeviceInventoryUseCase } from './list-system-device-inventory.use-case';
import { ListStillReportingDevicesUseCase } from './list-still-reporting-devices.use-case';
import { ListUnrecognisedDevicesUseCase } from './list-unrecognised-devices.use-case';
import { ManageUnrecognisedDeviceUseCase } from './manage-unrecognised-device.use-case';
import { TrackingGateClient } from './tracking-gate.client';
import { GetSystemDeviceDetailUseCase } from './get-system-device-detail.use-case';
import { ListSystemFeatureFlagsUseCase } from './list-system-feature-flags.use-case';
import { MikroActivityLogRepository } from './mikro-activity-log.repository';
import { MikroDeviceModelCatalogRepository } from './mikro-device-model-catalog.repository';
import { MikroSimRepository } from './mikro-sim.repository';
import { MikroSupportTicketRepository } from './mikro-support-ticket.repository';
import { MikroSupportTicketAttachmentRepository } from './mikro-support-ticket-attachment.repository';
import { MikroSupportMessageRepository } from './mikro-support-message.repository';
import { MikroSimProvisioningRequestRepository } from './mikro-sim-provisioning-request.repository';
import { MikroSimActivationBatchRepository } from './mikro-sim-activation-batch.repository';
import { MikroSystemFeatureFlagRepository } from './mikro-system-feature-flag.repository';
import { MikroSystemSettingsRepository } from './mikro-system-settings.repository';
import { MikroTenantOnboardingRepository } from './mikro-tenant-onboarding.repository';
import { ListSystemTenantsUseCase } from './list-system-tenants.use-case';
import { GetSystemTenantBillingUseCase } from './get-system-tenant-billing.use-case';
import { TENANT_COLLECTIONS_REPOSITORY } from './tenant-collections.repository';
import { MikroTenantCollectionsRepository } from './mikro-tenant-collections.repository';
import { InMemoryTenantCollectionsRepository } from './in-memory-tenant-collections.repository';
import { CancelSystemAdminInviteUseCase } from './cancel-system-admin-invite.use-case';
import { CreateSystemAdminInviteUseCase } from './create-system-admin-invite.use-case';
import { GetSystemSettingsUseCase } from './get-system-settings.use-case';
import { GetSystemSupportDashboardUseCase } from './get-system-support-dashboard.use-case';
import { ListSystemSupportTicketsUseCase } from './list-system-support-tickets.use-case';
import { GetSystemSupportTicketUseCase } from './get-system-support-ticket.use-case';
import { UpdateSystemSupportTicketStatusUseCase } from './update-system-support-ticket-status.use-case';
import { AssignSystemSupportTicketUseCase } from './assign-system-support-ticket.use-case';
import { EscalateSystemSupportTicketUseCase } from './escalate-system-support-ticket.use-case';
import { ListSystemSupportTicketMessagesUseCase } from './list-system-support-ticket-messages.use-case';
import { SendSystemSupportMessageUseCase } from './send-system-support-message.use-case';
import { ExportSystemSimsUseCase } from './export-system-sims.use-case';
import { GetSystemSimSummaryUseCase } from './get-system-sim-summary.use-case';
import { GetSystemSimCarrierBreakdownUseCase } from './get-system-sim-carrier-breakdown.use-case';
import { ListSystemSimBatchesUseCase } from './list-system-sim-batches.use-case';
import { ListSystemSimRequestsUseCase } from './list-system-sim-requests.use-case';
import { ListSystemSimsUseCase } from './list-system-sims.use-case';
import { ResendSystemAdminInviteUseCase } from './resend-system-admin-invite.use-case';
import { ResendSystemTenantInviteUseCase } from './resend-system-tenant-invite.use-case';
import { SYSTEM_FEATURE_FLAG_REPOSITORY } from './system-feature-flag.repository';
import { SYSTEM_SETTINGS_REPOSITORY } from './system-settings.repository';
import { UpdateSystemDeviceModelUseCase } from './update-system-device-model.use-case';
import { UpdateSystemFeatureFlagUseCase } from './update-system-feature-flag.use-case';
import { UpdateSystemSettingsUseCase } from './update-system-settings.use-case';
import { SystemSettingsChangedPublisher } from './system-settings-changed.publisher';
import { UpdateSystemTenantUseCase } from './update-system-tenant.use-case';
import { UpdateSystemTenantStatusUseCase } from './update-system-tenant-status.use-case';
import { SuperAdminBootstrapService } from './superadmin-bootstrap.service';
import { TENANT_ONBOARDING_REPOSITORY } from './tenant-onboarding.repository';
import { ExportSystemDeviceCatalogUseCase } from './export-system-device-catalog.use-case';
import { GetSystemHealthUseCase } from './get-system-health.use-case';
import { ExportSystemSupportTicketsUseCase } from './export-system-support-tickets.use-case';
import { ListSystemEscalatedTicketsUseCase } from './list-system-escalated-tickets.use-case';
import { ListSystemDeviceSetupRequestsUseCase } from './list-system-device-setup-requests.use-case';
import { ExportSystemDeviceSetupRequestsUseCase } from './export-system-device-setup-requests.use-case';
import { GetSystemSimDetailUseCase } from './get-system-sim-detail.use-case';
import { UpdateSystemSimUseCase } from './update-system-sim.use-case';
import { ReassignSystemSimUseCase } from './reassign-system-sim.use-case';
import { SuspendSystemSimUseCase } from './suspend-system-sim.use-case';
import { CreateSystemSimUseCase } from './create-system-sim.use-case';
import { ImportSystemSimsUseCase } from './import-system-sims.use-case';
import { DeleteSystemSimUseCase } from './delete-system-sim.use-case';
import { BulkSystemSimStatusUseCase } from './bulk-system-sim-status.use-case';
import { GetSystemSimImportTemplateUseCase } from './get-system-sim-import-template.use-case';
import { GetSystemSimRequestsSummaryUseCase } from './get-system-sim-requests-summary.use-case';
import { ExportSystemSimRequestsUseCase } from './export-system-sim-requests.use-case';
import { ApproveSystemSimRequestUseCase } from './approve-system-sim-request.use-case';
import { RejectSystemSimRequestUseCase } from './reject-system-sim-request.use-case';
import { GetSystemSimBatchesSummaryUseCase } from './get-system-sim-batches-summary.use-case';
import { GetSystemSimBatchDetailUseCase } from './get-system-sim-batch-detail.use-case';
import { ExportSystemSimBatchesUseCase } from './export-system-sim-batches.use-case';
import { RetrySystemSimBatchUseCase } from './retry-system-sim-batch.use-case';
import { GetSystemDeviceSetupRequestUseCase } from './get-system-device-setup-request.use-case';
import { AssignSystemDeviceSetupRequestUseCase } from './assign-system-device-setup-request.use-case';
import { ConfirmSystemDeviceSetupPaymentUseCase } from './confirm-system-device-setup-payment.use-case';
import { DeviceSetupRequestPricingService } from './device-setup-request-pricing.service';
import { InstallerDeviceSetupRequestsUseCases } from './installer-device-setup-requests.use-cases';
import {
  ReinstateSystemDeviceUseCase,
  DecommissionSystemDeviceUseCase,
  SuspendSystemDeviceUseCase,
} from './suspend-system-device.use-cases';
import {
  AssignSystemDevicesUseCase,
  ImportSystemDeviceStockUseCase,
  SendTestTelemetryUseCase,
  UpdateSystemDeviceUseCase,
} from './update-system-device.use-cases';
import {
  ApproveSystemDeviceSetupRequestUseCase,
  GetSystemDeviceSetupSummaryUseCase,
  RejectSystemDeviceSetupRequestUseCase,
} from './decide-system-device-setup-request.use-cases';
import { InMemoryDeviceSetupRequestRepository } from './in-memory-device-setup-request.repository';
import { MikroDeviceSetupRequestRepository } from './mikro-device-setup-request.repository';
import { DEVICE_SETUP_REQUEST_REPOSITORY } from './device-setup-request.repository';
import { TENANT_BUSINESS_INFO_REPOSITORY } from './tenant-business-info.repository';
import { InMemoryTenantBusinessInfoRepository } from './in-memory-tenant-business-info.repository';
import { MikroTenantBusinessInfoRepository } from './mikro-tenant-business-info.repository';
import { KYC_DOCUMENT_REPOSITORY } from './tenant-kyc-document.repository';
import { InMemoryKycDocumentRepository } from './in-memory-tenant-kyc-document.repository';
import { MikroKycDocumentRepository } from './mikro-tenant-kyc-document.repository';
import {
  ApproveOnboardingApplicationUseCase,
  ConfirmOnboardingVerificationCodeUseCase,
  AddApplicationVehicleUseCase,
  CreateOnboardingApplicationUseCase,
  GetIndemnityTemplateUseCase,
  GetM2mLicensePlansUseCase,
  BILLING_AUDIT,
  BILLING_PRICE_CHANGE_REPOSITORY,
  BILLING_SETTINGS_REPOSITORY,
  CreateLicensePlanUseCase,
  GetInstallationPriceUseCase,
  GetLicensePlanUseCase,
  InMemoryBillingPriceChangeRepository,
  InMemoryBillingSettingsRepository,
  ListLicensePlansUseCase,
  ListPriceChangesUseCase,
  BILLING_SUMMARY_REPOSITORY,
  GetBillingSummaryUseCase,
  GetInvoiceUseCase,
  GetPaymentUseCase,
  INVOICE_NOTIFIER,
  INVOICE_NUMBER_ALLOCATOR,
  INVOICE_REPOSITORY,
  InMemoryBillingSummaryRepository,
  InMemoryInvoiceRepository,
  InMemoryPaymentHistoryRepository,
  InvoiceIssuanceService,
  ListInvoicesUseCase,
  ListPaymentsUseCase,
  MailerInvoiceNotifier,
  MikroBillingSummaryRepository,
  MikroInvoiceRepository,
  MikroPaymentHistoryRepository,
  PAYMENT_HISTORY_REPOSITORY,
  GetQuotationUseCase,
  InMemoryQuotationRepository,
  ListQuotationsUseCase,
  MikroQuotationRepository,
  OrderQuotationService,
  QUOTATION_NUMBER_ALLOCATOR,
  QUOTATION_REPOSITORY,
  MikroBillingPriceChangeRepository,
  MikroBillingSettingsRepository,
  SetLicensePlanActiveUseCase,
  UpdateInstallationPriceUseCase,
  UpdateLicensePlanUseCase,
  VerifyApplicationPaymentUseCase,
  CompleteApplicationPaymentUseCase,
  ConfirmApplicationPaymentUseCase,
  CreateApplicationPaymentUseCase,
  GetApplicationOrderUseCase,
  GetOnboardingApplicationTimelineUseCase,
  InMemoryOnboardingPaymentRepository,
  MikroOnboardingPaymentRepository,
  ONBOARDING_PAYMENT_REPOSITORY,
  SetBillingEmailUseCase,
  INDEMNITY_AGREEMENT_REPOSITORY,
  IndemnityTemplateBootstrapService,
  InMemoryIndemnityAgreementRepository,
  InMemoryM2mLicensePlanRepository,
  M2M_LICENSE_PLAN_REPOSITORY,
  M2mLicensePlansBootstrapService,
  MikroIndemnityAgreementRepository,
  MikroM2mLicensePlanRepository,
  AbandonedApplicationSweepService,
  CompleteProvisioningUseCase,
  OnboardingProvisioningService,
  OnboardingStageSweepService,
  ReviewOnboardingPaymentMismatchUseCase,
  RefundOnboardingPaymentUseCase,
  ApplicationPaymentNoticeService,
  RefundSettlementService,
  RefundReconciliationService,
  RefundReconciliationSweep,
  PaymentNoticeRetrySweep,
  ResendPaymentLinkUseCase,
  ResendChangesRequestedLinkUseCase,
  ApplyAutomatedDecisionUseCase,
  DojahKybAdapter,
  InMemoryVerificationResultRepository,
  KYB_VERIFICATION,
  MikroVerificationResultRepository,
  DOCUMENT_EXTRACTOR,
  HttpDocumentExtractor,
  QoreIdKybAdapter,
  RoutedKybVerification,
  VERIFICATION_RESULT_REPOSITORY,
  VerifyApplicationAutomaticallyUseCase,
  DuplicateIdentityError,
  IDENTITY_CLAIM_REPOSITORY,
  InMemoryIdentityClaimRepository,
  MikroIdentityClaimRepository,
  PdfSignedAgreementRenderer,
  ResumeOnboardingApplicationUseCase,
  SIGNED_AGREEMENT_RENDERER,
  SignIndemnityAgreementUseCase,
  ImportApplicationVehiclesUseCase,
  RemoveApplicationDeviceRequestUseCase,
  RemoveApplicationVehicleUseCase,
  RequestApplicationDevicesUseCase,
  OnboardingDeviceInventoryService,
  UpdateApplicationVehicleUseCase,
  DeleteOnboardingApplicationDocumentUseCase,
  GetOnboardingApplicationDocumentLinkUseCase,
  GetOnboardingApplicationForReviewUseCase,
  GetOnboardingApplicationStatusUseCase,
  GetOnboardingApplicationUseCase,
  GetOnboardingReviewSummaryUseCase,
  InMemoryOnboardingApplicationRepository,
  ListOnboardingApplicationsUseCase,
  MikroOnboardingApplicationRepository,
  ONBOARDING_APPLICATION_REPOSITORY,
  MailerOnboardingAdminNotifier,
  MailerOnboardingDecisionNotifier,
  ONBOARDING_ADMIN_NOTIFIER,
  MailerOnboardingVerificationNotifier,
  ONBOARDING_DECISION_NOTIFIER,
  ONBOARDING_VERIFICATION_NOTIFIER,
  RejectOnboardingApplicationUseCase,
  RequestOnboardingApplicationChangesUseCase,
  ResendOnboardingSetupLinkUseCase,
  ReviewOnboardingApplicationDocumentUseCase,
  SendOnboardingVerificationCodeUseCase,
  SubmitOnboardingApplicationUseCase,
  UpdateOnboardingApplicationUseCase,
  UploadOnboardingApplicationDocumentUseCase,
} from '@auth/onboarding';
import { OnboardingApplicationsController } from './onboarding-applications.controller';
import { SystemOnboardingApplicationsController } from './system-onboarding-applications.controller';
import { PaymentEventService } from './payment-event.service';
import { GetOnboardingPlansUseCase } from './get-onboarding-plans.use-case';
import { CreatePaymentIntentUseCase } from './create-payment-intent.use-case';
import { ActivateSubscriptionUseCase } from './activate-subscription.use-case';
import { SubscribePaymentEventsUseCase } from './subscribe-payment-events.use-case';
import { SubmitEnterpriseEnquiryUseCase } from './submit-enterprise-enquiry.use-case';
import { GetSubscriptionCapsUseCase } from './get-subscription-caps.use-case';
import { GetBusinessInfoUseCase } from './get-business-info.use-case';
import { SaveBusinessInfoUseCase } from './save-business-info.use-case';
import { ListKycDocumentsUseCase } from './list-kyc-documents.use-case';
import { GetOnboardingStatusUseCase } from './get-onboarding-status.use-case';
import { SaveKycDocumentUseCase } from './save-kyc-document.use-case';
import { DeleteKycDocumentUseCase } from './delete-kyc-document.use-case';
import { RegisterSimsUseCase } from './register-sims.use-case';
import { ImportSimsCsvUseCase } from './import-sims-csv.use-case';
import { SubmitSimProvisioningRequestUseCase } from './submit-sim-provisioning-request.use-case';
import { SaveFeatureTogglesUseCase } from './save-feature-toggles.use-case';
import { CompleteOnboardingUseCase } from './complete-onboarding.use-case';
import { SimDeviceInfoListener } from './sim-device-info.listener';
import { SIM_CHANGED_EVENT_PUBLISHER } from './sim-changed-event.publisher';
import { EventBusSimChangedEventPublisher } from './eventbus-sim-changed-event.publisher';
// Bundle carrier
import { BUNDLE_CARRIER_REPOSITORY } from './bundle-carrier.repository';
import { InMemoryBundleCarrierRepository } from './in-memory-bundle-carrier.repository';
import { MikroBundleCarrierRepository } from './mikro-bundle-carrier.repository';
import { TELECOM_MASTER_REPOSITORY } from './telecom-master.repository';
import { InMemoryTelecomMasterRepository } from './in-memory-telecom-master.repository';
import { MikroTelecomMasterRepository } from './mikro-telecom-master.repository';
import {
  GetTelecomMasterRequestUseCase,
  ListTelecomMasterRequestsUseCase,
  RetryTelecomMasterRequestUseCase,
  ResolveTelecomMasterRequestUseCase,
  TenantTelecomMasterUseCases,
  ApplicationTelecomMasterUseCases,
} from './telecom-master.use-cases';
import { TenantTelecomMasterController } from './tenant-telecom-master.controller';
// Bundle catalog
import { BUNDLE_CATALOG_REPOSITORY } from './bundle-catalog.repository';
import { InMemoryBundleCatalogRepository } from './in-memory-bundle-catalog.repository';
import { MikroBundleCatalogRepository } from './mikro-bundle-catalog.repository';
import { MtnM2mClient } from './contexts/mtn/mtn-m2m.client';
import { MtnBundleCatalogSyncService } from './contexts/mtn/mtn-bundle-catalog-sync.service';
import { MtnBundleCatalogSweepService } from './contexts/mtn/mtn-bundle-catalog-sweep.service';
import { SyncMtnBundleCatalogUseCase } from './sync-mtn-bundle-catalog.use-case';
// Tenant wallet
import { TENANT_WALLET_REPOSITORY } from './tenant-wallet.repository';
import { InMemoryTenantWalletRepository } from './in-memory-tenant-wallet.repository';
import { MikroTenantWalletRepository } from './mikro-tenant-wallet.repository';
// Wallet top-up
import { WALLET_TOP_UP_REPOSITORY } from './wallet-top-up.repository';
import { InMemoryWalletTopUpRepository } from './in-memory-wallet-top-up.repository';
import { MikroWalletTopUpRepository } from './mikro-wallet-top-up.repository';
// Spending limit
import { SPENDING_LIMIT_REPOSITORY } from './spending-limit.repository';
import { InMemorySpendingLimitRepository } from './in-memory-spending-limit.repository';
import { MikroSpendingLimitRepository } from './mikro-spending-limit.repository';
// Auto top-up
import { AUTO_TOP_UP_REPOSITORY } from './auto-topup.repository';
import { InMemoryAutoTopUpRepository } from './in-memory-auto-topup.repository';
import { MikroAutoTopUpRepository } from './mikro-auto-topup.repository';
// Bundle allocation
import { BUNDLE_ALLOCATION_REPOSITORY } from './bundle-allocation.repository';
import { InMemoryBundleAllocationRepository } from './in-memory-bundle-allocation.repository';
import { MikroBundleAllocationRepository } from './mikro-bundle-allocation.repository';
// Bundle transaction
import { BUNDLE_TRANSACTION_REPOSITORY } from './bundle-transaction.repository';
import { InMemoryBundleTransactionRepository } from './in-memory-bundle-transaction.repository';
import { MikroBundleTransactionRepository } from './mikro-bundle-transaction.repository';
// Device mapping file
import { DEVICE_MAPPING_FILE_REPOSITORY } from './device-mapping-file.repository';
import { InMemoryDeviceMappingFileRepository } from './in-memory-device-mapping-file.repository';
import { MikroDeviceMappingFileRepository } from './mikro-device-mapping-file.repository';
// SIM inventory use cases
import { ListTenantSimsUseCase } from './list-tenant-sims.use-case';
import { GetTenantSimUseCase } from './get-tenant-sim.use-case';
import { RegisterTenantSimUseCase } from './register-tenant-sim.use-case';
import { UpdateTenantSimUseCase } from './update-tenant-sim.use-case';
import { SuspendTenantSimUseCase } from './suspend-tenant-sim.use-case';
import { ReactivateTenantSimUseCase } from './reactivate-tenant-sim.use-case';
import { UnassignDeviceFromSimUseCase } from './unassign-device-from-sim.use-case';
import { DeleteTenantSimUseCase } from './delete-tenant-sim.use-case';
import { ExportTenantSimsUseCase } from './export-tenant-sims.use-case';
import { ExportTenantWalletsUseCase } from './export-tenant-wallets.use-case';
import { ExportCrossTenantLedgerUseCase } from './export-cross-tenant-ledger.use-case';
import { GetSimImportTemplateUseCase } from './get-sim-import-template.use-case';
import { ImportTenantSimsCsvUseCase } from './import-tenant-sims-csv.use-case';
// SIM request use cases
import { ListTenantSimRequestsUseCase } from './list-tenant-sim-requests.use-case';
import { GetTenantSimRequestUseCase } from './get-tenant-sim-request.use-case';
import { SubmitTenantSimRequestUseCase } from './submit-tenant-sim-request.use-case';
import { GetDeviceMappingTemplateUseCase } from './get-device-mapping-template.use-case';
import { UploadDeviceMappingCsvUseCase } from './upload-device-mapping-csv.use-case';
// Carrier / bundle catalog use cases
import { ListCarriersUseCase } from './list-carriers.use-case';
import { CreateSystemCarrierUseCase } from './create-system-carrier.use-case';
import { UpdateSystemCarrierUseCase } from './update-system-carrier.use-case';
import { ListBundleCatalogUseCase } from './list-bundle-catalog.use-case';
import { ListSystemBundleCatalogUseCase } from './list-system-bundle-catalog.use-case';
import { CreateSystemBundleUseCase } from './create-system-bundle.use-case';
import { UpdateSystemBundleUseCase } from './update-system-bundle.use-case';
import { DeleteSystemBundleUseCase } from './delete-system-bundle.use-case';
import { GetSystemBundleAdoptionUseCase } from './get-system-bundle-adoption.use-case';
// Data bundle dashboard use cases
import { GetBundleSummaryUseCase } from './get-bundle-summary.use-case';
import { GetWalletBalanceUseCase } from './get-wallet-balance.use-case';
import { TopupWalletUseCase } from './topup-wallet.use-case';
import { SpendingLimitService } from './spending-limit.service';
import { ListWalletLedgerUseCase } from './list-wallet-ledger.use-case';
import { WALLET_LEDGER_REPOSITORY } from './wallet-ledger.repository';
import { InMemoryWalletLedgerRepository } from './in-memory-wallet-ledger.repository';
import { MikroWalletLedgerRepository } from './mikro-wallet-ledger.repository';
import { INVOICE_NUMBER_REPOSITORY } from './invoice-number.repository';
import { InMemoryInvoiceNumberRepository } from './in-memory-invoice-number.repository';
import { MikroInvoiceNumberRepository } from './mikro-invoice-number.repository';
import { InvoiceNumberService } from './invoice-number.service';
import { SettleWalletTopUpUseCase } from './settle-wallet-top-up.use-case';
import { GetSpendingLimitUseCase } from './get-spending-limit.use-case';
import { SaveSpendingLimitUseCase } from './save-spending-limit.use-case';
import { DisableSpendingLimitUseCase } from './disable-spending-limit.use-case';
import { GetAutoTopupUseCase } from './get-auto-topup.use-case';
import { SaveAutoTopupUseCase } from './save-auto-topup.use-case';
import { DisableAutoTopupUseCase } from './disable-auto-topup.use-case';
import { ListBundleAllocationsUseCase } from './list-bundle-allocations.use-case';
import { GetBundleAllocationUseCase } from './get-bundle-allocation.use-case';
import { ExportBundleAllocationsUseCase } from './export-bundle-allocations.use-case';
import { AllocateBundleUseCase } from './allocate-bundle.use-case';
import { ListSimsForAllocationUseCase } from './list-sims-for-allocation.use-case';
import { ListBundleTransactionsUseCase } from './list-bundle-transactions.use-case';
import { ExportBundleTransactionsUseCase } from './export-bundle-transactions.use-case';
import { GetSpendTrendUseCase } from './get-spend-trend.use-case';
import { GetSpendBreakdownUseCase } from './get-spend-breakdown.use-case';
import { GetCarrierDistributionUseCase } from './get-carrier-distribution.use-case';
import { GetSubscriptionUsageUseCase } from './get-subscription-usage.use-case';
import { ListBundleRatesUseCase } from './list-bundle-rates.use-case';
import { ExportBundleRatesUseCase } from './export-bundle-rates.use-case';

@Module({
  imports: [
    ConfigModule,
    CryptoModule,
    LoggerModule,
    MailerModule,
    ObjectStorageModule,
    EventBusModule,
    MetricsModule,
  ],
  controllers: [
    AuthController,
    InternalAccessController,
    CapabilitiesController,
    TenantRolesController,
    AppVersionController,
    SystemRolesController,
    GovernanceController,
    StaffRolesController,
    InstallerAuthController,
    InstallerPortalController,
    InstallerJobWorkController,
    InstallerDeviceRequestsController,
    InstallerNotificationsController,
    InstallerSettingsController,
    InstallerSupportController,
    InternalInstallersController,
    InternalNotificationRecipientsController,
    InternalTenantContactController,
    InternalOnboardingGateController,
    InternalOtpController,
    SystemInstallersController,
    SystemInstallationOrdersController,
    OnboardingApplicationsController,
    ContactController,
    InstallationController,
    SystemOnboardingApplicationsController,
    MailCredentialsController,
    TelephonyController,
    MailboxController,
    AdminMailCredentialsController,
    AdminMailboxController,
    PlatformAlertsController,
    AdminNotificationsController,
    InternalAdminNotificationsController,
    SystemAiController,
    SystemAuditController,
    TwoFactorController,
    CommunicationRatesController,
    OrganisationUpgradesController,
    InternalUsageController,
    InternalDeviceCatalogController,
    InternalBundleCatalogController,
    PlatformWalletsController,
    PlatformIntegrationCredentialsController,
    ProfileController,
    OrganizationController,
    SystemController,
    SystemReferenceDataController,
    SystemTenantsController,
    SystemTelecomMasterController,
    TenantTelecomMasterController,
    SystemDevicesController,
    SystemSimsController,
    SystemSupportController,
    SystemSecurityController,
    SupportTicketsController,
    SystemBillingController,
    SystemBillingPricingController,
    SystemBillingQuotationsController,
    SystemBillingInvoicesController,
    SystemBillingEnforcementController,
    TenantBillingController,
    StorageUsageController,
    SuspensionsController,
    SystemKycController,
    OnboardingController,
    TenantSimsController,
    DataBundlesController,
    CommunicationsWalletController,
    ReadinessController,
  ],
  providers: [
    {
      provide: APP_FILTER,
      inject: [HttpAdapterHost],
      useFactory: (host: HttpAdapterHost) => new SentryExceptionFilter(host, 'auth'),
    },
    RequestContextMiddleware,
    // Unified OTP/SMS. In-process for auth; other services call the internal route.
    DotgoTransactionalSmsProvider,
    UnifiedSmsService,
    GetMySupportSummaryUseCase,
    GetSupportOptionsUseCase,
    PreviewTicketContextUseCase,
    ExportMySupportTicketsUseCase,
    InMemoryTenantSuspensionRepository,
    MikroTenantSuspensionRepository,
    {
      provide: TENANT_SUSPENSION_REPOSITORY,
      inject: [
        InMemoryTenantSuspensionRepository,
        MikroTenantSuspensionRepository,
        AppConfigService,
      ],
      useFactory: (
        inMemory: InMemoryTenantSuspensionRepository,
        mikro: MikroTenantSuspensionRepository,
        config: AppConfigService,
      ) => (config.persistence.backend === 'in-memory' ? inMemory : mikro),
    },
    InMemoryTenantTerminationRepository,
    MikroTenantTerminationRepository,
    {
      provide: TENANT_TERMINATION_REPOSITORY,
      inject: [
        InMemoryTenantTerminationRepository,
        MikroTenantTerminationRepository,
        AppConfigService,
      ],
      useFactory: (
        inMemory: InMemoryTenantTerminationRepository,
        mikro: MikroTenantTerminationRepository,
        config: AppConfigService,
      ) => (config.persistence.backend === 'in-memory' ? inMemory : mikro),
    },
    TerminateSystemTenantUseCase,
    {
      provide: TENANT_ASSET_STORE,
      useFactory: defaultTenantAssetStore,
      inject: [AppConfigService, USER_REPOSITORY, SIM_REPOSITORY],
    },
    GetTenantResourceUseCase,
    GetTenantDocumentsUseCase,
    GetTenantAuditLogUseCase,
    MikroTenantNameReader,
    NoopTenantNameReader,
    {
      provide: TENANT_NAME_READER,
      inject: [NoopTenantNameReader, MikroTenantNameReader, AppConfigService],
      useFactory: (
        noop: NoopTenantNameReader,
        mikro: MikroTenantNameReader,
        config: AppConfigService,
      ) => (config.persistence.backend === 'in-memory' ? noop : mikro),
    },
    ListAuditLogUseCase,
    GetAuditFilterOptionsUseCase,
    VerifyAuditChainsUseCase,
    BeginTwoFactorEnrolmentUseCase,
    ConfirmTwoFactorEnrolmentUseCase,
    DisableTwoFactorUseCase,
    GetTwoFactorStatusUseCase,
    InMemoryTwoFactorRepository,
    MikroTwoFactorRepository,
    {
      provide: TWO_FACTOR_REPOSITORY,
      inject: [InMemoryTwoFactorRepository, MikroTwoFactorRepository, AppConfigService],
      useFactory: (
        inMemory: InMemoryTwoFactorRepository,
        mikro: MikroTwoFactorRepository,
        config: AppConfigService,
      ) => (config.persistence.backend === 'in-memory' ? inMemory : mikro),
    },
    SystemSessionPolicyAdapter,
    { provide: SESSION_POLICY_READER, useExisting: SystemSessionPolicyAdapter },
    AiGatewayService,
    GetAiGovernanceUseCase,
    UpdateAiGovernanceUseCase,
    GetAiUsageUseCase,
    ListAiRequestsUseCase,
    InMemoryAiGovernanceRepository,
    MikroAiGovernanceRepository,
    {
      provide: AI_GOVERNANCE_REPOSITORY,
      inject: [InMemoryAiGovernanceRepository, MikroAiGovernanceRepository, AppConfigService],
      useFactory: (
        inMemory: InMemoryAiGovernanceRepository,
        mikro: MikroAiGovernanceRepository,
        config: AppConfigService,
      ) => (config.persistence.backend === 'in-memory' ? inMemory : mikro),
    },
    InMemoryAiRequestLogRepository,
    MikroAiRequestLogRepository,
    {
      provide: AI_REQUEST_LOG_REPOSITORY,
      inject: [InMemoryAiRequestLogRepository, MikroAiRequestLogRepository, AppConfigService],
      useFactory: (
        inMemory: InMemoryAiRequestLogRepository,
        mikro: MikroAiRequestLogRepository,
        config: AppConfigService,
      ) => (config.persistence.backend === 'in-memory' ? inMemory : mikro),
    },
    LoginRateLimitGuard,
    IdempotencyGuard,
    RedisClientProvider,
    // User repository
    InMemoryUserRepository,
    MikroUserRepository,
    InMemoryTenantRoleRepository,
    MikroTenantRoleRepository,
    {
      provide: TENANT_ROLE_REPOSITORY,
      inject: [InMemoryTenantRoleRepository, MikroTenantRoleRepository, AppConfigService],
      useFactory: (inMemory: InMemoryTenantRoleRepository, mikro: MikroTenantRoleRepository, config: AppConfigService) =>
        config.persistence.backend === 'in-memory' ? inMemory : mikro,
    },
    InMemoryPermissionRemovalRepository,
    MikroPermissionRemovalRepository,
    {
      provide: PERMISSION_REMOVAL_REPOSITORY,
      inject: [InMemoryPermissionRemovalRepository, MikroPermissionRemovalRepository, AppConfigService],
      useFactory: (
        inMemory: InMemoryPermissionRemovalRepository,
        mikro: MikroPermissionRemovalRepository,
        config: AppConfigService,
      ) => (config.persistence.backend === 'in-memory' ? inMemory : mikro),
    },
    AccessResolver,
    TenantOrganizationTypeReader,
    AccessChangeNotifier,
    TenantRolesUseCases,
    SystemRolesUseCases,
    GovernanceUseCases,
    TwoFactorLogin,
    LoginEvents,
    PermissionRemovalSweep,
    { provide: GRANT_CHECK, useClass: AccessGrantCheck },
    {
      provide: USER_REPOSITORY,
      inject: [InMemoryUserRepository, MikroUserRepository, AppConfigService, AccessChangeNotifier],
      useFactory: (
        inMemory: InMemoryUserRepository,
        mikro: MikroUserRepository,
        config: AppConfigService,
        access: AccessChangeNotifier,
      ) => new AccessNotifyingUserRepository(config.persistence.backend === 'in-memory' ? inMemory : mikro, access),
    },

    // Identity provider
    DbIdentityProvider,
    {
      provide: IDENTITY_PROVIDER,
      useExisting: DbIdentityProvider,
    },

    // Token service
    UserTokenService,
    {
      provide: TOKEN_SERVICE,
      useExisting: UserTokenService,
    },
    UuidIdGenerator,
    {
      provide: ID_GENERATOR,
      useExisting: UuidIdGenerator,
    },
    ScryptPasswordHasher,
    {
      provide: PASSWORD_HASHER,
      useExisting: ScryptPasswordHasher,
    },
    MailerAuthNotifier,
    {
      provide: AUTH_NOTIFIER,
      useExisting: MailerAuthNotifier,
    },
    AuthPersistenceHealthCheck,
    {
      provide: AUTH_HEALTH_CHECK,
      useExisting: AuthPersistenceHealthCheck,
    },

    // Session store
    InMemorySessionStore,
    MikroSessionStore,
    {
      provide: SESSION_STORE,
      inject: [InMemorySessionStore, MikroSessionStore, AppConfigService],
      useFactory: (
        inMemoryStore: InMemorySessionStore,
        mikroStore: MikroSessionStore,
        config: AppConfigService,
      ) =>
        config.persistence.backend === 'in-memory' ? inMemoryStore : mikroStore,
    },

    // Invite repository
    InMemoryInviteRepository,
    MikroInviteRepository,
    {
      provide: INVITE_REPOSITORY,
      inject: [
        InMemoryInviteRepository,
        MikroInviteRepository,
        AppConfigService,
      ],
      useFactory: (
        inMemory: InMemoryInviteRepository,
        mikro: MikroInviteRepository,
        config: AppConfigService,
      ) => (config.persistence.backend === 'in-memory' ? inMemory : mikro),
    },

    // Password reset store
    InMemoryPasswordResetStore,
    MikroPasswordResetStore,
    {
      provide: PASSWORD_RESET_STORE,
      inject: [
        InMemoryPasswordResetStore,
        MikroPasswordResetStore,
        AppConfigService,
      ],
      useFactory: (
        inMemory: InMemoryPasswordResetStore,
        mikro: MikroPasswordResetStore,
        config: AppConfigService,
      ) => (config.persistence.backend === 'in-memory' ? inMemory : mikro),
    },

    // Organization settings repository
    InMemoryOrganizationSettingsRepository,
    MikroOrganizationSettingsRepository,
    {
      provide: ORGANIZATION_SETTINGS_REPOSITORY,
      inject: [
        InMemoryOrganizationSettingsRepository,
        MikroOrganizationSettingsRepository,
        AppConfigService,
      ],
      useFactory: (
        inMemory: InMemoryOrganizationSettingsRepository,
        mikro: MikroOrganizationSettingsRepository,
        config: AppConfigService,
      ) => (config.persistence.backend === 'in-memory' ? inMemory : mikro),
    },

    InMemorySystemSettingsRepository,
    MikroSystemSettingsRepository,
    {
      provide: SYSTEM_SETTINGS_REPOSITORY,
      inject: [
        InMemorySystemSettingsRepository,
        MikroSystemSettingsRepository,
        AppConfigService,
      ],
      useFactory: (
        inMemory: InMemorySystemSettingsRepository,
        mikro: MikroSystemSettingsRepository,
        config: AppConfigService,
      ) => (config.persistence.backend === 'in-memory' ? inMemory : mikro),
    },

    InMemorySystemFeatureFlagRepository,
    MikroSystemFeatureFlagRepository,
    {
      provide: SYSTEM_FEATURE_FLAG_REPOSITORY,
      inject: [
        InMemorySystemFeatureFlagRepository,
        MikroSystemFeatureFlagRepository,
        AppConfigService,
      ],
      useFactory: (
        inMemory: InMemorySystemFeatureFlagRepository,
        mikro: MikroSystemFeatureFlagRepository,
        config: AppConfigService,
      ) => (config.persistence.backend === 'in-memory' ? inMemory : mikro),
    },

    InMemoryActivityLogRepository,
    MikroActivityLogRepository,
    {
      provide: ACTIVITY_LOG_REPOSITORY,
      inject: [
        InMemoryActivityLogRepository,
        MikroActivityLogRepository,
        AppConfigService,
      ],
      useFactory: (
        inMemory: InMemoryActivityLogRepository,
        mikro: MikroActivityLogRepository,
        config: AppConfigService,
      ) => (config.persistence.backend === 'in-memory' ? inMemory : mikro),
    },
    InMemoryTenantOnboardingRepository,
    MikroTenantOnboardingRepository,
    {
      provide: TENANT_ONBOARDING_REPOSITORY,
      inject: [
        InMemoryTenantOnboardingRepository,
        MikroTenantOnboardingRepository,
        AppConfigService,
      ],
      useFactory: (
        inMemory: InMemoryTenantOnboardingRepository,
        mikro: MikroTenantOnboardingRepository,
        config: AppConfigService,
      ) => (config.persistence.backend === 'in-memory' ? inMemory : mikro),
    },
    InMemoryDeviceModelCatalogRepository,
    MikroDeviceModelCatalogRepository,
    {
      provide: DEVICE_MODEL_CATALOG_REPOSITORY,
      inject: [
        InMemoryDeviceModelCatalogRepository,
        MikroDeviceModelCatalogRepository,
        AppConfigService,
      ],
      useFactory: (
        inMemory: InMemoryDeviceModelCatalogRepository,
        mikro: MikroDeviceModelCatalogRepository,
        config: AppConfigService,
      ) => (config.persistence.backend === 'in-memory' ? inMemory : mikro),
    },
    InMemorySubscriptionPlanRepository,
    MikroSubscriptionPlanRepository,
    {
      provide: SUBSCRIPTION_PLAN_REPOSITORY,
      inject: [
        InMemorySubscriptionPlanRepository,
        MikroSubscriptionPlanRepository,
        AppConfigService,
      ],
      useFactory: (
        inMemory: InMemorySubscriptionPlanRepository,
        mikro: MikroSubscriptionPlanRepository,
        config: AppConfigService,
      ) => (config.persistence.backend === 'in-memory' ? inMemory : mikro),
    },
    SubscriptionPlansBootstrapService,
    CheckTenantSeatLimitUseCase,
    InMemoryTenantFieldActivityReader,
    MikroTenantFieldActivityReader,
    {
      provide: TENANT_FIELD_ACTIVITY_READER,
      inject: [InMemoryTenantFieldActivityReader, MikroTenantFieldActivityReader, AppConfigService],
      useFactory: (
        inMemory: InMemoryTenantFieldActivityReader,
        mikro: MikroTenantFieldActivityReader,
        config: AppConfigService,
      ) => (config.persistence.backend === 'in-memory' ? inMemory : mikro),
    },
    InMemorySimRepository,
    MikroSimRepository,
    {
      provide: SIM_REPOSITORY,
      inject: [InMemorySimRepository, MikroSimRepository, AppConfigService],
      useFactory: (
        inMemory: InMemorySimRepository,
        mikro: MikroSimRepository,
        config: AppConfigService,
      ) => (config.persistence.backend === 'in-memory' ? inMemory : mikro),
    },
    InMemorySimProvisioningRequestRepository,
    MikroSimProvisioningRequestRepository,
    {
      provide: SIM_PROVISIONING_REQUEST_REPOSITORY,
      inject: [
        InMemorySimProvisioningRequestRepository,
        MikroSimProvisioningRequestRepository,
        AppConfigService,
      ],
      useFactory: (
        inMemory: InMemorySimProvisioningRequestRepository,
        mikro: MikroSimProvisioningRequestRepository,
        config: AppConfigService,
      ) => (config.persistence.backend === 'in-memory' ? inMemory : mikro),
    },
    InMemorySimActivationBatchRepository,
    MikroSimActivationBatchRepository,
    {
      provide: SIM_ACTIVATION_BATCH_REPOSITORY,
      inject: [
        InMemorySimActivationBatchRepository,
        MikroSimActivationBatchRepository,
        AppConfigService,
      ],
      useFactory: (
        inMemory: InMemorySimActivationBatchRepository,
        mikro: MikroSimActivationBatchRepository,
        config: AppConfigService,
      ) => (config.persistence.backend === 'in-memory' ? inMemory : mikro),
    },

    InMemoryAuthEventRepository,
    MikroAuthEventRepository,
    {
      provide: AUTH_EVENT_REPOSITORY,
      inject: [InMemoryAuthEventRepository, MikroAuthEventRepository, AppConfigService],
      useFactory: (
        inMemory: InMemoryAuthEventRepository,
        mikro: MikroAuthEventRepository,
        config: AppConfigService,
      ) => (config.persistence.backend === 'in-memory' ? inMemory : mikro),
    },
    InMemoryBlockedIpRepository,
    MikroBlockedIpRepository,
    {
      provide: BLOCKED_IP_REPOSITORY,
      inject: [InMemoryBlockedIpRepository, MikroBlockedIpRepository, AppConfigService],
      useFactory: (
        inMemory: InMemoryBlockedIpRepository,
        mikro: MikroBlockedIpRepository,
        config: AppConfigService,
      ) => (config.persistence.backend === 'in-memory' ? inMemory : mikro),
    },
    InMemoryAutoBlockRuleRepository,
    MikroAutoBlockRuleRepository,
    {
      provide: AUTO_BLOCK_RULE_REPOSITORY,
      inject: [InMemoryAutoBlockRuleRepository, MikroAutoBlockRuleRepository, AppConfigService],
      useFactory: (
        inMemory: InMemoryAutoBlockRuleRepository,
        mikro: MikroAutoBlockRuleRepository,
        config: AppConfigService,
      ) => (config.persistence.backend === 'in-memory' ? inMemory : mikro),
    },
    InMemorySecurityEventRepository,
    MikroSecurityEventRepository,
    {
      provide: SECURITY_EVENT_REPOSITORY,
      inject: [InMemorySecurityEventRepository, MikroSecurityEventRepository, AppConfigService],
      useFactory: (
        inMemory: InMemorySecurityEventRepository,
        mikro: MikroSecurityEventRepository,
        config: AppConfigService,
      ) => (config.persistence.backend === 'in-memory' ? inMemory : mikro),
    },
    RecordAuthEventUseCase,
    IpBlockGuard,
    ListSystemAuthEventsUseCase,
    ListSystemFailedLoginsUseCase,
    ListAutoBlockRulesUseCase,
    UpdateAutoBlockRuleUseCase,
    ListSecurityEventsUseCase,
    GetSecurityOverviewUseCase,

    InMemorySupportTicketRepository,
    MikroSupportTicketRepository,
    {
      provide: SUPPORT_TICKET_REPOSITORY,
      inject: [InMemorySupportTicketRepository, MikroSupportTicketRepository, AppConfigService],
      useFactory: (
        inMemory: InMemorySupportTicketRepository,
        mikro: MikroSupportTicketRepository,
        config: AppConfigService,
      ) => (config.persistence.backend === 'in-memory' ? inMemory : mikro),
    },
    InMemorySupportMessageRepository,
    MikroSupportMessageRepository,
    {
      provide: SUPPORT_MESSAGE_REPOSITORY,
      inject: [InMemorySupportMessageRepository, MikroSupportMessageRepository, AppConfigService],
      useFactory: (
        inMemory: InMemorySupportMessageRepository,
        mikro: MikroSupportMessageRepository,
        config: AppConfigService,
      ) => (config.persistence.backend === 'in-memory' ? inMemory : mikro),
    },
    InMemorySupportTicketAttachmentRepository,
    MikroSupportTicketAttachmentRepository,
    {
      provide: SUPPORT_TICKET_ATTACHMENT_REPOSITORY,
      inject: [InMemorySupportTicketAttachmentRepository, MikroSupportTicketAttachmentRepository, AppConfigService],
      useFactory: (
        inMemory: InMemorySupportTicketAttachmentRepository,
        mikro: MikroSupportTicketAttachmentRepository,
        config: AppConfigService,
      ) => (config.persistence.backend === 'in-memory' ? inMemory : mikro),
    },
    InMemorySupportTicketCsatRepository,
    MikroSupportTicketCsatRepository,
    {
      provide: SUPPORT_TICKET_CSAT_REPOSITORY,
      inject: [InMemorySupportTicketCsatRepository, MikroSupportTicketCsatRepository, AppConfigService],
      useFactory: (
        inMemory: InMemorySupportTicketCsatRepository,
        mikro: MikroSupportTicketCsatRepository,
        config: AppConfigService,
      ) => (config.persistence.backend === 'in-memory' ? inMemory : mikro),
    },
    MyTicketCsatUseCases,
    GetMyTicketAttachmentLinkUseCase,
    { provide: TICKET_FILE_SCANNER, useClass: UnscannedTicketFileScanner },
    SupportTicketNotifierService,
    TicketAttachmentUploaderService,
    CreateSupportTicketUseCase,
    ListMySupportTicketsUseCase,
    GetMySupportTicketUseCase,
    ReplyToMySupportTicketUseCase,
    CloseMySupportTicketUseCase,
    ReopenMySupportTicketUseCase,
    AddMyTicketAttachmentUseCase,

    // Use cases
    LoginUseCase,
    ChangeSystemPasswordUseCase,
    CreateSystemAdminUseCase,
    CreateSystemAdminInviteUseCase,
    CreateSystemTenantUseCase,
    TrialDaysResolver,
    CreateSystemDeviceModelUseCase,
    CancelSystemAdminInviteUseCase,
    DeleteSystemTenantUseCase,
    DeleteSystemDeviceModelUseCase,
    ExportSystemDeviceInventoryUseCase,
    ExportSystemTenantsUseCase,
    RefreshUseCase,
    GetMeUseCase,
    GetHealthUseCase,
    InviteUserUseCase,
    ValidateInviteUseCase,
    RegisterInvitedUseCase,
    ForgotPasswordUseCase,
    ResendVerificationUseCase,
    GetTenantStatusUseCase,
    PaystackGateway,
    PaymentGatewayRegistry,
    // Bound once, here. Every use case that takes money depends on the port, so
    // a second provider is a change to this line rather than to those flows.
    { provide: PAYMENT_GATEWAY, useExisting: PaystackGateway },
    // Every adapter that could have sent a callback. Adding a provider means
    // adding it to this list; the webhook endpoint itself does not change.
    {
      provide: PAYMENT_GATEWAYS,
      inject: [PaystackGateway],
      useFactory: (paystack: PaystackGateway) => [paystack],
    },
    SaveMailCredentialsUseCase,
    GetMailCredentialsUseCase,
    GetClickToCallCredentialsUseCase,
    DeleteMailCredentialsUseCase,
    ImapMailboxReader,
    SmtpImapMailSender,
    { provide: MAILBOX_READER, useExisting: ImapMailboxReader },
    { provide: MAILBOX_FLAGS_WRITER, useExisting: ImapMailboxReader },
    { provide: MAILBOX_SENDER, useExisting: SmtpImapMailSender },
    InMemoryMailboxRepository,
    MikroMailboxRepository,
    {
      provide: MAILBOX_REPOSITORY,
      inject: [InMemoryMailboxRepository, MikroMailboxRepository, AppConfigService],
      useFactory: (
        inMemory: MailboxRepository,
        mikro: MailboxRepository,
        config: AppConfigService,
      ): MailboxRepository =>
        config.persistence.backend === 'mikro-orm' ? mikro : inMemory,
    },
    SyncMailboxUseCase,
    SendMailUseCase,
    ListMailboxUseCase,
    DownloadAttachmentUseCase,
    UpdateMessageFlagsUseCase,
    PlatformAlertSettingsUseCase,
    CommunicationRateService,
    ChargeUsageUseCase,
    EntitlementService,
    UpdatePlanEntitlementsUseCase,
    StorageQuotaService,
    FleetFactsService,
    PlatformAlertPublisher,
    TenantNotificationPublisher,
    RequestOrganisationUpgradeUseCase,
    ReviewOrganisationUpgradeUseCase,
    InMemoryOrganisationUpgradeRepository,
    MikroOrganisationUpgradeRepository,
    {
      provide: ORGANISATION_UPGRADE_REPOSITORY,
      inject: [
        InMemoryOrganisationUpgradeRepository,
        MikroOrganisationUpgradeRepository,
        AppConfigService,
      ],
      useFactory: (
        inMemory: OrganisationUpgradeRepository,
        mikro: OrganisationUpgradeRepository,
        config: AppConfigService,
      ): OrganisationUpgradeRepository =>
        config.persistence.backend === 'mikro-orm' ? mikro : inMemory,
    },
    StorageReconciliationService,
    InMemoryStorageUsageRepository,
    MikroStorageUsageRepository,
    {
      provide: STORAGE_USAGE_REPOSITORY,
      inject: [InMemoryStorageUsageRepository, MikroStorageUsageRepository, AppConfigService],
      useFactory: (
        inMemory: StorageUsageRepository,
        mikro: StorageUsageRepository,
        config: AppConfigService,
      ): StorageUsageRepository =>
        config.persistence.backend === 'mikro-orm' ? mikro : inMemory,
    },
    PlanEntitlementsBootstrapService,
    InMemoryPlanEntitlementsRepository,
    MikroPlanEntitlementsRepository,
    {
      provide: PLAN_ENTITLEMENTS_REPOSITORY,
      inject: [
        InMemoryPlanEntitlementsRepository,
        MikroPlanEntitlementsRepository,
        AppConfigService,
      ],
      useFactory: (
        inMemory: PlanEntitlementsRepository,
        mikro: PlanEntitlementsRepository,
        config: AppConfigService,
      ): PlanEntitlementsRepository =>
        config.persistence.backend === 'mikro-orm' ? mikro : inMemory,
    },
    SimRecurringChargeService,
    InMemoryCommunicationRatesRepository,
    MikroCommunicationRatesRepository,
    {
      provide: COMMUNICATION_RATES_REPOSITORY,
      inject: [
        InMemoryCommunicationRatesRepository,
        MikroCommunicationRatesRepository,
        AppConfigService,
      ],
      useFactory: (
        inMemory: CommunicationRatesRepository,
        mikro: CommunicationRatesRepository,
        config: AppConfigService,
      ): CommunicationRatesRepository =>
        config.persistence.backend === 'mikro-orm' ? mikro : inMemory,
    },
    InMemoryPlatformAlertSettingsRepository,
    MikroPlatformAlertSettingsRepository,
    {
      provide: PLATFORM_ALERT_SETTINGS_REPOSITORY,
      inject: [
        InMemoryPlatformAlertSettingsRepository,
        MikroPlatformAlertSettingsRepository,
        AppConfigService,
      ],
      useFactory: (
        inMemory: PlatformAlertSettingsRepository,
        mikro: PlatformAlertSettingsRepository,
        config: AppConfigService,
      ): PlatformAlertSettingsRepository =>
        config.persistence.backend === 'mikro-orm' ? mikro : inMemory,
    },
    InMemoryAdminNotificationRepository,
    MikroAdminNotificationRepository,
    {
      provide: ADMIN_NOTIFICATION_REPOSITORY,
      inject: [InMemoryAdminNotificationRepository, MikroAdminNotificationRepository, AppConfigService],
      useFactory: (
        inMemory: AdminNotificationRepository,
        mikro: AdminNotificationRepository,
        config: AppConfigService,
      ): AdminNotificationRepository =>
        config.persistence.backend === 'mikro-orm' ? mikro : inMemory,
    },
    AdminNotificationsUseCases,
    SendTestAlertUseCase,
    UpdatePlatformIntegrationCredentialsUseCase,
    AiRouterService,
    InMemoryPlatformIntegrationCredentialsRepository,
    MikroPlatformIntegrationCredentialsRepository,
    {
      provide: PLATFORM_INTEGRATION_CREDENTIALS_REPOSITORY,
      inject: [
        InMemoryPlatformIntegrationCredentialsRepository,
        MikroPlatformIntegrationCredentialsRepository,
        AppConfigService,
      ],
      useFactory: (
        inMemory: PlatformIntegrationCredentialsRepository,
        mikro: PlatformIntegrationCredentialsRepository,
        config: AppConfigService,
      ): PlatformIntegrationCredentialsRepository =>
        config.persistence.backend === 'mikro-orm' ? mikro : inMemory,
    },
    // The only piece that decides where the sync runs. Moving the mail work to
    // its own service means moving this registration, not the logic.
    MailboxSyncScheduler,
    ImapMailboxWatcher,
    { provide: MAILBOX_WATCHER, useExisting: ImapMailboxWatcher },
    MailboxIdleSupervisor,
    InMemoryMailCredentialsRepository,
    MikroMailCredentialsRepository,
    {
      provide: MAIL_CREDENTIALS_REPOSITORY,
      inject: [InMemoryMailCredentialsRepository, MikroMailCredentialsRepository, AppConfigService],
      useFactory: (
        inMemory: MailCredentialsRepository,
        mikro: MailCredentialsRepository,
        config: AppConfigService,
      ): MailCredentialsRepository =>
        config.persistence.backend === 'mikro-orm' ? mikro : inMemory,
    },
    VerifyResetUseCase,
    ResetPasswordUseCase,
    ChangeRoleUseCase,
    LogoutUseCase,
    GetProfileUseCase,
    ListSystemAdminsUseCase,
    ListOrganizationUsersUseCase,
    UpdateProfileUseCase,
    UpdateOrganizationUserUseCase,
    UpdateOrganizationUserStatusUseCase,
    UpdateSystemAdminStatusUseCase,
    DeleteSystemAdminUseCase,
    ResendPendingInviteUseCase,
    RemoveOrganizationUserUseCase,
    GetNotificationPreferencesUseCase,
    UpdateNotificationPreferencesUseCase,
    GetDispatcherPreferencesUseCase,
    UpdateDispatcherPreferencesUseCase,
    GetOrganizationSettingsUseCase,
    UpdateOrganizationSettingsUseCase,
    VerifyEmailUseCase,
    CompleteProfileUseCase,
    ActivityLogService,
    ActivityLogListener,
    ComplianceReminderListener,
    GetActivityLogUseCase,
    GetSystemSettingsUseCase,
    GetSystemDashboardUseCase,
    GetSystemDeviceCatalogReferenceDataUseCase,
    GetSystemDeviceSummaryUseCase,
    GetSystemSubscriptionPlansUseCase,
    UpdateSubscriptionPlanPriceUseCase,
    GetSystemActivityLogUseCase,
    ListSystemAdminInvitesUseCase,
    ListMisplacedSystemAccountsUseCase,
    InternalCallerService,
    OnboardingGate,
    OnboardingSettledGuard,
    AuthRefusalReporter,
    AccessRefusedListener,
    ...accessProviders({ callers: AuthCallerAudience, reporter: AuthRefusalReporter, permissions: AuthPermissions }),
    ListSystemDeviceCatalogUseCase,
    ListSystemDeviceInventoryUseCase,
    ListStillReportingDevicesUseCase,
    ListUnrecognisedDevicesUseCase,
    ManageUnrecognisedDeviceUseCase,
    TrackingGateClient,
    GetSystemDeviceDetailUseCase,
    ListSystemFeatureFlagsUseCase,
    ListSystemTenantsUseCase,
    GetSystemTenantBillingUseCase,
    InMemoryTenantCollectionsRepository,
    MikroTenantCollectionsRepository,
    {
      provide: TENANT_COLLECTIONS_REPOSITORY,
      inject: [InMemoryTenantCollectionsRepository, MikroTenantCollectionsRepository, AppConfigService],
      useFactory: (
        inMemory: InMemoryTenantCollectionsRepository,
        mikro: MikroTenantCollectionsRepository,
        config: AppConfigService,
      ) => (config.persistence.backend === 'in-memory' ? inMemory : mikro),
    },
    GetSystemTenantsSummaryUseCase,
    GetSystemRevenueByMonthUseCase,
    GetSystemDeviceManufacturersUseCase,
    GetSystemDeviceMessageRateUseCase,
    GetSystemTenantGrowthUseCase,
    GetSystemSimDataUsageUseCase,
    SimUsageSnapshotService,
    InMemorySimUsageRepository,
    MikroSimUsageRepository,
    {
      provide: SIM_USAGE_REPOSITORY,
      inject: [InMemorySimUsageRepository, MikroSimUsageRepository, AppConfigService],
      useFactory: (
        inMemory: InMemorySimUsageRepository,
        mikro: MikroSimUsageRepository,
        config: AppConfigService,
      ) => (config.persistence.backend === 'in-memory' ? inMemory : mikro),
    },
    InMemoryTenantQuotaOverridesRepository,
    MikroTenantQuotaOverridesRepository,
    {
      provide: TENANT_QUOTA_OVERRIDES_REPOSITORY,
      inject: [InMemoryTenantQuotaOverridesRepository, MikroTenantQuotaOverridesRepository, AppConfigService],
      useFactory: (
        inMemory: InMemoryTenantQuotaOverridesRepository,
        mikro: MikroTenantQuotaOverridesRepository,
        config: AppConfigService,
      ) => (config.persistence.backend === 'in-memory' ? inMemory : mikro),
    },
    UpdateTenantQuotasUseCase,
    InMemoryTenantTrialRepository,
    MikroTenantTrialRepository,
    {
      provide: TENANT_TRIAL_REPOSITORY,
      inject: [InMemoryTenantTrialRepository, MikroTenantTrialRepository, AppConfigService],
      useFactory: (
        inMemory: InMemoryTenantTrialRepository,
        mikro: MikroTenantTrialRepository,
        config: AppConfigService,
      ) => (config.persistence.backend === 'in-memory' ? inMemory : mikro),
    },
    ExtendTenantTrialUseCase,
    ConvertTenantTrialUseCase,
    InMemoryTenantDataExportRepository,
    MikroTenantDataExportRepository,
    {
      provide: TENANT_DATA_EXPORT_REPOSITORY,
      inject: [InMemoryTenantDataExportRepository, MikroTenantDataExportRepository, AppConfigService],
      useFactory: (
        inMemory: InMemoryTenantDataExportRepository,
        mikro: MikroTenantDataExportRepository,
        config: AppConfigService,
      ) => (config.persistence.backend === 'in-memory' ? inMemory : mikro),
    },
    InMemoryTenantExportFileStore,
    ObjectStorageTenantExportFileStore,
    {
      provide: TENANT_EXPORT_FILE_STORE,
      inject: [InMemoryTenantExportFileStore, ObjectStorageTenantExportFileStore, AppConfigService],
      useFactory: (
        inMemory: InMemoryTenantExportFileStore,
        objectStorage: ObjectStorageTenantExportFileStore,
        config: AppConfigService,
      ) => (config.persistence.backend === 'in-memory' ? inMemory : objectStorage),
    },
    TenantExportBuilder,
    RequestTenantExportUseCase,
    ListTenantExportsUseCase,
    DownloadTenantExportUseCase,
    InMemoryTenantGrowthRepository,
    MikroTenantGrowthRepository,
    {
      provide: TENANT_GROWTH_REPOSITORY,
      inject: [InMemoryTenantGrowthRepository, MikroTenantGrowthRepository, AppConfigService],
      useFactory: (
        inMemory: InMemoryTenantGrowthRepository,
        mikro: MikroTenantGrowthRepository,
        config: AppConfigService,
      ) => (config.persistence.backend === 'in-memory' ? inMemory : mikro),
    },
    GetSystemTenantUseCase,
    GetSystemTenantOnboardingReferenceDataUseCase,
    ResendSystemAdminInviteUseCase,
    ResendSystemTenantInviteUseCase,
    UpdateSystemDeviceModelUseCase,
    UpdateSystemFeatureFlagUseCase,
    UpdateSystemSettingsUseCase,
    SystemSettingsChangedPublisher,
    UpdateSystemTenantUseCase,
    UpdateSystemTenantStatusUseCase,
    ExportSystemSimsUseCase,
    GetSystemSimSummaryUseCase,
    GetSystemSimCarrierBreakdownUseCase,
    ListSystemSimBatchesUseCase,
    ListSystemSimRequestsUseCase,
    ListSystemSimsUseCase,
    GetSystemSupportDashboardUseCase,
    ListSystemSupportTicketsUseCase,
    GetSystemSupportTicketUseCase,
    UpdateSystemSupportTicketStatusUseCase,
    AssignSystemSupportTicketUseCase,
    EscalateSystemSupportTicketUseCase,
    ListSystemSupportTicketMessagesUseCase,
    SendSystemSupportMessageUseCase,
    ExportSystemDeviceCatalogUseCase,
    GetSystemHealthUseCase,
    ExportSystemSupportTicketsUseCase,
    ListSystemEscalatedTicketsUseCase,
    InMemoryDeviceSetupRequestRepository,
    MikroDeviceSetupRequestRepository,
    {
      provide: DEVICE_SETUP_REQUEST_REPOSITORY,
      inject: [InMemoryDeviceSetupRequestRepository, MikroDeviceSetupRequestRepository, AppConfigService],
      useFactory: (
        inMemory: InMemoryDeviceSetupRequestRepository,
        mikro: MikroDeviceSetupRequestRepository,
        config: AppConfigService,
      ) => (config.persistence.backend === 'in-memory' ? inMemory : mikro),
    },
    ListSystemDeviceSetupRequestsUseCase,
    ExportSystemDeviceSetupRequestsUseCase,
    GetSystemSimDetailUseCase,
    UpdateSystemSimUseCase,
    ReassignSystemSimUseCase,
    SuspendSystemSimUseCase,
    CreateSystemSimUseCase,
    ImportSystemSimsUseCase,
    DeleteSystemSimUseCase,
    BulkSystemSimStatusUseCase,
    GetSystemSimImportTemplateUseCase,
    GetSystemSimRequestsSummaryUseCase,
    ExportSystemSimRequestsUseCase,
    ApproveSystemSimRequestUseCase,
    RejectSystemSimRequestUseCase,
    GetSystemSimBatchesSummaryUseCase,
    GetSystemSimBatchDetailUseCase,
    ExportSystemSimBatchesUseCase,
    RetrySystemSimBatchUseCase,
    GetSystemDeviceSetupRequestUseCase,
    AssignSystemDeviceSetupRequestUseCase,
    RejectSystemDeviceSetupRequestUseCase,
    ApproveSystemDeviceSetupRequestUseCase,
    ConfirmSystemDeviceSetupPaymentUseCase,
    DeviceSetupRequestPricingService,
    InstallerDeviceSetupRequestsUseCases,
    SuspendSystemDeviceUseCase,
    ReinstateSystemDeviceUseCase,
    DecommissionSystemDeviceUseCase,
    UpdateSystemDeviceUseCase,
    AssignSystemDevicesUseCase,
    ImportSystemDeviceStockUseCase,
    SendTestTelemetryUseCase,
    GetSystemDeviceSetupSummaryUseCase,
    SuperAdminBootstrapService,
    // Onboarding repositories
    InMemoryTenantBusinessInfoRepository,
    MikroTenantBusinessInfoRepository,
    {
      provide: TENANT_BUSINESS_INFO_REPOSITORY,
      inject: [InMemoryTenantBusinessInfoRepository, MikroTenantBusinessInfoRepository, AppConfigService],
      useFactory: (inMemory: InMemoryTenantBusinessInfoRepository, mikro: MikroTenantBusinessInfoRepository, config: AppConfigService) =>
        config.persistence.backend === 'in-memory' ? inMemory : mikro,
    },
    InMemoryKycDocumentRepository,
    MikroKycDocumentRepository,
    {
      provide: KYC_DOCUMENT_REPOSITORY,
      inject: [InMemoryKycDocumentRepository, MikroKycDocumentRepository, AppConfigService],
      useFactory: (inMemory: InMemoryKycDocumentRepository, mikro: MikroKycDocumentRepository, config: AppConfigService) =>
        config.persistence.backend === 'in-memory' ? inMemory : mikro,
    },
    CreateOnboardingApplicationUseCase,
    InMemoryM2mLicensePlanRepository,
    MikroM2mLicensePlanRepository,
    {
      provide: M2M_LICENSE_PLAN_REPOSITORY,
      inject: [
        InMemoryM2mLicensePlanRepository,
        MikroM2mLicensePlanRepository,
        AppConfigService,
      ],
      useFactory: (
        inMemory: InMemoryM2mLicensePlanRepository,
        mikro: MikroM2mLicensePlanRepository,
        config: AppConfigService,
      ) => (config.persistence.backend === 'in-memory' ? inMemory : mikro),
    },
    GetM2mLicensePlansUseCase,
    InMemoryBillingPriceChangeRepository,
    MikroBillingPriceChangeRepository,
    {
      provide: BILLING_PRICE_CHANGE_REPOSITORY,
      inject: [InMemoryBillingPriceChangeRepository, MikroBillingPriceChangeRepository, AppConfigService],
      useFactory: (
        inMemory: InMemoryBillingPriceChangeRepository,
        mikro: MikroBillingPriceChangeRepository,
        config: AppConfigService,
      ) => (config.persistence.backend === 'in-memory' ? inMemory : mikro),
    },
    InMemoryBillingSettingsRepository,
    MikroBillingSettingsRepository,
    {
      provide: BILLING_SETTINGS_REPOSITORY,
      inject: [InMemoryBillingSettingsRepository, MikroBillingSettingsRepository, AppConfigService],
      useFactory: (
        inMemory: InMemoryBillingSettingsRepository,
        mikro: MikroBillingSettingsRepository,
        config: AppConfigService,
      ) => (config.persistence.backend === 'in-memory' ? inMemory : mikro),
    },
    InMemoryEnforcementSettingsRepository,
    MikroEnforcementSettingsRepository,
    {
      provide: ENFORCEMENT_SETTINGS_REPOSITORY,
      inject: [InMemoryEnforcementSettingsRepository, MikroEnforcementSettingsRepository, AppConfigService],
      useFactory: (
        inMemory: InMemoryEnforcementSettingsRepository,
        mikro: MikroEnforcementSettingsRepository,
        config: AppConfigService,
      ) => (config.persistence.backend === 'in-memory' ? inMemory : mikro),
    },
    InMemoryEnforcementQueriesRepository,
    MikroEnforcementQueriesRepository,
    {
      provide: ENFORCEMENT_QUERIES_REPOSITORY,
      inject: [InMemoryEnforcementQueriesRepository, MikroEnforcementQueriesRepository, AppConfigService],
      useFactory: (
        inMemory: InMemoryEnforcementQueriesRepository,
        mikro: MikroEnforcementQueriesRepository,
        config: AppConfigService,
      ) => (config.persistence.backend === 'in-memory' ? inMemory : mikro),
    },
    EnforcementPlanService,
    TenantSuspensionService,
    InMemoryArrearsRepository,
    MikroArrearsRepository,
    {
      provide: ARREARS_REPOSITORY,
      inject: [InMemoryArrearsRepository, MikroArrearsRepository, AppConfigService],
      useFactory: (
        inMemory: InMemoryArrearsRepository,
        mikro: MikroArrearsRepository,
        config: AppConfigService,
      ) => (config.persistence.backend === 'in-memory' ? inMemory : mikro),
    },
    InMemoryEnforcementNoticeRepository,
    MikroEnforcementNoticeRepository,
    {
      provide: ENFORCEMENT_NOTICE_REPOSITORY,
      inject: [InMemoryEnforcementNoticeRepository, MikroEnforcementNoticeRepository, AppConfigService],
      useFactory: (
        inMemory: InMemoryEnforcementNoticeRepository,
        mikro: MikroEnforcementNoticeRepository,
        config: AppConfigService,
      ) => (config.persistence.backend === 'in-memory' ? inMemory : mikro),
    },
    InMemoryEnforcementRunRepository,
    MikroEnforcementRunRepository,
    {
      provide: ENFORCEMENT_RUN_REPOSITORY,
      inject: [InMemoryEnforcementRunRepository, MikroEnforcementRunRepository, AppConfigService],
      useFactory: (
        inMemory: InMemoryEnforcementRunRepository,
        mikro: MikroEnforcementRunRepository,
        config: AppConfigService,
      ) => (config.persistence.backend === 'in-memory' ? inMemory : mikro),
    },
    MailerEnforcementNotifier,
    { provide: ENFORCEMENT_NOTIFIER, useExisting: MailerEnforcementNotifier },
    EnforcementAudit,
    EnforcementNoticeService,
    EnforcementRestoreService,
    EnforcementSweepService,
    InMemoryLicencePeriodRepository,
    MikroLicencePeriodRepository,
    {
      provide: LICENCE_PERIOD_REPOSITORY,
      inject: [InMemoryLicencePeriodRepository, MikroLicencePeriodRepository, AppConfigService],
      useFactory: (
        inMemory: InMemoryLicencePeriodRepository,
        mikro: MikroLicencePeriodRepository,
        config: AppConfigService,
      ) => (config.persistence.backend === 'in-memory' ? inMemory : mikro),
    },
    InMemoryRenewalFactsReader,
    MikroRenewalFactsReader,
    {
      provide: RENEWAL_FACTS_READER,
      inject: [InMemoryRenewalFactsReader, MikroRenewalFactsReader, AppConfigService],
      useFactory: (
        inMemory: InMemoryRenewalFactsReader,
        mikro: MikroRenewalFactsReader,
        config: AppConfigService,
      ) => (config.persistence.backend === 'in-memory' ? inMemory : mikro),
    },
    RenewalAudit,
    RenewalInvoiceService,
    RenewalSweepService,
    BundleExpirySweepService,
    SettleRenewalPaymentUseCase,
    ListTenantInvoicesUseCase,
    GetTenantInvoiceUseCase,
    GetTenantLicenceUseCase,
    ListTenantQuotationsUseCase,
    GetTenantQuotationUseCase,
    ListTenantPaymentsUseCase,
    GetTenantPaymentUseCase,
    GetTenantBillingOverviewUseCase,
    ListTenantBillingActivityUseCase,
    PayRenewalFromWalletUseCase,
    PayRenewalByCardUseCase,
    GetEnforcementSettingsUseCase,
    UpdateEnforcementSettingsUseCase,
    ListEnforcementUseCase,
    PreviewEnforcementUseCase,
    ActivityLogBillingAudit,
    { provide: BILLING_AUDIT, useExisting: ActivityLogBillingAudit },
    BillingActorResolver,
    ListLicensePlansUseCase,
    GetLicensePlanUseCase,
    CreateLicensePlanUseCase,
    UpdateLicensePlanUseCase,
    SetLicensePlanActiveUseCase,
    ListPriceChangesUseCase,
    InMemoryQuotationRepository,
    MikroQuotationRepository,
    {
      provide: QUOTATION_REPOSITORY,
      inject: [InMemoryQuotationRepository, MikroQuotationRepository, AppConfigService],
      useFactory: (
        inMemory: InMemoryQuotationRepository,
        mikro: MikroQuotationRepository,
        config: AppConfigService,
      ) => (config.persistence.backend === 'in-memory' ? inMemory : mikro),
    },
    InvoiceSeriesQuotationNumbers,
    { provide: QUOTATION_NUMBER_ALLOCATOR, useExisting: InvoiceSeriesQuotationNumbers },
    OrderQuotationService,
    ListQuotationsUseCase,
    GetQuotationUseCase,
    InMemoryInvoiceRepository,
    MikroInvoiceRepository,
    {
      provide: INVOICE_REPOSITORY,
      inject: [InMemoryInvoiceRepository, MikroInvoiceRepository, AppConfigService],
      useFactory: (
        inMemory: InMemoryInvoiceRepository,
        mikro: MikroInvoiceRepository,
        config: AppConfigService,
      ) => (config.persistence.backend === 'in-memory' ? inMemory : mikro),
    },
    InMemoryPaymentHistoryRepository,
    MikroPaymentHistoryRepository,
    {
      provide: PAYMENT_HISTORY_REPOSITORY,
      inject: [InMemoryPaymentHistoryRepository, MikroPaymentHistoryRepository, AppConfigService],
      useFactory: (
        inMemory: InMemoryPaymentHistoryRepository,
        mikro: MikroPaymentHistoryRepository,
        config: AppConfigService,
      ) => (config.persistence.backend === 'in-memory' ? inMemory : mikro),
    },
    InMemoryBillingSummaryRepository,
    MikroBillingSummaryRepository,
    {
      provide: BILLING_SUMMARY_REPOSITORY,
      inject: [InMemoryBillingSummaryRepository, MikroBillingSummaryRepository, AppConfigService],
      useFactory: (
        inMemory: InMemoryBillingSummaryRepository,
        mikro: MikroBillingSummaryRepository,
        config: AppConfigService,
      ) => (config.persistence.backend === 'in-memory' ? inMemory : mikro),
    },
    InvoiceSeriesInvoiceNumbers,
    { provide: INVOICE_NUMBER_ALLOCATOR, useExisting: InvoiceSeriesInvoiceNumbers },
    MailerInvoiceNotifier,
    { provide: INVOICE_NOTIFIER, useExisting: MailerInvoiceNotifier },
    InvoiceIssuanceService,
    ListInvoicesUseCase,
    GetInvoiceUseCase,
    ListPaymentsUseCase,
    GetPaymentUseCase,
    GetBillingSummaryUseCase,
    GetInstallationPriceUseCase,
    UpdateInstallationPriceUseCase,
    InMemoryInstallerRepository,
    MikroInstallerRepository,
    {
      provide: INSTALLER_REPOSITORY,
      inject: [InMemoryInstallerRepository, MikroInstallerRepository, AppConfigService],
      useFactory: (
        inMemory: InMemoryInstallerRepository,
        mikro: MikroInstallerRepository,
        config: AppConfigService,
      ) => (config.persistence.backend === 'in-memory' ? inMemory : mikro),
    },
    InMemoryInstallationOrderRepository,
    MikroInstallationOrderRepository,
    {
      provide: INSTALLATION_ORDER_REPOSITORY,
      inject: [InMemoryInstallationOrderRepository, MikroInstallationOrderRepository, AppConfigService],
      useFactory: (
        inMemory: InMemoryInstallationOrderRepository,
        mikro: MikroInstallationOrderRepository,
        config: AppConfigService,
      ) => (config.persistence.backend === 'in-memory' ? inMemory : mikro),
    },
    InMemoryInstallationCompletion,
    MikroInstallationCompletion,
    {
      provide: INSTALLATION_COMPLETION,
      inject: [InMemoryInstallationCompletion, MikroInstallationCompletion, AppConfigService],
      useFactory: (
        inMemory: InMemoryInstallationCompletion,
        mikro: MikroInstallationCompletion,
        config: AppConfigService,
      ) => (config.persistence.backend === 'in-memory' ? inMemory : mikro),
    },
    InMemoryInstallationJobReader,
    MikroInstallationJobReader,
    {
      provide: INSTALLATION_JOB_READER,
      inject: [InMemoryInstallationJobReader, MikroInstallationJobReader, AppConfigService],
      useFactory: (
        inMemory: InMemoryInstallationJobReader,
        mikro: MikroInstallationJobReader,
        config: AppConfigService,
      ) => (config.persistence.backend === 'in-memory' ? inMemory : mikro),
    },
    { provide: JOB_DEVICE_LOOKUP, useClass: FleetJobDeviceLookup },
    { provide: INSTALLER_PHOTO_STORAGE, useClass: ObjectStorageInstallerPhotos },
    { provide: INSTALLATION_EVIDENCE_STORAGE, useClass: ObjectStorageInstallationEvidence },
    { provide: INSTALLER_TICKET_FILES, useClass: ObjectStorageInstallerTicketFiles },
    InMemoryJobIssueRecorder,
    MikroJobIssueRecorder,
    {
      provide: JOB_ISSUE_RECORDER,
      inject: [InMemoryJobIssueRecorder, MikroJobIssueRecorder, AppConfigService],
      useFactory: (
        inMemory: InMemoryJobIssueRecorder,
        mikro: MikroJobIssueRecorder,
        config: AppConfigService,
      ) => (config.persistence.backend === 'in-memory' ? inMemory : mikro),
    },
    { provide: INSTALLATION_FLEET, useClass: FleetInstallationAdapter },
    InMemoryInstallerNotificationRepository,
    MikroInstallerNotificationRepository,
    {
      provide: INSTALLER_NOTIFICATION_REPOSITORY,
      inject: [InMemoryInstallerNotificationRepository, MikroInstallerNotificationRepository, AppConfigService],
      useFactory: (
        inMemory: InMemoryInstallerNotificationRepository,
        mikro: MikroInstallerNotificationRepository,
        config: AppConfigService,
      ) => (config.persistence.backend === 'in-memory' ? inMemory : mikro),
    },
    InstallerNotifier,
    InstallerNotificationsUseCases,
    NotifyDeviceVerificationUseCase,
    DeviceVerificationListener,
    InstallerAssignmentService,
    IssueSetupLinkUseCase,
    ScheduleInstallationUseCase,
    SweepInstallationOrdersUseCase,
    InstallationSweepScheduler,
    InstallerLoginUseCase,
    ManageInstallersUseCases,
    ManageInstallationOrdersUseCases,
    InstallerJobsUseCases,
    InstallerProfileUseCases,
    ChangeInstallerPasswordUseCase,
    InstallerPreferencesUseCases,
    InstallerJobActionsUseCases,
    RejectJobOfferUseCase,
    InstallerJobRecordsUseCases,
    InstallerDeviceScopeUseCase,
    InstallerSupportUseCases,
    ReportJobIssueUseCase,
    AdminJobChangesUseCases,
    InstallerTicketContextService,
    { provide: INSTALLER_ACCOUNTS, useClass: InstallerAccountsAdapter },
    FleetConnectivityVerification,
    {
      provide: CONNECTIVITY_VERIFICATION,
      useExisting: FleetConnectivityVerification,
    },
    GetInstallationStatusUseCase,
    ConfirmInstallationUseCase,
    SubmitInstallationFeedbackUseCase,
    CancelInstallationUseCase,
    InMemoryOnboardingPaymentRepository,
    MikroOnboardingPaymentRepository,
    {
      provide: ONBOARDING_PAYMENT_REPOSITORY,
      inject: [
        InMemoryOnboardingPaymentRepository,
        MikroOnboardingPaymentRepository,
        AppConfigService,
      ],
      useFactory: (
        inMemory: InMemoryOnboardingPaymentRepository,
        mikro: MikroOnboardingPaymentRepository,
        config: AppConfigService,
      ) => (config.persistence.backend === 'in-memory' ? inMemory : mikro),
    },
    GetApplicationOrderUseCase,
    CreateApplicationPaymentUseCase,
    VerifyApplicationPaymentUseCase,
    CompleteApplicationPaymentUseCase,
    ConfirmApplicationPaymentUseCase,
    SetBillingEmailUseCase,
    GetOnboardingApplicationTimelineUseCase,
    M2mLicensePlansBootstrapService,
    InMemoryIndemnityAgreementRepository,
    MikroIndemnityAgreementRepository,
    {
      provide: INDEMNITY_AGREEMENT_REPOSITORY,
      inject: [
        InMemoryIndemnityAgreementRepository,
        MikroIndemnityAgreementRepository,
        AppConfigService,
      ],
      useFactory: (
        inMemory: InMemoryIndemnityAgreementRepository,
        mikro: MikroIndemnityAgreementRepository,
        config: AppConfigService,
      ) => (config.persistence.backend === 'in-memory' ? inMemory : mikro),
    },
    InMemoryIdentityClaimRepository,
    MikroIdentityClaimRepository,
    {
      provide: IDENTITY_CLAIM_REPOSITORY,
      inject: [
        InMemoryIdentityClaimRepository,
        MikroIdentityClaimRepository,
        AppConfigService,
      ],
      useFactory: (
        inMemory: InMemoryIdentityClaimRepository,
        mikro: MikroIdentityClaimRepository,
        config: AppConfigService,
      ) => (config.persistence.backend === 'in-memory' ? inMemory : mikro),
    },
    GetIndemnityTemplateUseCase,
    PdfSignedAgreementRenderer,
    {
      provide: SIGNED_AGREEMENT_RENDERER,
      useExisting: PdfSignedAgreementRenderer,
    },
    SignIndemnityAgreementUseCase,
    ResumeOnboardingApplicationUseCase,
    AbandonedApplicationSweepService,
    CompleteProvisioningUseCase,
    OnboardingProvisioningService,
    ApplicationDeviceAllocationService,
    ApplicationDeviceAllocationLedger,
    DeviceAllocationSweepService,
    OnboardingStageSweepService,
    ReviewOnboardingPaymentMismatchUseCase,
    RefundOnboardingPaymentUseCase,
    ApplicationPaymentNoticeService,
    RefundSettlementService,
    RefundReconciliationService,
    RefundReconciliationSweep,
    PaymentNoticeRetrySweep,
    ResendPaymentLinkUseCase,
    ResendChangesRequestedLinkUseCase,
    HttpDocumentExtractor,
    { provide: DOCUMENT_EXTRACTOR, useExisting: HttpDocumentExtractor },
    QoreIdKybAdapter,
    DojahKybAdapter,
    RoutedKybVerification,
    { provide: KYB_VERIFICATION, useExisting: RoutedKybVerification },
    InMemoryVerificationResultRepository,
    MikroVerificationResultRepository,
    {
      provide: VERIFICATION_RESULT_REPOSITORY,
      inject: [
        InMemoryVerificationResultRepository,
        MikroVerificationResultRepository,
        AppConfigService,
      ],
      useFactory: (
        inMemory: InMemoryVerificationResultRepository,
        mikro: MikroVerificationResultRepository,
        config: AppConfigService,
      ) => (config.persistence.backend === 'in-memory' ? inMemory : mikro),
    },
    VerifyApplicationAutomaticallyUseCase,
    ApplyAutomatedDecisionUseCase,
    IndemnityTemplateBootstrapService,
    AddApplicationVehicleUseCase,
    UpdateApplicationVehicleUseCase,
    RemoveApplicationVehicleUseCase,
    ImportApplicationVehiclesUseCase,
    RequestApplicationDevicesUseCase,
    OnboardingDeviceInventoryService,
    RemoveApplicationDeviceRequestUseCase,
    MailerOnboardingAdminNotifier,
    {
      provide: ONBOARDING_ADMIN_NOTIFIER,
      useExisting: MailerOnboardingAdminNotifier,
    },
    MailerOnboardingDecisionNotifier,
    {
      provide: ONBOARDING_DECISION_NOTIFIER,
      useExisting: MailerOnboardingDecisionNotifier,
    },
    MailerOnboardingVerificationNotifier,
    {
      provide: ONBOARDING_VERIFICATION_NOTIFIER,
      useExisting: MailerOnboardingVerificationNotifier,
    },
    SendOnboardingVerificationCodeUseCase,
    ConfirmOnboardingVerificationCodeUseCase,
    SubmitOnboardingApplicationUseCase,
    GetOnboardingApplicationStatusUseCase,
    ListOnboardingApplicationsUseCase,
    GetOnboardingReviewSummaryUseCase,
    GetOnboardingApplicationForReviewUseCase,
    GetOnboardingApplicationDocumentLinkUseCase,
    ReviewOnboardingApplicationDocumentUseCase,
    ApproveOnboardingApplicationUseCase,
    RejectOnboardingApplicationUseCase,
    RequestOnboardingApplicationChangesUseCase,
    ResendOnboardingSetupLinkUseCase,
    UploadOnboardingApplicationDocumentUseCase,
    DeleteOnboardingApplicationDocumentUseCase,
    GetOnboardingApplicationUseCase,
    UpdateOnboardingApplicationUseCase,
    InMemoryOnboardingApplicationRepository,
    MikroOnboardingApplicationRepository,
    MikroTakenEmailSource,
    { provide: TAKEN_EMAIL_SOURCE, useExisting: MikroTakenEmailSource },
    {
      provide: EMAIL_BITSET,
      inject: [REDIS_CLIENT],
      useFactory: (redis: unknown) => (redis ? new RedisEmailBitset(redis as BitRedis) : new InMemoryEmailBitset()),
    },
    EmailBloomService,
    CheckEmailAvailabilityUseCase,
    { provide: InMemoryPickupLocationRepository, useFactory: () => new InMemoryPickupLocationRepository() },
    MikroPickupLocationRepository,
    {
      provide: PICKUP_LOCATION_REPOSITORY,
      inject: [InMemoryPickupLocationRepository, MikroPickupLocationRepository, AppConfigService],
      useFactory: (inMemory: PickupLocationRepository, mikro: PickupLocationRepository, config: AppConfigService) =>
        config.persistence.backend === 'in-memory' ? inMemory : mikro,
    },
    ListPickupLocationsUseCase,
    SetApplicationFulfilmentUseCase,
    SubmitContactEnquiryUseCase,
    {
      provide: ONBOARDING_APPLICATION_REPOSITORY,
      inject: [InMemoryOnboardingApplicationRepository, MikroOnboardingApplicationRepository, AppConfigService],
      useFactory: (inMemory: InMemoryOnboardingApplicationRepository, mikro: MikroOnboardingApplicationRepository, config: AppConfigService) =>
        config.persistence.backend === 'in-memory' ? inMemory : mikro,
    },
    // Onboarding use cases
    PaymentEventService,
    GetOnboardingPlansUseCase,
    LowBalanceNotifierService,
    PlatformTopUpWalletUseCase,
    UpdateWalletCreditSettingsUseCase,
    ListTenantWalletsUseCase,
    ListCrossTenantLedgerUseCase,
    ExportTenantWalletsUseCase,
    ExportCrossTenantLedgerUseCase,
    CreatePaymentIntentUseCase,
    ActivateSubscriptionUseCase,
    SubscribePaymentEventsUseCase,
    SubmitEnterpriseEnquiryUseCase,
    GetSubscriptionCapsUseCase,
    GetBusinessInfoUseCase,
    SaveBusinessInfoUseCase,
    ListKycDocumentsUseCase,
    GetOnboardingStatusUseCase,
    SaveKycDocumentUseCase,
    ListKycReviewQueueUseCase,
    ApproveKycDocumentUseCase,
    RejectKycDocumentUseCase,
    DeleteKycDocumentUseCase,
    RegisterSimsUseCase,
    ImportSimsCsvUseCase,
    SubmitSimProvisioningRequestUseCase,
    SaveFeatureTogglesUseCase,
    CompleteOnboardingUseCase,
    // SIM device info listener
    SimDeviceInfoListener,
    EventBusSimChangedEventPublisher,
    { provide: SIM_CHANGED_EVENT_PUBLISHER, useExisting: EventBusSimChangedEventPublisher },
    // Bundle carrier repository
    InMemoryBundleCarrierRepository,
    MikroBundleCarrierRepository,
    InMemoryTelecomMasterRepository,
    MikroTelecomMasterRepository,
    {
      provide: TELECOM_MASTER_REPOSITORY,
      inject: [InMemoryTelecomMasterRepository, MikroTelecomMasterRepository, AppConfigService],
      useFactory: (inMemory: InMemoryTelecomMasterRepository, mikro: MikroTelecomMasterRepository, config: AppConfigService) =>
        config.persistence.backend === 'in-memory' ? inMemory : mikro,
    },
    ListTelecomMasterRequestsUseCase,
    GetTelecomMasterRequestUseCase,
    RetryTelecomMasterRequestUseCase,
    ResolveTelecomMasterRequestUseCase,
    TenantTelecomMasterUseCases,
    ApplicationTelecomMasterUseCases,
    {
      provide: BUNDLE_CARRIER_REPOSITORY,
      inject: [InMemoryBundleCarrierRepository, MikroBundleCarrierRepository, AppConfigService],
      useFactory: (inMemory: InMemoryBundleCarrierRepository, mikro: MikroBundleCarrierRepository, config: AppConfigService) =>
        config.persistence.backend === 'in-memory' ? inMemory : mikro,
    },
    // Bundle catalog repository
    InMemoryBundleCatalogRepository,
    MikroBundleCatalogRepository,
    {
      provide: BUNDLE_CATALOG_REPOSITORY,
      inject: [InMemoryBundleCatalogRepository, MikroBundleCatalogRepository, AppConfigService],
      useFactory: (inMemory: InMemoryBundleCatalogRepository, mikro: MikroBundleCatalogRepository, config: AppConfigService) =>
        config.persistence.backend === 'in-memory' ? inMemory : mikro,
    },
    // MTN M2M catalogue and price sync
    MtnM2mClient,
    MtnBundleCatalogSyncService,
    MtnBundleCatalogSweepService,
    SyncMtnBundleCatalogUseCase,
    // Tenant wallet repository
    InMemoryTenantWalletRepository,
    MikroTenantWalletRepository,
    {
      provide: TENANT_WALLET_REPOSITORY,
      inject: [InMemoryTenantWalletRepository, MikroTenantWalletRepository, AppConfigService],
      useFactory: (inMemory: InMemoryTenantWalletRepository, mikro: MikroTenantWalletRepository, config: AppConfigService) =>
        config.persistence.backend === 'in-memory' ? inMemory : mikro,
    },
    // Wallet top-up repository
    InMemoryWalletTopUpRepository,
    MikroWalletTopUpRepository,
    {
      provide: WALLET_TOP_UP_REPOSITORY,
      inject: [InMemoryWalletTopUpRepository, MikroWalletTopUpRepository, AppConfigService],
      useFactory: (inMemory: InMemoryWalletTopUpRepository, mikro: MikroWalletTopUpRepository, config: AppConfigService) =>
        config.persistence.backend === 'in-memory' ? inMemory : mikro,
    },
    // Spending limit repository
    InMemorySpendingLimitRepository,
    MikroSpendingLimitRepository,
    {
      provide: SPENDING_LIMIT_REPOSITORY,
      inject: [InMemorySpendingLimitRepository, MikroSpendingLimitRepository, AppConfigService],
      useFactory: (inMemory: InMemorySpendingLimitRepository, mikro: MikroSpendingLimitRepository, config: AppConfigService) =>
        config.persistence.backend === 'in-memory' ? inMemory : mikro,
    },
    // Auto top-up repository
    InMemoryAutoTopUpRepository,
    MikroAutoTopUpRepository,
    {
      provide: AUTO_TOP_UP_REPOSITORY,
      inject: [InMemoryAutoTopUpRepository, MikroAutoTopUpRepository, AppConfigService],
      useFactory: (inMemory: InMemoryAutoTopUpRepository, mikro: MikroAutoTopUpRepository, config: AppConfigService) =>
        config.persistence.backend === 'in-memory' ? inMemory : mikro,
    },
    // Bundle allocation repository
    InMemoryBundleAllocationRepository,
    MikroBundleAllocationRepository,
    {
      provide: BUNDLE_ALLOCATION_REPOSITORY,
      inject: [InMemoryBundleAllocationRepository, MikroBundleAllocationRepository, AppConfigService],
      useFactory: (inMemory: InMemoryBundleAllocationRepository, mikro: MikroBundleAllocationRepository, config: AppConfigService) =>
        config.persistence.backend === 'in-memory' ? inMemory : mikro,
    },
    // Bundle transaction repository
    InMemoryBundleTransactionRepository,
    MikroBundleTransactionRepository,
    {
      provide: BUNDLE_TRANSACTION_REPOSITORY,
      inject: [InMemoryBundleTransactionRepository, MikroBundleTransactionRepository, AppConfigService],
      useFactory: (inMemory: InMemoryBundleTransactionRepository, mikro: MikroBundleTransactionRepository, config: AppConfigService) =>
        config.persistence.backend === 'in-memory' ? inMemory : mikro,
    },
    // Device mapping file repository
    InMemoryDeviceMappingFileRepository,
    MikroDeviceMappingFileRepository,
    {
      provide: DEVICE_MAPPING_FILE_REPOSITORY,
      inject: [InMemoryDeviceMappingFileRepository, MikroDeviceMappingFileRepository, AppConfigService],
      useFactory: (inMemory: InMemoryDeviceMappingFileRepository, mikro: MikroDeviceMappingFileRepository, config: AppConfigService) =>
        config.persistence.backend === 'in-memory' ? inMemory : mikro,
    },
    // SIM inventory use cases
    ListTenantSimsUseCase,
    GetTenantSimUseCase,
    RegisterTenantSimUseCase,
    UpdateTenantSimUseCase,
    SuspendTenantSimUseCase,
    ReactivateTenantSimUseCase,
    UnassignDeviceFromSimUseCase,
    DeleteTenantSimUseCase,
    ExportTenantSimsUseCase,
    GetSimImportTemplateUseCase,
    ImportTenantSimsCsvUseCase,
    // SIM request use cases
    ListTenantSimRequestsUseCase,
    GetTenantSimRequestUseCase,
    SubmitTenantSimRequestUseCase,
    GetDeviceMappingTemplateUseCase,
    UploadDeviceMappingCsvUseCase,
    // Carrier / bundle catalog
    ListCarriersUseCase,
    CreateSystemCarrierUseCase,
    UpdateSystemCarrierUseCase,
    ListBundleCatalogUseCase,
    ListSystemBundleCatalogUseCase,
    CreateSystemBundleUseCase,
    UpdateSystemBundleUseCase,
    DeleteSystemBundleUseCase,
    GetSystemBundleAdoptionUseCase,
    // Data bundle dashboard
    GetBundleSummaryUseCase,
    GetWalletBalanceUseCase,
    InMemoryInvoiceNumberRepository,
    MikroInvoiceNumberRepository,
    {
      provide: INVOICE_NUMBER_REPOSITORY,
      inject: [InMemoryInvoiceNumberRepository, MikroInvoiceNumberRepository, AppConfigService],
      useFactory: (
        inMemory: InMemoryInvoiceNumberRepository,
        mikro: MikroInvoiceNumberRepository,
        config: AppConfigService,
      ) => (config.persistence.backend === 'in-memory' ? inMemory : mikro),
    },
    InvoiceNumberService,
    InMemoryWalletLedgerRepository,
    MikroWalletLedgerRepository,
    {
      provide: WALLET_LEDGER_REPOSITORY,
      inject: [InMemoryWalletLedgerRepository, MikroWalletLedgerRepository, AppConfigService],
      useFactory: (
        inMemory: InMemoryWalletLedgerRepository,
        mikro: MikroWalletLedgerRepository,
        config: AppConfigService,
      ) => (config.persistence.backend === 'in-memory' ? inMemory : mikro),
    },
    ListWalletLedgerUseCase,
    SpendingLimitService,
    TopupWalletUseCase,
    SettleWalletTopUpUseCase,
    GetSpendingLimitUseCase,
    SaveSpendingLimitUseCase,
    DisableSpendingLimitUseCase,
    GetAutoTopupUseCase,
    SaveAutoTopupUseCase,
    DisableAutoTopupUseCase,
    ListBundleAllocationsUseCase,
    GetBundleAllocationUseCase,
    ExportBundleAllocationsUseCase,
    AllocateBundleUseCase,
    ListSimsForAllocationUseCase,
    ListBundleTransactionsUseCase,
    ExportBundleTransactionsUseCase,
    GetSpendTrendUseCase,
    GetSpendBreakdownUseCase,
    GetCommunicationsRatesUseCase,
    GetCommunicationsSpendBreakdownUseCase,
    GetCommunicationsSpendTrendUseCase,
    GetCarrierDistributionUseCase,
    GetSubscriptionUsageUseCase,
    ListBundleRatesUseCase,
    ExportBundleRatesUseCase,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // Everything, including the unauthenticated routes: an audit entry written
    // during a login attempt wants the caller's address as much as one written
    // afterwards.
    consumer.apply(RequestContextMiddleware).forRoutes('*');
  }
}
