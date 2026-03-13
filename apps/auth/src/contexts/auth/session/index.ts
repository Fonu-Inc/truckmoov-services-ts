// Domain errors
export { InvalidCredentialsError } from "./domain/errors/invalid-credentials.error";
export { InvalidRefreshTokenError } from "./domain/errors/invalid-refresh-token.error";
export { EmailTakenError } from "./domain/errors/email-taken.error";
export { InviteNotFoundError } from "./domain/errors/invite-not-found.error";
export { InvalidResetTokenError } from "./domain/errors/invalid-reset-token.error";
export { UserNotFoundError } from "./domain/errors/user-not-found.error";
export { ForbiddenError } from "./domain/errors/forbidden.error";
export { InvalidSettingsError } from "./domain/errors/invalid-settings.error";

// Domain ports
export { IDENTITY_PROVIDER } from "./domain/ports/identity-provider.port";
export { TOKEN_SERVICE } from "./domain/ports/token-service.port";
export { SESSION_STORE } from "./domain/ports/session-store.port";
export { USER_REPOSITORY } from "./domain/ports/user-repository.port";
export { INVITE_REPOSITORY } from "./domain/ports/invite-repository.port";
export { PASSWORD_RESET_STORE } from "./domain/ports/password-reset-store.port";
export { ORGANIZATION_SETTINGS_REPOSITORY } from "./domain/ports/organization-settings.repository.port";
export { ID_GENERATOR } from "./domain/ports/id-generator.port";
export { PASSWORD_HASHER } from "./domain/ports/password-hasher.port";
export { AUTH_NOTIFIER } from "./domain/ports/auth-notifier.port";
export { AUTH_HEALTH_CHECK } from "./domain/ports/health-check.port";

// Infrastructure
export { DbIdentityProvider } from "./infrastructure/db-identity.provider";
export { DevTokenService } from "./infrastructure/dev-token.service";
export { InMemorySessionStore } from "./infrastructure/in-memory-session.store";
export { InMemoryUserRepository } from "./infrastructure/in-memory-user.repository";
export { MikroSessionStore } from "./infrastructure/mikro-session.store";
export { MikroUserRepository } from "./infrastructure/mikro-user.repository";
export { InMemoryInviteRepository } from "./infrastructure/in-memory-invite.repository";
export { MikroInviteRepository } from "./infrastructure/mikro-invite.repository";
export { InMemoryPasswordResetStore } from "./infrastructure/in-memory-password-reset.store";
export { MikroPasswordResetStore } from "./infrastructure/mikro-password-reset.store";
export { InMemoryOrganizationSettingsRepository } from "./infrastructure/in-memory-organization-settings.repository";
export { MikroOrganizationSettingsRepository } from "./infrastructure/mikro-organization-settings.repository";
export { UuidIdGenerator } from "./infrastructure/uuid-id.generator";
export { ScryptPasswordHasher } from "./infrastructure/password-hasher.adapter";
export { MailerAuthNotifier } from "./infrastructure/auth-notifier.adapter";
export { AuthPersistenceHealthCheck } from "./infrastructure/auth-health-check.adapter";

// Use cases
export { LoginUseCase } from "./application/use-cases/login.use-case";
export { RefreshUseCase } from "./application/use-cases/refresh.use-case";
export { GetMeUseCase } from "./application/use-cases/get-me.use-case";
export { GetHealthUseCase } from "./application/use-cases/get-health.use-case";
export { RegisterUseCase } from "./application/use-cases/register.use-case";
export { InviteUserUseCase } from "./application/use-cases/invite-user.use-case";
export { ValidateInviteUseCase } from "./application/use-cases/validate-invite.use-case";
export { RegisterInvitedUseCase } from "./application/use-cases/register-invited.use-case";
export { ForgotPasswordUseCase } from "./application/use-cases/forgot-password.use-case";
export { VerifyResetUseCase } from "./application/use-cases/verify-reset.use-case";
export { ResetPasswordUseCase } from "./application/use-cases/reset-password.use-case";
export { ChangeRoleUseCase } from "./application/use-cases/change-role.use-case";
export { LogoutUseCase } from "./application/use-cases/logout.use-case";
export { GetProfileUseCase } from "./application/use-cases/get-profile.use-case";
export { UpdateProfileUseCase } from "./application/use-cases/update-profile.use-case";
export { GetNotificationPreferencesUseCase } from "./application/use-cases/get-notification-preferences.use-case";
export { UpdateNotificationPreferencesUseCase } from "./application/use-cases/update-notification-preferences.use-case";
export { GetDispatcherPreferencesUseCase } from "./application/use-cases/get-dispatcher-preferences.use-case";
export { UpdateDispatcherPreferencesUseCase } from "./application/use-cases/update-dispatcher-preferences.use-case";
export { GetOrganizationSettingsUseCase } from "./application/use-cases/get-organization-settings.use-case";
export { UpdateOrganizationSettingsUseCase } from "./application/use-cases/update-organization-settings.use-case";
