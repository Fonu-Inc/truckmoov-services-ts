import { ForbiddenError } from '@auth/session/domain/errors/forbidden.error';
import { InvalidAccessTokenError } from '@auth/session/domain/errors/invalid-access-token.error';
import type { TokenService } from '@auth/session/domain/ports/token-service.port';
import type {
  InstallerRepository,
  StoredInstaller,
} from '@auth/installation/domain/installer.repository';
import type {
  InstallationOrderRepository,
  StoredInstallationOrder,
} from '@auth/installation/domain/installation-order.repository';
import { InstallationJobNotFoundError } from '@auth/installation/domain/installation-job.errors';

/**
 * The installer behind the caller's token: sub, then installers.user_id.
 * Checked on every request, so a suspension shuts out tokens already issued.
 */
export async function currentInstaller(
  deps: { tokens: TokenService; installers: InstallerRepository },
  accessToken: string,
): Promise<StoredInstaller> {
  const user = deps.tokens.resolveAccessToken(accessToken);
  if (!user) throw new InvalidAccessTokenError();
  const installer = await deps.installers.findByUserId(user.id);
  if (installer?.status !== 'active') throw new ForbiddenError('This endpoint is reserved for installers');
  return installer;
}

/** The caller's own job. Another installer's job answers exactly like a missing one. */
export async function installerJob(
  deps: { tokens: TokenService; installers: InstallerRepository; orders: InstallationOrderRepository },
  accessToken: string,
  jobId: string,
): Promise<{ installer: StoredInstaller; order: StoredInstallationOrder }> {
  const installer = await currentInstaller(deps, accessToken);
  const order = await deps.orders.findById(jobId);
  if (!order || order.installerId !== installer.id) throw new InstallationJobNotFoundError();
  return { installer, order };
}
