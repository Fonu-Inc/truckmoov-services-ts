import { Inject, Injectable } from "@nestjs/common";
import { ID_GENERATOR, type IdGenerator } from "@auth/session/domain/ports/id-generator.port";
import { PASSWORD_HASHER, type PasswordHasher } from "@auth/session/domain/ports/password-hasher.port";
import { Role } from "@shared/rbac";
import { AuthUser } from "../../domain/entities/auth-user.entity";
import { EmailTakenError } from "../../domain/errors/email-taken.error";
import {
  ORGANIZATION_SETTINGS_REPOSITORY,
  buildDefaultOrganizationSettings,
  type OrganizationSettingsRepository,
} from "../../domain/ports/organization-settings.repository.port";
import { USER_REPOSITORY, type UserRepository } from "../../domain/ports/user-repository.port";
import { SESSION_STORE, type SessionStore } from "../../domain/ports/session-store.port";
import { TOKEN_SERVICE, type TokenService } from "../../domain/ports/token-service.port";
import { AUTH_NOTIFIER, type AuthNotifier } from "../../domain/ports/auth-notifier.port";

export type RegisterCommand = {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  organizationName: string;
};

@Injectable()
export class RegisterUseCase {
  constructor(
    @Inject(USER_REPOSITORY)
    private readonly userRepo: UserRepository,
    @Inject(TOKEN_SERVICE)
    private readonly tokenService: TokenService,
    @Inject(SESSION_STORE)
    private readonly sessionStore: SessionStore,
    @Inject(ORGANIZATION_SETTINGS_REPOSITORY)
    private readonly organizationRepo: OrganizationSettingsRepository,
    @Inject(PASSWORD_HASHER)
    private readonly passwordHasher: PasswordHasher,
    @Inject(ID_GENERATOR)
    private readonly idGenerator: IdGenerator,
    @Inject(AUTH_NOTIFIER)
    private readonly notifier: AuthNotifier,
  ) {}

  async execute(command: RegisterCommand) {
    const existing = await this.userRepo.findByEmail(command.email);
    if (existing) throw new EmailTakenError();

    const id = this.idGenerator.generate();
    const tenantId = this.idGenerator.generate();
    const emailVerificationToken = this.idGenerator.generate();
    const passwordHash = await this.passwordHasher.hash(command.password);
    const role = Role.ENTERPRISE_ADMIN;
    const profile = {
      fullName: `${command.firstName.trim()} ${command.lastName.trim()}`,
      phoneNumber: null,
      address: null,
      profilePictureUrl: null,
    };
    const organizationSettings = buildDefaultOrganizationSettings(tenantId);
    organizationSettings.branding.organizationName = command.organizationName.trim();

    await this.userRepo.save({
      id,
      email: command.email,
      passwordHash,
      role,
      tenantId,
      emailVerificationToken,
      profile,
    });
    await this.organizationRepo.save(organizationSettings);

    await this.notifier.sendVerificationEmail({
      email: command.email,
      firstName: command.firstName.trim(),
      verificationToken: emailVerificationToken,
    });

    const user = AuthUser.create({ id, email: command.email, role, tenantId });
    const accessToken = this.tokenService.issueAccessToken(user);
    const refreshToken = this.tokenService.issueRefreshToken(user);

    await this.sessionStore.save(refreshToken, user);

    return { accessToken, refreshToken, expiresIn: 3600, user: user.toPrimitives() };
  }
}
