import { Module } from "@nestjs/common";
import { ConfigModule, AppConfigService } from "@shared/config";
import { LoggerModule } from "@shared/logger";
import { MailerModule } from "@shared/mailer";
import { SmsModule } from "@shared/sms";
import {
  ChangeRoleUseCase,
  AUTH_HEALTH_CHECK,
  AUTH_NOTIFIER,
  GetDispatcherPreferencesUseCase,
  GetHealthUseCase,
  GetNotificationPreferencesUseCase,
  GetOrganizationSettingsUseCase,
  GetProfileUseCase,
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
  UpdateOrganizationSettingsUseCase,
  UpdateProfileUseCase,
  MailerAuthNotifier,
  AuthPersistenceHealthCheck,
} from "./contexts/auth/session";
import { AuthController } from "./auth.controller";

@Module({
  imports: [ConfigModule, LoggerModule, MailerModule, SmsModule],
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
      ) => config.persistence.backend === "in-memory" ? inMemory : mikro,
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
      ) => config.persistence.backend === "in-memory" ? inMemoryStore : mikroStore,
    },

    // Invite repository
    InMemoryInviteRepository,
    MikroInviteRepository,
    {
      provide: INVITE_REPOSITORY,
      inject: [InMemoryInviteRepository, MikroInviteRepository, AppConfigService],
      useFactory: (
        inMemory: InMemoryInviteRepository,
        mikro: MikroInviteRepository,
        config: AppConfigService,
      ) => config.persistence.backend === "in-memory" ? inMemory : mikro,
    },

    // Password reset store
    InMemoryPasswordResetStore,
    MikroPasswordResetStore,
    {
      provide: PASSWORD_RESET_STORE,
      inject: [InMemoryPasswordResetStore, MikroPasswordResetStore, AppConfigService],
      useFactory: (
        inMemory: InMemoryPasswordResetStore,
        mikro: MikroPasswordResetStore,
        config: AppConfigService,
      ) => config.persistence.backend === "in-memory" ? inMemory : mikro,
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
      ) => config.persistence.backend === "in-memory" ? inMemory : mikro,
    },

    // Use cases
    LoginUseCase,
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
    UpdateProfileUseCase,
    GetNotificationPreferencesUseCase,
    UpdateNotificationPreferencesUseCase,
    GetDispatcherPreferencesUseCase,
    UpdateDispatcherPreferencesUseCase,
    GetOrganizationSettingsUseCase,
    UpdateOrganizationSettingsUseCase,
  ],
})
export class AppModule {}
