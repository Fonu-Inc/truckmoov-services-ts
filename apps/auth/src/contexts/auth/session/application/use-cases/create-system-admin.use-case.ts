import { Inject, Injectable } from "@nestjs/common";
import { ID_GENERATOR, type IdGenerator } from "../../domain/ports/id-generator.port";
import { PASSWORD_HASHER, type PasswordHasher } from "../../domain/ports/password-hasher.port";
import { USER_REPOSITORY, type UserRepository } from "../../domain/ports/user-repository.port";
import { SESSION_STORE, type SessionStore } from "../../domain/ports/session-store.port";
import { TOKEN_SERVICE, type TokenService } from "../../domain/ports/token-service.port";
import { EmailTakenError } from "../../domain/errors/email-taken.error";
import { ForbiddenError } from "../../domain/errors/forbidden.error";
import { Role } from "@shared/rbac";
import { resolveActorUser } from "./support/resolve-actor-user";
import { SYSTEM_TENANT_ID } from "@shared/identity";


export type CreateSystemAdminCommand = {
  accessToken: string;
  fullName: string;
  email: string;
  password: string;
};

@Injectable()
export class CreateSystemAdminUseCase {
  constructor(
    @Inject(USER_REPOSITORY)
    private readonly userRepo: UserRepository,
    @Inject(TOKEN_SERVICE)
    private readonly tokenService: TokenService,
    @Inject(PASSWORD_HASHER)
    private readonly passwordHasher: PasswordHasher,
    @Inject(ID_GENERATOR)
    private readonly idGenerator: IdGenerator,
    @Inject(SESSION_STORE)
    private readonly sessionStore: SessionStore,
  ) {}

  async execute(command: CreateSystemAdminCommand) {
    const actor = await resolveActorUser(command.accessToken, this.tokenService, this.userRepo);
    if (actor.tenantId !== SYSTEM_TENANT_ID || actor.role !== Role.SUPER_ADMIN) {
      throw new ForbiddenError("Only the super admin can create admin accounts");
    }

    const email = command.email.trim().toLowerCase();
    const existing = await this.userRepo.findByEmail(email);
    if (existing) {
      throw new EmailTakenError();
    }

    const id = this.idGenerator.generate();
    const passwordHash = await this.passwordHasher.hash(command.password);
    const profile = {
      fullName: command.fullName.trim(),
      phoneNumber: null,
      address: null,
      profilePictureUrl: null,
    };

    await this.userRepo.save({
      id,
      email,
      passwordHash,
      role: Role.SYSTEM_ADMIN,
      tenantId: SYSTEM_TENANT_ID,
      accountStatus: "enabled",
      emailVerificationToken: null,
      profile,
    });

    const [activity] = await this.sessionStore.listUserActivity([id]);

    return {
      message: "Admin account created successfully",
      user: {
        userId: id,
        email,
        role: Role.SYSTEM_ADMIN,
        tenantId: SYSTEM_TENANT_ID,
        accountStatus: "enabled" as const,
        status: activity?.hasActiveSession ? "active" as const : "inactive" as const,
        lastActiveAt: activity?.lastActiveAt?.toISOString() ?? null,
        profile,
      },
    };
  }
}
