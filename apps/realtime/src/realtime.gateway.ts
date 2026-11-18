import { Inject, Logger, Optional } from '@nestjs/common';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { AppConfigService } from '@shared/config';
import { RealtimeTokenService, type RealtimePrincipal } from './realtime-token.service';
import { normalizeRole, Role } from '@shared/rbac';
import { LiveScopeClient } from './live-scope.client';
import { AppCheckVerifier } from './app-check.verifier';
import { ownerRoomFor, roomFor, scopedRoomFor, vehicleRoomFor } from './tenant-subject';

const MAX_TIMER_MS = 2_147_483_647;

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
  // a cross-origin connection. The origin allowlist is the only thing that does.
  cors: false,
  serveClient: false,
})
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(RealtimeGateway.name);
  private connections = 0;
  // shortcut: only suspensions seen since this pod booted, add an auth status lookup if a restart window matters.
  private readonly suspended = new Set<string>();
  // Sockets limited to their own vehicles, per tenant, so per-vehicle emits are skipped when there are none.
  private readonly scopedSockets = new Map<string, number>();

  @WebSocketServer()
  server!: Server;

  constructor(
    @Inject(AppConfigService) private readonly config: AppConfigService,
    @Inject(RealtimeTokenService) private readonly tokens: RealtimeTokenService,
    @Optional() @Inject(LiveScopeClient) private readonly scopes?: LiveScopeClient,
    @Optional() @Inject(AppCheckVerifier) private readonly appCheck?: AppCheckVerifier,
  ) {}

  handleConnection(client: Socket): void | Promise<void> {
    // A browser always sends Origin, so one that is present must be allowlisted. Only a
    // non-browser client sends none, and it must then prove it is the genuine mobile app
    // with App Check, checked below once the token has passed.
    const native = client.handshake.headers.origin === undefined;
    if (!native && !this.originAllowed(client)) {
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
    if (this.suspended.has(principal.tenantId)) {
      this.refuse(client, 'tenant_suspended');
      return;
    }

    if (native) return this.admitApp(client, principal);
    return this.enter(client, principal);
  }

  private async admitApp(client: Socket, principal: RealtimePrincipal): Promise<void> {
    const appCheck = (client.handshake.auth as { appCheck?: unknown } | undefined)?.appCheck;
    const genuine = this.appCheck ? await this.appCheck.verify(appCheck) : false;
    if (!client.connected) return;
    if (!genuine) {
      this.refuse(client, 'app_check_failed');
      return;
    }
    return this.enter(client, principal);
  }

  private enter(client: Socket, principal: RealtimePrincipal): void | Promise<void> {
    // An owner operator seated in someone else's organisation sees only their
    // own vehicles, as on REST; fleet decides which those are.
    if (normalizeRole(principal.role) === Role.OWNER_OPERATOR) return this.admitOwnerOperator(client, principal);

    // The room comes from the verified claim. A client cannot ask to join a
    // room, so it cannot ask for another tenant's traffic.
    void client.join(roomFor(principal.tenantId));
    this.admit(client, principal);
  }

  private async admitOwnerOperator(client: Socket, principal: RealtimePrincipal): Promise<void> {
    const scope = this.scopes ? await this.scopes.vehicleIdsFor(principal.tenantId, principal.userId) : undefined;
    if (!client.connected) return;
    if (scope === undefined || this.suspended.has(principal.tenantId)) {
      this.refuse(client, scope === undefined ? 'scope_unavailable' : 'tenant_suspended');
      return;
    }
    if (scope === null) {
      void client.join(roomFor(principal.tenantId));
    } else {
      void client.join([
        scopedRoomFor(principal.tenantId),
        ownerRoomFor(principal.tenantId, principal.userId),
        ...scope.map((id) => vehicleRoomFor(principal.tenantId, id)),
      ]);
      client.data.scoped = true;
      this.scopedSockets.set(principal.tenantId, (this.scopedSockets.get(principal.tenantId) ?? 0) + 1);
    }
    this.admit(client, principal);
  }

  private admit(client: Socket, principal: RealtimePrincipal): void {
    client.data.tenantId = principal.tenantId;
    const expiry = setTimeout(() => client.disconnect(true), Math.min(principal.exp * 1000 - Date.now(), MAX_TIMER_MS));
    expiry.unref?.();
    client.data.expiry = expiry;

    this.connections += 1;
    this.logger.log(`socket_connected:${principal.tenantId}:open=${this.connections}`);
  }

  handleDisconnect(client: Socket): void {
    clearTimeout(client.data?.expiry);
    if (client.data?.tenantId) this.connections = Math.max(0, this.connections - 1);
    if (client.data?.scoped) {
      const left = (this.scopedSockets.get(client.data.tenantId) ?? 1) - 1;
      if (left > 0) this.scopedSockets.set(client.data.tenantId, left);
      else this.scopedSockets.delete(client.data.tenantId);
    }
  }

  /** Whether any socket in this tenant is limited to its own vehicles. */
  hasScopedSockets(tenantId: string): boolean {
    return this.scopedSockets.has(tenantId);
  }

  /** Delivers to every socket limited to its own vehicles in this tenant. */
  emitToScoped(tenantId: string, event: string, payload: unknown): void {
    this.server?.to(scopedRoomFor(tenantId)).emit(event, payload);
  }

  /** Delivers to one owner operator's limited sockets. */
  emitToOwner(tenantId: string, ownerOperatorId: string, event: string, payload: unknown): void {
    this.server?.to(ownerRoomFor(tenantId, ownerOperatorId)).emit(event, payload);
  }

  /** Vehicles an owner operator added while connected join their live feed straight away. */
  addOwnedVehicles(tenantId: string, ownerOperatorId: string, vehicleIds: readonly string[]): void {
    this.server?.in(ownerRoomFor(tenantId, ownerOperatorId)).socketsJoin(vehicleIds.map((id) => vehicleRoomFor(tenantId, id)));
  }

  /** Delivers to the sockets limited to this vehicle. The tenant room gets its own copy. */
  emitToVehicle(tenantId: string, vehicleId: string, event: string, payload: unknown): void {
    this.server?.to(vehicleRoomFor(tenantId, vehicleId)).emit(event, payload);
  }

  /** Delivers to one tenant's room. Called by the bridge, never by a client. */
  emitToTenant(tenantId: string, event: string, payload: unknown): void {
    this.server?.to(roomFor(tenantId)).emit(event, payload);
  }

  /** A suspended tenant keeps no live sockets. */
  disconnectTenant(tenantId: string): void {
    this.suspended.add(tenantId);
    this.server?.in([roomFor(tenantId), scopedRoomFor(tenantId)]).disconnectSockets(true);
  }

  reinstateTenant(tenantId: string): void {
    this.suspended.delete(tenantId);
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
