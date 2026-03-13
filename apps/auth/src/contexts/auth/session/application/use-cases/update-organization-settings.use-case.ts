import { Inject, Injectable } from "@nestjs/common";
import { Role } from "@shared/rbac";
import { ForbiddenError } from "../../domain/errors/forbidden.error";
import {
  ORGANIZATION_SETTINGS_REPOSITORY,
  type OrganizationBranding,
  type OrganizationDefaults,
  type OrganizationSettings,
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
import { assertValidTimezone } from "./support/settings-validation";

export type UpdateOrganizationSettingsCommand = {
  accessToken: string;
  branding?: Partial<OrganizationBranding>;
  defaults?: Partial<OrganizationDefaults>;
};

@Injectable()
export class UpdateOrganizationSettingsUseCase {
  constructor(
    @Inject(TOKEN_SERVICE)
    private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY)
    private readonly userRepo: UserRepository,
    @Inject(ORGANIZATION_SETTINGS_REPOSITORY)
    private readonly organizationRepo: OrganizationSettingsRepository,
  ) {}

  async execute(command: UpdateOrganizationSettingsCommand) {
    const actor = await resolveActorUser(
      command.accessToken,
      this.tokenService,
      this.userRepo,
    );

    if (actor.role !== Role.ENTERPRISE_ADMIN) {
      throw new ForbiddenError(
        "Only enterprise admins can update organization settings",
      );
    }

    const current =
      (await this.organizationRepo.findByTenantId(actor.tenantId)) ??
      buildDefaultOrganizationSettings(actor.tenantId);

    const merged: OrganizationSettings = {
      tenantId: actor.tenantId,
      branding: {
        organizationName:
          command.branding?.organizationName === undefined
            ? current.branding.organizationName
            : command.branding.organizationName,
        logoUrl:
          command.branding?.logoUrl === undefined
            ? current.branding.logoUrl
            : command.branding.logoUrl,
        primaryColor:
          command.branding?.primaryColor === undefined
            ? current.branding.primaryColor
            : command.branding.primaryColor,
        secondaryColor:
          command.branding?.secondaryColor === undefined
            ? current.branding.secondaryColor
            : command.branding.secondaryColor,
      },
      defaults: {
        timezone: command.defaults?.timezone ?? current.defaults.timezone,
        currency: command.defaults?.currency ?? current.defaults.currency,
        dateFormat: command.defaults?.dateFormat ?? current.defaults.dateFormat,
        weekStartsOn:
          command.defaults?.weekStartsOn ?? current.defaults.weekStartsOn,
      },
    };

    assertValidTimezone(merged.defaults.timezone);

    await this.organizationRepo.save(merged);
    return merged;
  }
}
