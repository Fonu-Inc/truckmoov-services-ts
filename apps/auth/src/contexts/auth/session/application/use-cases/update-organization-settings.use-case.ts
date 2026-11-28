import { Inject, Injectable } from "@nestjs/common";
import { optionalFullAddressLine } from "@shared/nigeria";
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
import { assertValidBrandingColors, assertValidTimezone } from "./support/settings-validation";

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
        contactEmail:
          command.branding?.contactEmail === undefined
            ? current.branding.contactEmail
            : command.branding.contactEmail,
        billingEmail:
          command.branding?.billingEmail === undefined
            ? (current.branding.billingEmail ?? null)
            : command.branding.billingEmail,
        phoneNumber:
          command.branding?.phoneNumber === undefined
            ? current.branding.phoneNumber
            : command.branding.phoneNumber,
        address:
          command.branding?.address === undefined
            ? current.branding.address
            : optionalFullAddressLine(command.branding.address, "address", current.branding.address),
        logoUrl:
          command.branding?.logoUrl === undefined
            ? current.branding.logoUrl
            : command.branding.logoUrl,
        profilePictureUrl:
          command.branding?.profilePictureUrl === undefined
            ? current.branding.profilePictureUrl
            : command.branding.profilePictureUrl,
        primaryColor:
          command.branding?.primaryColor === undefined
            ? current.branding.primaryColor
            : command.branding.primaryColor,
        secondaryColor:
          command.branding?.secondaryColor === undefined
            ? current.branding.secondaryColor
            : command.branding.secondaryColor,
        accentColor:
          command.branding?.accentColor === undefined
            ? current.branding.accentColor
            : command.branding.accentColor,
        successColor:
          command.branding?.successColor === undefined
            ? current.branding.successColor
            : command.branding.successColor,
        warningColor:
          command.branding?.warningColor === undefined
            ? current.branding.warningColor
            : command.branding.warningColor,
        destructiveColor:
          command.branding?.destructiveColor === undefined
            ? current.branding.destructiveColor
            : command.branding.destructiveColor,
        sidebarBackground:
          command.branding?.sidebarBackground === undefined
            ? current.branding.sidebarBackground
            : command.branding.sidebarBackground,
        sidebarText:
          command.branding?.sidebarText === undefined
            ? current.branding.sidebarText
            : command.branding.sidebarText,
        sidebarAccent:
          command.branding?.sidebarAccent === undefined
            ? current.branding.sidebarAccent
            : command.branding.sidebarAccent,
      },
      defaults: {
        timezone: command.defaults?.timezone ?? current.defaults.timezone,
        language: command.defaults?.language ?? current.defaults.language,
        currency: command.defaults?.currency ?? current.defaults.currency,
        dateFormat: command.defaults?.dateFormat ?? current.defaults.dateFormat,
        weekStartsOn:
          command.defaults?.weekStartsOn ?? current.defaults.weekStartsOn,
      },
    };

    assertValidTimezone(merged.defaults.timezone);
    assertValidBrandingColors(merged.branding);

    await this.organizationRepo.save(merged);
    return merged;
  }
}
