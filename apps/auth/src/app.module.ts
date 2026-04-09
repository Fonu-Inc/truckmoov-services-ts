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
import { ExportSystemTenantsUseCase } from './export-system-tenants.use-case';
import { GetActivityLogUseCase } from './get-activity-log.use-case';
import { GetSystemDashboardUseCase } from './get-system-dashboard.use-case';
import { GetSystemActivityLogUseCase } from './get-system-activity-log.use-case';
import { GetSystemTenantsSummaryUseCase } from './get-system-tenants-summary.use-case';
import { GetSystemTenantUseCase } from './get-system-tenant.use-case';
import { GetSystemTenantOnboardingReferenceDataUseCase } from './get-system-tenant-onboarding-reference-data.use-case';
import { InMemoryActivityLogRepository } from './in-memory-activity-log.repository';
import { InMemoryTenantOnboardingRepository } from './in-memory-tenant-onboarding.repository';
import { MikroActivityLogRepository } from './mikro-activity-log.repository';
import { MikroTenantOnboardingRepository } from './mikro-tenant-onboarding.repository';
import { ListSystemTenantsUseCase } from './list-system-tenants.use-case';
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

    // Use cases
    LoginUseCase,
    ChangeSystemPasswordUseCase,
    CreateSystemAdminUseCase,
    CreateSystemTenantUseCase,
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
    GetSystemDashboardUseCase,
    GetSystemActivityLogUseCase,
    ListSystemTenantsUseCase,
    GetSystemTenantsSummaryUseCase,
    GetSystemTenantUseCase,
    GetSystemTenantOnboardingReferenceDataUseCase,
    UpdateSystemTenantStatusUseCase,
    SuperAdminBootstrapService,
  ],
})
export class AppModule {}
