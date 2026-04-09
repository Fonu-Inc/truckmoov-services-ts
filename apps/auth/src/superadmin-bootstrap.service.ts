import { Inject, Injectable, Logger, OnApplicationBootstrap } from "@nestjs/common";
import { AppConfigService } from "@shared/config";
import { Role } from "@shared/rbac";
import {
  ID_GENERATOR,
  PASSWORD_HASHER,
  SESSION_STORE,
  USER_REPOSITORY,
} from "./contexts/auth/session";
import {
  defaultUserProfile,
  type UserRepository,
} from "./contexts/auth/session/domain/ports/user-repository.port";
import type { IdGenerator } from "./contexts/auth/session/domain/ports/id-generator.port";
import type { PasswordHasher } from "./contexts/auth/session/domain/ports/password-hasher.port";
import type { SessionStore } from "./contexts/auth/session/domain/ports/session-store.port";

@Injectable()
export class SuperAdminBootstrapService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SuperAdminBootstrapService.name);

  constructor(
    @Inject(AppConfigService)
    private readonly config: AppConfigService,
    @Inject(USER_REPOSITORY)
    private readonly userRepository: UserRepository,
    @Inject(PASSWORD_HASHER)
    private readonly passwordHasher: PasswordHasher,
    @Inject(ID_GENERATOR)
    private readonly idGenerator: IdGenerator,
    @Inject(SESSION_STORE)
    private readonly sessionStore: SessionStore,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const email = this.config.superadmin.email.trim();
    const password = this.config.superadmin.password;
    if (!email || !password) {
      this.logger.log("Skipping superadmin bootstrap because SUPERADMIN_EMAIL or SUPERADMIN_PASSWORD is unset");
      return;
    }

    const fullName = this.config.superadmin.fullName.trim() || "Truckmoov Super Admin";
    const tenantId = this.config.superadmin.tenantId.trim() || "system";
    const existing = await this.userRepository.findByEmail(email);
    const passwordHash = existing && await this.passwordHasher.verify(password, existing.passwordHash)
      ? existing.passwordHash
      : await this.passwordHasher.hash(password);

    const seedUser = {
      id: existing?.id ?? this.idGenerator.generate(),
      email,
      passwordHash,
      role: Role.SUPER_ADMIN,
      tenantId,
      accountStatus: "enabled" as const,
      emailVerificationToken: null,
      profile: {
        ...defaultUserProfile(),
        ...(existing?.profile ?? {}),
        fullName,
      },
      notificationPreferences: existing?.notificationPreferences,
      dispatcherPreferences: existing?.dispatcherPreferences,
    };

    await this.userRepository.save(seedUser);

    if (existing) {
      const credentialsChanged = existing.passwordHash !== passwordHash;
      const identityChanged =
        existing.role !== Role.SUPER_ADMIN
        || existing.tenantId !== tenantId
        || existing.accountStatus === "disabled";

      if (credentialsChanged || identityChanged) {
        await this.sessionStore.deleteAllForUser(existing.id);
      }

      this.logger.log(`Verified superadmin bootstrap user ${email}`);
      return;
    }

    this.logger.log(`Seeded superadmin bootstrap user ${email}`);
  }
}
