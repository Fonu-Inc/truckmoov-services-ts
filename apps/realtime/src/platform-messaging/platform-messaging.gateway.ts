import { Inject, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Namespace, Socket } from 'socket.io';
import { ACCESS_CHANGED_SUBJECT } from '@shared/access';
import { AppConfigService } from '@shared/config';
import { NatsLink } from '../nats-link.service';
import { PlatformMessagingService } from './platform-messaging.service';
import { NAMESPACE, PERMISSION_READ, ROOM, fail, parseRead, parseSend, type Ack } from './protocol';
import { TokenBucket } from './token-bucket';

const WINDOW_MS = 10_000;
const SEND_LIMIT = 10;
const READ_LIMIT = 30;

type Kind = 'send' | 'read';
type Limits = Record<Kind, TokenBucket>;
type AckFn = (response: Ack) => void;

/**
 * Staff inbox socket for the platform WhatsApp number. Admin portal and system
 * tenant only; every client event is checked against auth's current answer.
 * Clients cannot join or leave rooms: the server puts them in the one room.
 */
@WebSocketGateway({ namespace: NAMESPACE, path: '/realtime/socket.io', cors: false, serveClient: false })
export class PlatformMessagingGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect, OnApplicationBootstrap
{
  private readonly logger = new Logger(PlatformMessagingGateway.name);
  private connections = 0;
  private readonly byUser = new Map<string, Set<Socket>>();

  @WebSocketServer()
  server!: Namespace;

  constructor(
    @Inject(AppConfigService) private readonly config: AppConfigService,
    @Inject(PlatformMessagingService) private readonly service: PlatformMessagingService,
    @Inject(NatsLink) private readonly link: NatsLink,
  ) {}

  afterInit(namespace: Namespace): void {
    namespace.use((socket, next) => {
      void this.admit(socket).then(
        (reason) => next(reason ? new Error(reason) : undefined),
        () => next(new Error('unavailable')),
      );
    });
  }

  async onApplicationBootstrap(): Promise<void> {
    try {
      await this.link.asBroadcastBus().subscribeEveryInstance?.(ACCESS_CHANGED_SUBJECT, async (event) => {
        const userId = (event.data as { userId?: unknown }).userId;
        if (typeof userId === 'string') await this.recheck(userId);
      });
    } catch (error) {
      this.logger.error(`messaging_access_watch_failed:${error instanceof Error ? error.message : 'unknown'}`);
    }
  }

  handleConnection(client: Socket): void {
    const userId = client.data.userId as string | undefined;
    if (!userId) {
      client.disconnect(true);
      return;
    }
    client.data.counted = true;
    this.connections += 1;
    const sockets = this.byUser.get(userId) ?? new Set<Socket>();
    sockets.add(client);
    this.byUser.set(userId, sockets);

    void client.join(ROOM);
    const limits: Limits = {
      send: new TokenBucket(SEND_LIMIT, WINDOW_MS),
      read: new TokenBucket(READ_LIMIT, WINDOW_MS),
    };
    client.on('message.send', (raw: unknown, ack?: AckFn) => void this.handle(client, 'send', limits, raw, ack));
    client.on('conversation.read', (raw: unknown, ack?: AckFn) => void this.handle(client, 'read', limits, raw, ack));
    this.logger.log(`messaging_connected:open=${this.connections}`);
  }

  handleDisconnect(client: Socket): void {
    if (!client.data?.counted) return;
    this.connections = Math.max(0, this.connections - 1);
    const userId = client.data.userId as string;
    const sockets = this.byUser.get(userId);
    sockets?.delete(client);
    if (sockets?.size === 0) this.byUser.delete(userId);
  }

  emitToStaff(event: string, payload: unknown): void {
    this.server?.to(ROOM).emit(event, payload);
  }

  announceDrain(inMs: number): void {
    this.server?.emit('reconnect_soon', { inMs });
  }

  private async admit(socket: Socket): Promise<string | null> {
    if (!this.originAllowed(socket)) return 'forbidden';
    if (this.connections >= this.config.realtime.maxConnections) return 'unavailable';
    const token = (socket.handshake.auth as { token?: string } | undefined)?.token;
    const admission = await this.service.admit(token);
    if (!admission.ok) {
      this.logger.warn(`messaging_refused:${admission.reason}`);
      return admission.reason;
    }
    socket.data.userId = admission.userId;
    return null;
  }

  private async handle(client: Socket, kind: Kind, limits: Limits, raw: unknown, ack?: AckFn): Promise<void> {
    let response: Ack;
    try {
      response = await this.run(client, kind, limits, raw);
    } catch (error) {
      this.logger.warn(`messaging_event_failed:${kind}:${error instanceof Error ? error.message : 'unknown'}`);
      response = fail('unavailable');
    }
    if (typeof ack === 'function') ack(response);
    if (!response.ok && response.error.code === 'unauthenticated') client.disconnect(true);
  }

  private async run(client: Socket, kind: Kind, limits: Limits, raw: unknown): Promise<Ack> {
    if (!limits[kind].take()) return fail('rate_limited');
    const userId = client.data.userId as string;
    if (kind === 'send') {
      const payload = parseSend(raw);
      return payload ? this.service.send(userId, payload) : fail('invalid_payload');
    }
    const payload = parseRead(raw);
    return payload ? this.service.markRead(userId, payload) : fail('invalid_payload');
  }

  private async recheck(userId: string): Promise<void> {
    const sockets = this.byUser.get(userId);
    if (!sockets) return;
    if ((await this.service.refusal(userId, PERMISSION_READ)) === null) return;
    for (const socket of [...sockets]) socket.disconnect(true);
  }

  private originAllowed(client: Socket): boolean {
    const allowed = this.config.realtime.allowedOrigins;
    const origin = client.handshake.headers.origin;
    return allowed.length > 0 && typeof origin === 'string' && allowed.includes(origin);
  }
}
