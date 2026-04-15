import { Inject, Injectable } from '@nestjs/common';
import { AppConfigService } from '@shared/config';
import type {
  InviteRepository,
  StoredInvite,
} from '../domain/ports/invite-repository.port';
import { roleFromId, roleToId } from '@shared/rbac';
import { InviteRecord, getAuthOrm } from './persistence/auth-orm';

@Injectable()
export class MikroInviteRepository implements InviteRepository {
  constructor(
    @Inject(AppConfigService) private readonly config: AppConfigService,
  ) {}

  async save(invite: StoredInvite): Promise<void> {
    const orm = await getAuthOrm(this.config.db);
    const em = orm.em.fork();
    await em.upsert(InviteRecord, {
      id: invite.id,
      email: invite.email,
      roleId: roleToId(invite.role),
      tenantId: invite.tenantId,
      token: invite.token,
      invitedBy: invite.invitedBy,
      status: invite.status,
      expiresAt: invite.expiresAt,
      createdAt: invite.createdAt,
    });
  }

  async findById(id: string): Promise<StoredInvite | null> {
    const orm = await getAuthOrm(this.config.db);
    const em = orm.em.fork();
    const record = await em.findOne(InviteRecord, { id });
    return record
      ? {
          ...record,
          role: roleFromId(record.roleId),
          status: record.status as StoredInvite['status'],
        }
      : null;
  }

  async findByToken(token: string): Promise<StoredInvite | null> {
    const orm = await getAuthOrm(this.config.db);
    const em = orm.em.fork();
    const record = await em.findOne(InviteRecord, { token });
    return record
      ? {
          ...record,
          role: roleFromId(record.roleId),
          status: record.status as StoredInvite['status'],
        }
      : null;
  }

  async findByEmail(email: string): Promise<StoredInvite | null> {
    const orm = await getAuthOrm(this.config.db);
    const em = orm.em.fork();
    const record = await em.findOne(InviteRecord, { email, status: 'pending' });
    return record
      ? {
          ...record,
          role: roleFromId(record.roleId),
          status: record.status as StoredInvite['status'],
        }
      : null;
  }

  async findPendingByEmailForTenant(
    tenantId: string,
    email: string,
  ): Promise<StoredInvite | null> {
    const orm = await getAuthOrm(this.config.db);
    const em = orm.em.fork();
    const record = await em.findOne(
      InviteRecord,
      { tenantId, email, status: 'pending' },
      {
        orderBy: { createdAt: 'desc' },
      },
    );
    return record
      ? {
          ...record,
          role: roleFromId(record.roleId),
          status: record.status as StoredInvite['status'],
        }
      : null;
  }

  async listPendingByTenant(tenantId: string): Promise<StoredInvite[]> {
    const orm = await getAuthOrm(this.config.db);
    const em = orm.em.fork();
    const records = await em.find(
      InviteRecord,
      { tenantId, status: 'pending' },
      {
        orderBy: { createdAt: 'desc' },
      },
    );
    return records.map((record) => ({
      ...record,
      role: roleFromId(record.roleId),
      status: record.status as StoredInvite['status'],
    }));
  }

  async markAccepted(token: string): Promise<void> {
    const orm = await getAuthOrm(this.config.db);
    const em = orm.em.fork();
    await em.nativeUpdate(InviteRecord, { token }, { status: 'accepted' });
  }

  async deleteById(id: string): Promise<void> {
    const orm = await getAuthOrm(this.config.db);
    const em = orm.em.fork();
    await em.nativeDelete(InviteRecord, { id });
  }

  async deleteByTenantId(tenantId: string): Promise<void> {
    const orm = await getAuthOrm(this.config.db);
    const em = orm.em.fork();
    await em.nativeDelete(InviteRecord, { tenantId });
  }
}
