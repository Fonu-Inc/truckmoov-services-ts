import { Module } from "@nestjs/common";
import { ConfigModule, AppConfigService } from "@shared/config";
import { LoggerModule } from "@shared/logger";
import { MailerModule } from "@shared/mailer";
import { SmsModule } from "@shared/sms";
import {
  ChangeRoleUseCase,
  DbIdentityProvider,
  DevTokenService,
  ForgotPasswordUseCase,
  GetMeUseCase,
  IDENTITY_PROVIDER,
  InMemoryInviteRepository,
  InMemoryPasswordResetStore,
  InMemorySessionStore,
  InMemoryUserRepository,
  INVITE_REPOSITORY,
  InviteUserUseCase,
  LoginUseCase,
  LogoutUseCase,
  MikroInviteRepository,
  MikroPasswordResetStore,
  MikroSessionStore,
  MikroUserRepository,
  PASSWORD_RESET_STORE,
  RefreshUseCase,
  RegisterInvitedUseCase,
  RegisterUseCase,
  ResetPasswordUseCase,
  SESSION_STORE,
  TOKEN_SERVICE,
  USER_REPOSITORY,
  ValidateInviteUseCase,
  VerifyResetUseCase,
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

    // Use cases
    LoginUseCase,
    RefreshUseCase,
    GetMeUseCase,
    RegisterUseCase,
    InviteUserUseCase,
    ValidateInviteUseCase,
    RegisterInvitedUseCase,
    ForgotPasswordUseCase,
    VerifyResetUseCase,
    ResetPasswordUseCase,
    ChangeRoleUseCase,
    LogoutUseCase,
  ],
})
export class AppModule {}
