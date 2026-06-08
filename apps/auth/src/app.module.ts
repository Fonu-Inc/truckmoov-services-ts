import { Module } from '@nestjs/common';
import { ConfigModule, AppConfigService } from '@shared/config';
import { EventBusModule } from '@shared/eventbus';
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
import { ActivityLogListener } from './activity-log.listener';
import { ACTIVITY_LOG_REPOSITORY } from './activity-log.repository';
import { ActivityLogService } from './activity-log.service';
import { CreateSystemTenantUseCase } from './create-system-tenant.use-case';
import { CreateSystemDeviceModelUseCase } from './create-system-device-model.use-case';
import { DeleteSystemTenantUseCase } from './delete-system-tenant.use-case';
import { DeleteSystemDeviceModelUseCase } from './delete-system-device-model.use-case';
import { DEVICE_MODEL_CATALOG_REPOSITORY } from './device-model-catalog.repository';
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
import { ApproveSystemSimRequestUseCase } from './approve-system-sim-request.use-case';
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
import { RejectSystemSimRequestUseCase } from './reject-system-sim-request.use-case';
import { RetrySystemSimBatchUseCase } from './retry-system-sim-batch.use-case';
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

@Module({
  imports: [
    ConfigModule,
    LoggerModule,
    MailerModule,
    ObjectStorageModule,
    SmsModule,
    EventBusModule,
  ],
  controllers: [AuthController],
  providers: [
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
    ApproveSystemSimRequestUseCase,
    ExportSystemSimsUseCase,
    GetSystemSimSummaryUseCase,
    ListSystemSimBatchesUseCase,
    ListSystemSimRequestsUseCase,
    ListSystemSimsUseCase,
    RejectSystemSimRequestUseCase,
    RetrySystemSimBatchUseCase,
    GetSystemSupportDashboardUseCase,
    ListSystemSupportTicketsUseCase,
    GetSystemSupportTicketUseCase,
    UpdateSystemSupportTicketStatusUseCase,
    EscalateSystemSupportTicketUseCase,
    ListSystemSupportTicketMessagesUseCase,
    SendSystemSupportMessageUseCase,
    SuperAdminBootstrapService,
  ],
})
export class AppModule {}
