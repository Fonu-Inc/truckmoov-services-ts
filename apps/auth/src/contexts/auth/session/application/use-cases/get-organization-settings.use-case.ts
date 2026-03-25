import { Inject, Injectable } from "@nestjs/common";
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

    return (
      (await this.organizationRepo.findByTenantId(actor.tenantId)) ??
      buildDefaultOrganizationSettings(actor.tenantId)
    );
  }
}
