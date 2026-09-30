import { Inject, Injectable, Optional } from "@nestjs/common";
import { Role } from "@shared/rbac";
import { INVITE_REPOSITORY, type InviteRepository } from "../../domain/ports/invite-repository.port";
import { InviteNotFoundError } from "../../domain/errors/invite-not-found.error";
import { INSTALLER_ACCOUNTS, type InstallerAccounts } from "../../domain/ports/installer-accounts.port";

@Injectable()
export class ValidateInviteUseCase {
  constructor(
    @Inject(INVITE_REPOSITORY)
    private readonly inviteRepo: InviteRepository,
    // Optional so direct use-case tests can leave it out; Nest always supplies it.
    @Optional() @Inject(INSTALLER_ACCOUNTS)
    private readonly installers?: InstallerAccounts,
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
      fullName: await this.installerName(invite.role, invite.email),
    };
  }

  /** The name the installer was invited under, so the sign-up screen need not ask for it. */
  private async installerName(role: string, email: string): Promise<string | null> {
    if (role !== Role.INSTALLER || !this.installers) return null;
    return (await this.installers.invited(email))?.fullName ?? null;
  }
}
