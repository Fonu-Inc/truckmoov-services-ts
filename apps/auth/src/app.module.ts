import { Module } from '@nestjs/common';
import { ConfigModule, AppConfigService } from '@shared/config';
import { LoginRateLimitGuard } from './login-rate-limit.guard';
import { IdempotencyGuard, RedisClientProvider } from '@shared/rbac';
import { EventBusModule } from '@shared/eventbus';
import { MetricsModule } from '@shared/metrics';
import { ReadinessController } from './readiness.controller';
import { LoggerModule } from '@shared/logger';
import { MailerModule } from '@shared/mailer';
import { ObjectStorageModule } from '@shared/object-storage';
import { SmsModule } from '@shared/sms';
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
  DevTokenService,
  ForgotPasswordUseCase,
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
  RegisterUseCase,
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
import { ProfileController } from './profile.controller';
import { OrganizationController } from './organization.controller';
import { SystemController } from './system.controller';
import { SystemReferenceDataController } from './system-reference-data.controller';
import { SystemTenantsController } from './system-tenants.controller';
import { SystemDevicesController } from './system-devices.controller';
import { SystemSimsController } from './system-sims.controller';
import { SystemSupportController } from './system-support.controller';
import { SystemBillingController } from './system-billing.controller';
import { OnboardingController } from './onboarding.controller';
import { TenantSimsController } from './tenant-sims.controller';
import { DataBundlesController } from './data-bundles.controller';
import { ActivityLogListener } from './activity-log.listener';
import { ACTIVITY_LOG_REPOSITORY } from './activity-log.repository';
import { ActivityLogService } from './activity-log.service';
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
import { SUPPORT_TICKET_REPOSITORY } from './support-ticket.repository';
import { SUPPORT_MESSAGE_REPOSITORY } from './support-message.repository';
import { SIM_PROVISIONING_REQUEST_REPOSITORY } from './sim-provisioning-request.repository';
import { SIM_ACTIVATION_BATCH_REPOSITORY } from './sim-activation-batch.repository';
import { ExportSystemDeviceInventoryUseCase } from './export-system-device-inventory.use-case';
import { ExportSystemTenantsUseCase } from './export-system-tenants.use-case';
import { GetActivityLogUseCase } from './get-activity-log.use-case';
import { GetSystemDeviceCatalogReferenceDataUseCase } from './get-system-device-catalog-reference-data.use-case';
import { GetSystemDeviceSummaryUseCase } from './get-system-device-summary.use-case';
import { GetSystemDashboardUseCase } from './get-system-dashboard.use-case';
import { GetSystemSubscriptionPlansUseCase } from './get-system-subscription-plans.use-case';
import { GetSystemActivityLogUseCase } from './get-system-activity-log.use-case';
import { GetSystemTenantsSummaryUseCase } from './get-system-tenants-summary.use-case';
import { GetSystemTenantUseCase } from './get-system-tenant.use-case';
import { GetSystemTenantOnboardingReferenceDataUseCase } from './get-system-tenant-onboarding-reference-data.use-case';
import { InMemoryActivityLogRepository } from './in-memory-activity-log.repository';
import { InMemoryDeviceModelCatalogRepository } from './in-memory-device-model-catalog.repository';
import { InMemoryTenantOnboardingRepository } from './in-memory-tenant-onboarding.repository';
import { InMemorySimRepository } from './in-memory-sim.repository';
import { InMemorySupportTicketRepository } from './in-memory-support-ticket.repository';
import { InMemorySupportMessageRepository } from './in-memory-support-message.repository';
import { InMemorySimProvisioningRequestRepository } from './in-memory-sim-provisioning-request.repository';
import { InMemorySimActivationBatchRepository } from './in-memory-sim-activation-batch.repository';
import { InMemorySystemFeatureFlagRepository } from './in-memory-system-feature-flag.repository';
import { InMemorySystemSettingsRepository } from './in-memory-system-settings.repository';
import { ListSystemAdminInvitesUseCase } from './list-system-admin-invites.use-case';
import { ListSystemDeviceCatalogUseCase } from './list-system-device-catalog.use-case';
import { ListSystemDeviceInventoryUseCase } from './list-system-device-inventory.use-case';
import { GetSystemDeviceDetailUseCase } from './get-system-device-detail.use-case';
import { ListSystemFeatureFlagsUseCase } from './list-system-feature-flags.use-case';
import { MikroActivityLogRepository } from './mikro-activity-log.repository';
import { MikroDeviceModelCatalogRepository } from './mikro-device-model-catalog.repository';
import { MikroSimRepository } from './mikro-sim.repository';
import { MikroSupportTicketRepository } from './mikro-support-ticket.repository';
import { MikroSupportMessageRepository } from './mikro-support-message.repository';
import { MikroSimProvisioningRequestRepository } from './mikro-sim-provisioning-request.repository';
import { MikroSimActivationBatchRepository } from './mikro-sim-activation-batch.repository';
import { MikroSystemFeatureFlagRepository } from './mikro-system-feature-flag.repository';
import { MikroSystemSettingsRepository } from './mikro-system-settings.repository';
import { MikroTenantOnboardingRepository } from './mikro-tenant-onboarding.repository';
import { ListSystemTenantsUseCase } from './list-system-tenants.use-case';
import { CancelSystemAdminInviteUseCase } from './cancel-system-admin-invite.use-case';
import { CreateSystemAdminInviteUseCase } from './create-system-admin-invite.use-case';
import { GetSystemSettingsUseCase } from './get-system-settings.use-case';
import { GetSystemSupportDashboardUseCase } from './get-system-support-dashboard.use-case';
import { ListSystemSupportTicketsUseCase } from './list-system-support-tickets.use-case';
import { GetSystemSupportTicketUseCase } from './get-system-support-ticket.use-case';
import { UpdateSystemSupportTicketStatusUseCase } from './update-system-support-ticket-status.use-case';
import { EscalateSystemSupportTicketUseCase } from './escalate-system-support-ticket.use-case';
import { ListSystemSupportTicketMessagesUseCase } from './list-system-support-ticket-messages.use-case';
import { SendSystemSupportMessageUseCase } from './send-system-support-message.use-case';
import { ExportSystemSimsUseCase } from './export-system-sims.use-case';
import { GetSystemSimSummaryUseCase } from './get-system-sim-summary.use-case';
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
import { RejectSystemDeviceSetupRequestUseCase } from './reject-system-device-setup-request.use-case';
import { InMemoryDeviceSetupRequestRepository } from './in-memory-device-setup-request.repository';
import { MikroDeviceSetupRequestRepository } from './mikro-device-setup-request.repository';
import { DEVICE_SETUP_REQUEST_REPOSITORY } from './device-setup-request.repository';
import { TENANT_BUSINESS_INFO_REPOSITORY } from './tenant-business-info.repository';
import { InMemoryTenantBusinessInfoRepository } from './in-memory-tenant-business-info.repository';
import { MikroTenantBusinessInfoRepository } from './mikro-tenant-business-info.repository';
import { KYC_DOCUMENT_REPOSITORY } from './tenant-kyc-document.repository';
import { InMemoryKycDocumentRepository } from './in-memory-tenant-kyc-document.repository';
import { MikroKycDocumentRepository } from './mikro-tenant-kyc-document.repository';
import { TENANT_DEVICE_PROVISIONING_REQUEST_REPOSITORY } from './tenant-device-provisioning-request.repository';
import { InMemoryTenantDeviceProvisioningRequestRepository } from './in-memory-tenant-device-provisioning-request.repository';
import { MikroTenantDeviceProvisioningRequestRepository } from './mikro-tenant-device-provisioning-request.repository';
import { PaymentEventService } from './payment-event.service';
import { GetOnboardingPlansUseCase } from './get-onboarding-plans.use-case';
import { GetExchangeRateUseCase } from './get-exchange-rate.use-case';
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
import { SubmitDeviceProvisioningRequestUseCase } from './submit-device-provisioning-request.use-case';
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
// Bundle catalog
import { BUNDLE_CATALOG_REPOSITORY } from './bundle-catalog.repository';
import { InMemoryBundleCatalogRepository } from './in-memory-bundle-catalog.repository';
import { MikroBundleCatalogRepository } from './mikro-bundle-catalog.repository';
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
import { CreateSystemBundleUseCase } from './create-system-bundle.use-case';
import { UpdateSystemBundleUseCase } from './update-system-bundle.use-case';
import { DeleteSystemBundleUseCase } from './delete-system-bundle.use-case';
// Data bundle dashboard use cases
import { GetBundleSummaryUseCase } from './get-bundle-summary.use-case';
import { GetWalletBalanceUseCase } from './get-wallet-balance.use-case';
import { TopupWalletUseCase } from './topup-wallet.use-case';
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
    LoggerModule,
    MailerModule,
    ObjectStorageModule,
    SmsModule,
    EventBusModule,
    MetricsModule,
  ],
  controllers: [
    AuthController,
    ProfileController,
    OrganizationController,
    SystemController,
    SystemReferenceDataController,
    SystemTenantsController,
    SystemDevicesController,
    SystemSimsController,
    SystemSupportController,
    SystemBillingController,
    OnboardingController,
    TenantSimsController,
    DataBundlesController,
    ReadinessController,
  ],
  providers: [
    LoginRateLimitGuard,
    IdempotencyGuard,
    RedisClientProvider,
    // User repository
    InMemoryUserRepository,
    MikroUserRepository,
    {
      provide: USER_REPOSITORY,
      inject: [InMemoryUserRepository, MikroUserRepository, AppConfigService],
      useFactory: (
        inMemory: InMemoryUserRepository,
        mikro: MikroUserRepository,
        config: AppConfigService,
      ) => (config.persistence.backend === 'in-memory' ? inMemory : mikro),
    },

    // Identity provider
    DbIdentityProvider,
    {
      provide: IDENTITY_PROVIDER,
      useExisting: DbIdentityProvider,
    },

    // Token service
    DevTokenService,
    {
      provide: TOKEN_SERVICE,
      useExisting: DevTokenService,
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

    // Use cases
    LoginUseCase,
    ChangeSystemPasswordUseCase,
    CreateSystemAdminUseCase,
    CreateSystemAdminInviteUseCase,
    CreateSystemTenantUseCase,
    CreateSystemDeviceModelUseCase,
    CancelSystemAdminInviteUseCase,
    DeleteSystemTenantUseCase,
    DeleteSystemDeviceModelUseCase,
    ExportSystemDeviceInventoryUseCase,
    ExportSystemTenantsUseCase,
    RefreshUseCase,
    GetMeUseCase,
    GetHealthUseCase,
    RegisterUseCase,
    InviteUserUseCase,
    ValidateInviteUseCase,
    RegisterInvitedUseCase,
    ForgotPasswordUseCase,
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
    GetActivityLogUseCase,
    GetSystemSettingsUseCase,
    GetSystemDashboardUseCase,
    GetSystemDeviceCatalogReferenceDataUseCase,
    GetSystemDeviceSummaryUseCase,
    GetSystemSubscriptionPlansUseCase,
    GetSystemActivityLogUseCase,
    ListSystemAdminInvitesUseCase,
    ListSystemDeviceCatalogUseCase,
    ListSystemDeviceInventoryUseCase,
    GetSystemDeviceDetailUseCase,
    ListSystemFeatureFlagsUseCase,
    ListSystemTenantsUseCase,
    GetSystemTenantsSummaryUseCase,
    GetSystemTenantUseCase,
    GetSystemTenantOnboardingReferenceDataUseCase,
    ResendSystemAdminInviteUseCase,
    ResendSystemTenantInviteUseCase,
    UpdateSystemDeviceModelUseCase,
    UpdateSystemFeatureFlagUseCase,
    UpdateSystemSettingsUseCase,
    UpdateSystemTenantUseCase,
    UpdateSystemTenantStatusUseCase,
    ExportSystemSimsUseCase,
    GetSystemSimSummaryUseCase,
    ListSystemSimBatchesUseCase,
    ListSystemSimRequestsUseCase,
    ListSystemSimsUseCase,
    GetSystemSupportDashboardUseCase,
    ListSystemSupportTicketsUseCase,
    GetSystemSupportTicketUseCase,
    UpdateSystemSupportTicketStatusUseCase,
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
    InMemoryTenantDeviceProvisioningRequestRepository,
    MikroTenantDeviceProvisioningRequestRepository,
    {
      provide: TENANT_DEVICE_PROVISIONING_REQUEST_REPOSITORY,
      inject: [InMemoryTenantDeviceProvisioningRequestRepository, MikroTenantDeviceProvisioningRequestRepository, AppConfigService],
      useFactory: (inMemory: InMemoryTenantDeviceProvisioningRequestRepository, mikro: MikroTenantDeviceProvisioningRequestRepository, config: AppConfigService) =>
        config.persistence.backend === 'in-memory' ? inMemory : mikro,
    },
    // Onboarding use cases
    PaymentEventService,
    GetOnboardingPlansUseCase,
    GetExchangeRateUseCase,
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
    DeleteKycDocumentUseCase,
    SubmitDeviceProvisioningRequestUseCase,
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
    CreateSystemBundleUseCase,
    UpdateSystemBundleUseCase,
    DeleteSystemBundleUseCase,
    // Data bundle dashboard
    GetBundleSummaryUseCase,
    GetWalletBalanceUseCase,
    TopupWalletUseCase,
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
    GetCarrierDistributionUseCase,
    GetSubscriptionUsageUseCase,
    ListBundleRatesUseCase,
    ExportBundleRatesUseCase,
  ],
})
export class AppModule {}
