import { Inject, Injectable } from '@nestjs/common';
import type { PermissionKey } from '@shared/access';
import { SYSTEM_TENANT_ID } from '@shared/identity';
import { Role } from '@shared/rbac';
import {
  AUTH_NOTIFIER,
  EmailTakenError,
  ID_GENERATOR,
  INVITE_REPOSITORY,
  SESSION_STORE,
  TOKEN_SERVICE,
  USER_REPOSITORY,
} from '@auth/session';
import type { AuthNotifier } from '@auth/session/domain/ports/auth-notifier.port';
import type { IdGenerator } from '@auth/session/domain/ports/id-generator.port';
import type { InviteRepository } from '@auth/session/domain/ports/invite-repository.port';
import type { SessionStore } from '@auth/session/domain/ports/session-store.port';
import type { TokenService } from '@auth/session/domain/ports/token-service.port';
import type { UserRepository } from '@auth/session/domain/ports/user-repository.port';
import {
  InstallerNotFoundError,
  InstallerStateError,
  type InstallerStatus,
} from '@auth/installation/domain/installer';
import {
  INSTALLER_REPOSITORY,
  type InstallerRepository,
  type StoredInstaller,
} from '@auth/installation/domain/installer.repository';
import {
  INSTALLATION_ORDER_REPOSITORY,
  type InstallationOrderRepository,
} from '@auth/installation/domain/installation-order.repository';
import { AccessResolver } from '../../../../access-resolver';
import { ActivityLogService } from '../../../../activity-log.service';
import {
  editedInstaller,
  installerEmail,
  newInstallerDetails,
  tallyJobs,
  toInstallerView,
  type InstallerDetailsInput,
} from './support/installer-admin.support';
import { requireStaff, type Staff } from './support/platform-staff';

const INVITE_TTL_MS = 72 * 60 * 60 * 1000;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

export type ListInstallersQuery = { search?: string; status?: InstallerStatus; page?: number; limit?: number };
export type CreateInstallerInput = InstallerDetailsInput & { email?: unknown };

/**
 * What platform admins do from the Installers page: add an installer (which
 * sends their invite), edit them, suspend and reactivate them, and resend an
 * invite that was not taken up.
 *
 * Checks the permission itself, like governance: the route rule only records
 * until enforcement is switched on.
 */
@Injectable()
export class ManageInstallersUseCases {
  constructor(
    @Inject(INSTALLER_REPOSITORY) private readonly installers: InstallerRepository,
    @Inject(INSTALLATION_ORDER_REPOSITORY) private readonly orders: InstallationOrderRepository,
    @Inject(INVITE_REPOSITORY) private readonly invites: InviteRepository,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(SESSION_STORE) private readonly sessions: SessionStore,
    @Inject(AUTH_NOTIFIER) private readonly notifier: AuthNotifier,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
    @Inject(TOKEN_SERVICE) private readonly tokens: TokenService,
    @Inject(AccessResolver) private readonly access: AccessResolver,
    @Inject(ActivityLogService) private readonly activity: ActivityLogService,
  ) {}

