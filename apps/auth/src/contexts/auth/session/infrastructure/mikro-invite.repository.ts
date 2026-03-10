import { Injectable } from "@nestjs/common";
import { AppConfigService } from "@shared/config";
import type { InviteRepository, StoredInvite } from "../domain/ports/invite-repository.port";
import { InviteRecord, getAuthOrm } from "./persistence/auth-orm";

@Injectable()
export class MikroInviteRepository implements InviteRepository {
  constructor(private readonly config: AppConfigService) {}

  async save(invite: StoredInvite): Promise<void> {
    const orm = await getAuthOrm(this.config.db);
    const em = orm.em.fork();
    await em.upsert(InviteRecord, { ...invite });
  }

  async findByToken(token: string): Promise<StoredInvite | null> {
    const orm = await getAuthOrm(this.config.db);
    const em = orm.em.fork();
    const record = await em.findOne(InviteRecord, { token });
    return record as StoredInvite | null;
  }

  async findByEmail(email: string): Promise<StoredInvite | null> {
    const orm = await getAuthOrm(this.config.db);
    const em = orm.em.fork();
    const record = await em.findOne(InviteRecord, { email, status: "pending" });
    return record as StoredInvite | null;
  }

  async markAccepted(token: string): Promise<void> {
    const orm = await getAuthOrm(this.config.db);
    const em = orm.em.fork();
    await em.nativeUpdate(InviteRecord, { token }, { status: "accepted" });
  }
}
