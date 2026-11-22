import { Inject, Injectable, Optional } from "@nestjs/common";
import { Role } from "@shared/rbac";
import { INVITE_REPOSITORY, type InviteRepository } from "../../domain/ports/invite-repository.port";
import { InviteNotFoundError } from "../../domain/errors/invite-not-found.error";
import { INSTALLER_ACCOUNTS, type InstallerAccounts } from "../../domain/ports/installer-accounts.port";
import { ONBOARDING_APPLICATION_REPOSITORY, type OnboardingApplicationRepository } from "@auth/onboarding/domain/onboarding-application.repository";
import { knownInviteeName } from "../services/known-invitee-name";

@Injectable()
export class ValidateInviteUseCase {
  constructor(
    @Inject(INVITE_REPOSITORY)
    private readonly inviteRepo: InviteRepository,
    // Optional so direct use-case tests can leave it out; Nest always supplies it.
    @Optional() @Inject(INSTALLER_ACCOUNTS)
    private readonly installers?: InstallerAccounts,
    @Optional() @Inject(ONBOARDING_APPLICATION_REPOSITORY)
    private readonly applications?: OnboardingApplicationRepository,
  ) {}

  async execute(token: string) {
    const invite = await this.inviteRepo.findByToken(token);

    if (!invite || invite.status !== "pending" || invite.expiresAt < new Date()) {
      throw new InviteNotFoundError();
    }

    return {
      email: invite.email,
      role: invite.role,
      tenantId: invite.tenantId,
      fullName: await knownInviteeName(invite, this.installers, this.applications),
    };
  }
}
