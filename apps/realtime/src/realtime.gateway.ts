import { Inject, Logger } from '@nestjs/common';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { AppConfigService } from '@shared/config';
import { RealtimeTokenService } from './realtime-token.service';
import { roomFor } from './tenant-subject';

/**
 * The socket surface. Server to client only.
 *
 * Nothing a client sends is acted on. Mark-read, delete and move-folder stay on
 * REST through Kong, which keeps rate limiting, request logging and
 * authorisation in one place and keeps mailbox rules out of this service.
 *
 * The path is explicit because socket.io's default "/socket.io" matches no Kong
 * route, and Kong has no catch-all.
 */
@WebSocketGateway({
  path: '/realtime/socket.io',
  // CORS does not apply to a WebSocket handshake, so the browser will not stop
  // a cross-origin connection. This allowlist is the only thing that does.
  cors: false,
  serveClient: false,
})
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(RealtimeGateway.name);
  private connections = 0;

  @WebSocketServer()
  server!: Server;

  constructor(
    @Inject(AppConfigService) private readonly config: AppConfigService,
    @Inject(RealtimeTokenService) private readonly tokens: RealtimeTokenService,
  ) {}

  handleConnection(client: Socket): void {
    if (!this.originAllowed(client)) {
      this.refuse(client, 'origin_not_allowed');
      return;
    }

    if (this.connections >= this.config.realtime.maxConnections) {
      // Refused rather than accepted and starved. A pod at its cap should shed
      // load visibly instead of degrading every existing connection.
      this.refuse(client, 'capacity_reached');
      return;
    }

    // Read from the handshake auth frame, not a query parameter: a query string
    // is written to proxy and access logs, and this is a bearer token.
    const token = (client.handshake.auth as { token?: string } | undefined)?.token;
    const principal = this.tokens.verify(token);
    // Rooms are tenants' live traffic; only the tenant portal has any here.
    if (!principal || principal.portal !== 'tenant') {
      this.refuse(client, 'unauthenticated');
      return;
    }

    // The room comes from the verified claim. A client cannot ask to join a
    // room, so it cannot ask for another tenant's traffic.
    client.data.tenantId = principal.tenantId;
    void client.join(roomFor(principal.tenantId));

    this.connections += 1;
    this.logger.log(`socket_connected:${principal.tenantId}:open=${this.connections}`);
  }

  handleDisconnect(client: Socket): void {
    if (client.data?.tenantId) this.connections = Math.max(0, this.connections - 1);
  }

  /** Delivers to one tenant's room. Called by the bridge, never by a client. */
  emitToTenant(tenantId: string, event: string, payload: unknown): void {
    this.server?.to(roomFor(tenantId)).emit(event, payload);
  }

  openConnections(): number {
    return this.connections;
  }

  private originAllowed(client: Socket): boolean {
    const allowed = this.config.realtime.allowedOrigins;
    if (allowed.length === 0) return false;

    const origin = client.handshake.headers.origin;
    return typeof origin === 'string' && allowed.includes(origin);
  }

  private refuse(client: Socket, reason: string): void {
    this.logger.warn(`socket_refused:${reason}`);
    client.emit('refused', { reason });
    client.disconnect(true);
  }
}
