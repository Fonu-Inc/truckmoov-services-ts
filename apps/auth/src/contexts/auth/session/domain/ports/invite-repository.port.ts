export type StoredInvite = {
  id: string;
  email: string;
  role: string;
  tenantId: string;
  token: string;
  invitedBy: string;
  status: 'pending' | 'accepted' | 'expired';
  expiresAt: Date;
  createdAt: Date;
};

export interface InviteRepository {
  save(invite: StoredInvite): Promise<void>;
  findById(id: string): Promise<StoredInvite | null>;
  findByToken(token: string): Promise<StoredInvite | null>;
  findByEmail(email: string): Promise<StoredInvite | null>;
  findPendingByEmailForTenant(
    tenantId: string,
    email: string,
  ): Promise<StoredInvite | null>;
  listPendingByTenant(tenantId: string): Promise<StoredInvite[]>;
  markAccepted(token: string): Promise<void>;
  deleteById(id: string): Promise<void>;
  deleteByTenantId(tenantId: string): Promise<void>;
}

export const INVITE_REPOSITORY = Symbol('INVITE_REPOSITORY');