  async list(accessToken: string, query: ListInstallersQuery) {
    await this.staff(accessToken, 'admin.installers.read');
    const page = Math.max(1, Math.floor(query.page ?? 1));
    const limit = Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(query.limit ?? DEFAULT_PAGE_SIZE)));
    const found = await this.installers.list({ search: query.search, status: query.status }, { page, limit });
    const counts = await this.installers.countByStatus();
    const jobs = tallyJobs(await this.orders.countByInstaller(found.items.map((i) => i.id)));
    return {
      summary: {
        total: counts.invited + counts.active + counts.suspended,
        active: counts.active,
        invited: counts.invited,
        suspended: counts.suspended,
      },
      items: found.items.map((installer) => toInstallerView(installer, jobs.get(installer.id))),
      page,
      limit,
      total: found.total,
    };
  }

  async get(accessToken: string, id: string) {
    await this.staff(accessToken, 'admin.installers.read');
    return this.view(await this.found(id));
  }

  async create(accessToken: string, input: CreateInstallerInput) {
    const staff = await this.staff(accessToken, 'admin.installers.manage');
    const email = installerEmail(input.email);
    const details = newInstallerDetails(input);
    await this.assertEmailFree(email);

    const now = new Date();
    const installer: StoredInstaller = {
      id: this.ids.generate(),
      userId: null,
      code: await this.installers.nextCode(),
      ...details,
      email,
      team: '',
      state: null,
      city: null,
      photoKey: null,
      notificationPreferences: null,
      displayPreferences: null,
      workPreferences: null,
      status: 'invited',
      lastActivityAt: null,
      createdAt: now,
      updatedAt: now,
    };
    await this.installers.save(installer);
    await this.sendInvite(installer, staff.id);
    await this.audit(staff, 'system.installer.created', 'Installer added and invited', installer);
    return this.view(installer);
  }

  async update(accessToken: string, id: string, input: InstallerDetailsInput) {
    const staff = await this.staff(accessToken, 'admin.installers.manage');
    const installer = { ...editedInstaller(await this.found(id), input), updatedAt: new Date() };
    await this.installers.save(installer);
    await this.audit(staff, 'system.installer.updated', 'Installer details updated', installer);
    return this.view(installer);
  }

  /** Ends every session at once; an installer still invited loses the invite. */
  async suspend(accessToken: string, id: string) {
    const staff = await this.staff(accessToken, 'admin.installers.manage');
    const installer = await this.found(id);
    if (installer.status === 'suspended') throw new InstallerStateError('This installer is already suspended');

    const suspended = await this.saveStatus(installer, 'suspended');
    if (installer.userId) await this.disableAccount(installer.userId);
    else await this.cancelInvite(installer.email);
    await this.audit(staff, 'system.installer.suspended', 'Installer suspended', suspended);
    return this.view(suspended);
  }

  /** Back to active, or to invited with a fresh invite if it was never accepted. */
  async reactivate(accessToken: string, id: string) {
    const staff = await this.staff(accessToken, 'admin.installers.manage');
    const installer = await this.found(id);
    if (installer.status !== 'suspended') throw new InstallerStateError('Only a suspended installer can be reactivated');

    const reactivated = await this.saveStatus(installer, installer.userId ? 'active' : 'invited');
    if (installer.userId) await this.users.updateAccountStatus(installer.userId, 'enabled');
    else await this.sendInvite(reactivated, staff.id);
    await this.audit(staff, 'system.installer.reactivated', 'Installer reactivated', reactivated);
    return this.view(reactivated);
  }

  async resendInvite(accessToken: string, id: string) {
    const staff = await this.staff(accessToken, 'admin.installers.manage');
    const installer = await this.found(id);
    if (installer.status !== 'invited') throw new InstallerStateError('Only an invited installer can be sent a new invite');

    await this.sendInvite(installer, staff.id);
    await this.audit(staff, 'system.installer.invite_resent', 'Installer invite resent', installer);
    return this.view(installer);
  }

  private staff(accessToken: string, permission: PermissionKey): Promise<Staff> {
    return requireStaff({ tokens: this.tokens, access: this.access, users: this.users }, accessToken, permission);
  }

  private async found(id: string): Promise<StoredInstaller> {
    const installer = await this.installers.findById(id);
    if (!installer) throw new InstallerNotFoundError();
    return installer;
  }

  private async view(installer: StoredInstaller) {
    const jobs = tallyJobs(await this.orders.countByInstaller([installer.id]));
    return toInstallerView(installer, jobs.get(installer.id));
  }

  private async assertEmailFree(email: string): Promise<void> {
    const [installer, user, invite] = await Promise.all([
      this.installers.findByEmail(email),
      this.users.findByEmail(email),
      this.invites.findByEmail(email),
    ]);
    if (installer || user || invite) throw new EmailTakenError();
  }

  private async saveStatus(installer: StoredInstaller, status: InstallerStatus): Promise<StoredInstaller> {
    const updated = { ...installer, status, updatedAt: new Date() };
    await this.installers.save(updated);
    return updated;
  }

  private async disableAccount(userId: string): Promise<void> {
    await this.users.updateAccountStatus(userId, 'disabled');
    await this.sessions.deleteAllForUser(userId);
  }

  private async cancelInvite(email: string): Promise<void> {
    const invite = await this.invites.findByEmail(email);
    if (invite?.role === Role.INSTALLER && invite.status === 'pending') await this.invites.deleteById(invite.id);
  }

  /** Reuses a pending invite under a new token, so only the latest link works. */
  private async sendInvite(installer: StoredInstaller, invitedBy: string): Promise<void> {
    const pending = await this.invites.findByEmail(installer.email);
    const now = new Date();
    const invite = {
      id: pending?.role === Role.INSTALLER ? pending.id : this.ids.generate(),
      email: installer.email,
      role: Role.INSTALLER,
      tenantId: SYSTEM_TENANT_ID,
      token: this.ids.generate(),
      invitedBy,
      status: 'pending' as const,
      expiresAt: new Date(now.getTime() + INVITE_TTL_MS),
      createdAt: now,
    };
    await this.invites.save(invite);
    await this.notifier.sendInstallerInviteEmail({ email: invite.email, role: invite.role, inviteToken: invite.token });
  }

  private async audit(staff: Staff, action: string, summary: string, installer: StoredInstaller): Promise<void> {
    await this.activity.record({
      tenantId: SYSTEM_TENANT_ID,
      service: 'auth',
      action,
      entityType: 'installer',
      entityId: installer.id,
      summary: `${summary}: ${installer.code}`,
      actorId: staff.id,
      actorRole: staff.role,
      actorEmail: staff.email,
      metadata: { code: installer.code, email: installer.email, status: installer.status },
    });
  }
}
