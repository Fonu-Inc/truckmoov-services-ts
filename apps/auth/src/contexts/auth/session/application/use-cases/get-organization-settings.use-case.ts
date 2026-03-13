import { Inject, Injectable } from "@nestjs/common";
import { Role } from "@shared/rbac";
import { ForbiddenError } from "../../domain/errors/forbidden.error";
import {
  ORGANIZATION_SETTINGS_REPOSITORY,
  type OrganizationSettingsRepository,
  buildDefaultOrganizationSettings,
} from "../../domain/ports/organization-settings.repository.port";
import {
  TOKEN_SERVICE,
  type TokenService,
} from "../../domain/ports/token-service.port";
import {
  USER_REPOSITORY,
  type UserRepository,
} from "../../domain/ports/user-repository.port";
import { resolveActorUser } from "./support/resolve-actor-user";

@Injectable()
export class GetOrganizationSettingsUseCase {
  constructor(
    @Inject(TOKEN_SERVICE)
    private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY)
    private readonly userRepo: UserRepository,
    @Inject(ORGANIZATION_SETTINGS_REPOSITORY)
    private readonly organizationRepo: OrganizationSettingsRepository,
  ) {}

  async execute(accessToken: string) {
    const actor = await resolveActorUser(
      accessToken,
      this.tokenService,
      this.userRepo,
    );

    if (actor.role !== Role.ENTERPRISE_ADMIN) {
      throw new ForbiddenError(
        "Only enterprise admins can view organization settings",
      );
    }

    return (
      (await this.organizationRepo.findByTenantId(actor.tenantId)) ??
      buildDefaultOrganizationSettings(actor.tenantId)
    );
  }
}
