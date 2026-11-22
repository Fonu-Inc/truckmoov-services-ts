import { Role } from "@shared/rbac";
import type { OnboardingApplicationRepository } from "@auth/onboarding/domain/onboarding-application.repository";
import type { InstallerAccounts } from "../../domain/ports/installer-accounts.port";
import type { StoredInvite } from "../../domain/ports/invite-repository.port";

/**
 * The name the platform already holds for this invitee: the installer record, or
 * the contact on the onboarding application that created the tenant. When one
 * exists the invitee cannot type a different one, so a setup link can't be used
 * to open an account under another person's name.
 */
export async function knownInviteeName(
  invite: Pick<StoredInvite, "role" | "email" | "tenantId">,
  installers?: InstallerAccounts,
  applications?: OnboardingApplicationRepository,
): Promise<string | null> {
  if (invite.role === Role.INSTALLER) return (await installers?.invited(invite.email))?.fullName ?? null;
  const application = await applications?.findLatestByTenantId(invite.tenantId);
  if (!application || application.businessEmail.toLowerCase() !== invite.email.toLowerCase()) return null;
  return application.contactFullName.trim() || null;
}
