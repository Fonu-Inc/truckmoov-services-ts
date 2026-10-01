import { Inject, Injectable } from '@nestjs/common';
import { AccessClient } from '@shared/access';
import { SYSTEM_TENANT_ID } from '@shared/identity';
import { RealtimeTokenService } from '../realtime-token.service';
import { PlatformMessagingCommands } from './platform-messaging.commands';
import {
  PERMISSION_MANAGE,
  PERMISSION_READ,
  fail,
  type Ack,
  type ReadPayload,
  type SendPayload,
} from './protocol';

export type Refusal = 'unauthenticated' | 'forbidden';
export type Admission = { ok: true; userId: string } | { ok: false; reason: Refusal };

/** Who may use the platform inbox, decided by auth's current answer, never by the token alone. */
@Injectable()
export class PlatformMessagingService {
  constructor(
    @Inject(RealtimeTokenService) private readonly tokens: RealtimeTokenService,
    @Inject(AccessClient) private readonly access: AccessClient,
    @Inject(PlatformMessagingCommands) private readonly commands: PlatformMessagingCommands,
  ) {}

  async admit(token: string | undefined): Promise<Admission> {
    const principal = this.tokens.verify(token);
    if (!principal) return { ok: false, reason: 'unauthenticated' };
    if (principal.portal !== 'admin' || principal.tenantId !== SYSTEM_TENANT_ID) {
      return { ok: false, reason: 'forbidden' };
    }
    const refusal = await this.refusal(principal.userId, PERMISSION_READ);
    return refusal ? { ok: false, reason: refusal } : { ok: true, userId: principal.userId };
  }

  async send(userId: string, payload: SendPayload): Promise<Ack> {
    return this.guarded(userId, PERMISSION_MANAGE, () => this.commands.send(userId, payload));
  }

  async markRead(userId: string, payload: ReadPayload): Promise<Ack> {
    return this.guarded(userId, PERMISSION_MANAGE, () => this.commands.read(userId, payload));
  }

  private async guarded(userId: string, permission: string, run: () => Promise<Ack>): Promise<Ack> {
    const refusal = await this.refusal(userId, permission);
    return refusal ? fail(refusal) : run();
  }

  async refusal(userId: string, permission: string): Promise<Refusal | null> {
    const access = await this.access.get(userId);
    if (access === undefined) return 'forbidden';
    if (access === null || !access.active) return 'unauthenticated';
    if (access.portal !== 'admin' || access.tenantId !== SYSTEM_TENANT_ID) return 'forbidden';
    return (access.permissions as string[]).includes(permission) ? null : 'forbidden';
  }
}
