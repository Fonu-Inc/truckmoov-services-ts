import { createHmac } from 'node:crypto';
import { createServer, type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Server } from 'socket.io';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { verifyBusEvent, signBusEvent, type EventEnvelope } from '@shared/eventbus';
import { PlatformMessagingBridge } from '../../../apps/realtime/src/platform-messaging/platform-messaging.bridge';
import { PlatformMessagingCommands } from '../../../apps/realtime/src/platform-messaging/platform-messaging.commands';
import { PlatformMessagingGateway } from '../../../apps/realtime/src/platform-messaging/platform-messaging.gateway';
import { PlatformMessagingService } from '../../../apps/realtime/src/platform-messaging/platform-messaging.service';
import { NAMESPACE } from '../../../apps/realtime/src/platform-messaging/protocol';
import { RealtimeTokenService } from '../../../apps/realtime/src/realtime-token.service';
import { MiniSocketClient } from './mini-socket-client';

const JWT = 'test-secret';
const SIGNING = 'signing-secret';
const ORIGIN = 'https://admin.truckmoov.com';
const CLIENT_ID = '3f0c6c1e-8f0a-4a63-9d53-0c3b3f6f2a11';

type Access = { userId: string; tenantId: string; portal: string; active: boolean; permissions: string[] };

function token(userId: string, tenantId: string, role: string): string {
  const payload = Buffer.from(
    JSON.stringify({ sub: userId, email: 'a@b.com', role, tenantId, exp: Math.floor(Date.now() / 1000) + 3600 }),
  ).toString('base64url');
  return `${payload}.${createHmac('sha256', JWT).update(payload).digest('base64url')}`;
}

const staff = (id: string) => token(id, 'system', 'PLATFORM_ADMIN');

function access(userId: string, permissions: string[], over: Partial<Access> = {}): Access {
  return { userId, tenantId: 'system', portal: 'admin', active: true, permissions, ...over };
}

describe('platform messaging socket', () => {
  const realtime = { maxConnections: 50, allowedOrigins: [ORIGIN] };
  const config = {
    identity: { publicKeys: '', legacySecret: JWT },
    realtime,
    eventSigningSecret: SIGNING,
    eventAcceptUnsigned: false,
  } as never;
  const directory = new Map<string, Access>();
  const published: Array<{ subject: string; envelope: EventEnvelope }> = [];
  const link = {
    publish: vi.fn(async (subject: string, envelope: EventEnvelope) => {
      published.push({ subject, envelope });
    }),
  };
  let http: HttpServer;
  let io: Server;
  let gateway: PlatformMessagingGateway;
  let port: number;
  const opened: MiniSocketClient[] = [];

  async function connect(value: string | undefined) {
    const client = await MiniSocketClient.open(port, NAMESPACE, value);
    opened.push(client);
    return client;
  }

  beforeAll(async () => {
    const service = new PlatformMessagingService(
      new RealtimeTokenService(config),
      { get: async (id: string) => directory.get(id) ?? null } as never,
      new PlatformMessagingCommands(config, link as never),
    );
    gateway = new PlatformMessagingGateway(config, service, link as never);
    http = createServer();
    io = new Server(http, { path: '/realtime/socket.io', serveClient: false });
    const namespace = io.of(NAMESPACE);
    namespace.use((socket, next) => {
      socket.handshake.headers.origin = ORIGIN;
      next();
    });
    gateway.server = namespace;
    gateway.afterInit(namespace);
    namespace.on('connection', (socket) => {
      gateway.handleConnection(socket);
      socket.on('disconnect', () => gateway.handleDisconnect(socket));
    });
    await new Promise<void>((resolve) => http.listen(0, '127.0.0.1', resolve));
    port = (http.address() as AddressInfo).port;
  });

  afterAll(async () => {
    await io.close();
  });

  afterEach(async () => {
    const clients = opened.splice(0);
    for (const client of clients) client.close();
    await Promise.all(clients.map((client) => client.until(() => client.closed).catch(() => undefined)));
    realtime.maxConnections = 50;
  });

  beforeEach(() => {
    directory.clear();
    published.length = 0;
    link.publish.mockClear();
    directory.set('reader', access('reader', ['admin.messaging.read']));
    directory.set('manager', access('manager', ['admin.messaging.read', 'admin.messaging.manage']));
  });

  describe('admission', () => {
    it('refuses a handshake with no token', async () => {
      const client = await connect(undefined);
      expect(client.connectError).toBe('unauthenticated');
    });

    it('refuses a tenant portal token', async () => {
      const client = await connect(token('manager', 'tenant-a', 'FLEET_ADMIN'));
      expect(client.connectError).toBe('forbidden');
    });

    it('refuses a staff user without admin.messaging.read', async () => {
      directory.set('nobody', access('nobody', ['admin.dashboard.read']));
      const client = await connect(staff('nobody'));
      expect(client.connectError).toBe('forbidden');
    });

    it('refuses a suspended staff user', async () => {
      directory.set('gone', access('gone', ['admin.messaging.read'], { active: false }));
      const client = await connect(staff('gone'));
      expect(client.connectError).toBe('unauthenticated');
    });

    it('refuses a user whose access auth places outside the system tenant', async () => {
      directory.set('moved', access('moved', ['admin.messaging.read'], { tenantId: 'tenant-a' }));
      const client = await connect(staff('moved'));
      expect(client.connectError).toBe('forbidden');
    });

    it('admits a reader and delivers room broadcasts', async () => {
      const client = await connect(staff('reader'));
      expect(client.connected).toBe(true);

      gateway.emitToStaff('message.created', { conversation_id: 'c1' });

      expect(await client.next('message.created')).toEqual({ conversation_id: 'c1' });
    });
  });

  describe('message.send', () => {
    const body = { client_message_id: CLIENT_ID, conversation_id: 'wac-1', text: '  hello  ' };

    it('refuses a reader', async () => {
      const client = await connect(staff('reader'));
      expect(await client.emit('message.send', body)).toMatchObject({ ok: false, error: { code: 'forbidden' } });
      expect(published).toHaveLength(0);
    });

    it('acks queued and publishes a signed command for a manager', async () => {
      const client = await connect(staff('manager'));

      const ack = await client.emit('message.send', body);

      expect(ack).toEqual({ ok: true, state: 'queued', client_message_id: CLIENT_ID });
      const [{ subject, envelope }] = published;
      expect(subject).toBe('tm.system.messaging.send.requested');
      expect(envelope).toMatchObject({
        id: CLIENT_ID,
        tenant_id: 'system',
        actor: { user_id: 'manager' },
        data: { client_message_id: CLIENT_ID, conversation_id: 'wac-1', text: 'hello' },
      });
      expect(verifyBusEvent(SIGNING, subject, envelope, {})).toEqual({ ok: true, signed: true });
    });

    it('treats a repeated client id as the same command', async () => {
      const client = await connect(staff('manager'));

      const first = await client.emit('message.send', body);
      const second = await client.emit('message.send', body);

      expect(second).toEqual(first);
      expect(published.map((item) => item.envelope.id)).toEqual([CLIENT_ID, CLIENT_ID]);
    });

    it('rejects malformed payloads without publishing', async () => {
      const client = await connect(staff('manager'));
      const bad = [
        null,
        { ...body, client_message_id: 'not-a-uuid' },
        { ...body, text: '   ' },
        { ...body, text: 'x'.repeat(4097) },
        { ...body, conversation_id: '' },
        { ...body, conversation_id: { $ne: 1 } },
      ];
      for (const payload of bad) {
        expect(await client.emit('message.send', payload)).toMatchObject({ ok: false, error: { code: 'invalid_payload' } });
      }
      expect(published).toHaveLength(0);
    });

    it('limits sends per socket', async () => {
      const client = await connect(staff('manager'));
      const results: Array<{ ok: boolean; error?: { code: string } }> = [];
      for (let i = 0; i < 11; i += 1) {
        results.push((await client.emit('message.send', body)) as never);
      }
      expect(results.slice(0, 10).every((item) => item.ok)).toBe(true);
      expect(results[10]).toMatchObject({ ok: false, error: { code: 'rate_limited' } });
    });

    it('reports unavailable when the bus is down', async () => {
      link.publish.mockRejectedValueOnce(new Error('down'));
      const client = await connect(staff('manager'));
      expect(await client.emit('message.send', body)).toMatchObject({ ok: false, error: { code: 'unavailable' } });
    });

    it('checks permission again on every event', async () => {
      const client = await connect(staff('manager'));
      directory.set('manager', access('manager', ['admin.messaging.read']));

      expect(await client.emit('message.send', body)).toMatchObject({ ok: false, error: { code: 'forbidden' } });
    });

    it('drops the socket when the account is suspended mid-session', async () => {
      const client = await connect(staff('manager'));
      directory.set('manager', access('manager', ['admin.messaging.manage'], { active: false }));

      expect(await client.emit('message.send', body)).toMatchObject({ ok: false, error: { code: 'unauthenticated' } });
      await client.until(() => client.closed);
    });
  });

  describe('conversation.read', () => {
    it('publishes a signed read command for a manager', async () => {
      const client = await connect(staff('manager'));

      expect(await client.emit('conversation.read', { conversation_id: 'wac-1' })).toEqual({ ok: true });

      const [{ subject, envelope }] = published;
      expect(subject).toBe('tm.system.messaging.read.requested');
      expect(envelope).toMatchObject({ actor: { user_id: 'manager' }, data: { conversation_id: 'wac-1' } });
      expect(verifyBusEvent(SIGNING, subject, envelope, {}).ok).toBe(true);
    });

    it('refuses a reader and a bad payload', async () => {
      const reader = await connect(staff('reader'));
      expect(await reader.emit('conversation.read', { conversation_id: 'wac-1' })).toMatchObject({
        ok: false,
        error: { code: 'forbidden' },
      });
      const manager = await connect(staff('manager'));
      expect(await manager.emit('conversation.read', {})).toMatchObject({ ok: false, error: { code: 'invalid_payload' } });
    });
  });

  describe('access changes', () => {
    it('disconnects a user who lost read access', async () => {
      const client = await connect(staff('reader'));
      directory.set('reader', access('reader', []));

      await (gateway as unknown as { recheck(id: string): Promise<void> }).recheck('reader');

      await client.until(() => client.closed);
    });

    it('keeps a user who still has read access', async () => {
      const client = await connect(staff('reader'));

      await (gateway as unknown as { recheck(id: string): Promise<void> }).recheck('reader');

      expect(client.closed).toBe(false);
    });
  });

  describe('capacity', () => {
    it('refuses past the connection cap and frees a slot on disconnect', async () => {
      realtime.maxConnections = 2;
      const first = await connect(staff('reader'));
      await connect(staff('manager'));
      const over = await connect(staff('manager'));
      expect(over.connectError).toBe('unavailable');

      first.close();
      await vi.waitFor(async () => {
        const again = await connect(staff('reader'));
        expect(again.connected).toBe(true);
      });
    });
  });
});

describe('platform messaging bridge', () => {
  const subject = 'tm.system.messaging.message.created';
  const base: EventEnvelope = {
    id: 'evt-1',
    type: 'messaging.message.created',
    version: 1,
    occurred_at: '2026-10-01T00:00:00.000Z',
    tenant_id: 'system',
    data: { conversation_id: 'c1', message: { id: 'm1' } },
  };

  function build(acceptUnsigned = false) {
    const gateway = { emitToStaff: vi.fn() };
    const config = { eventSigningSecret: SIGNING, eventAcceptUnsigned: acceptUnsigned } as never;
    return { gateway, bridge: new PlatformMessagingBridge(config, {} as never, gateway as never) };
  }

  it('forwards a signed event under its client event name', () => {
    const { gateway, bridge } = build();
    bridge.forward(subject, signBusEvent(SIGNING, subject, base));
    expect(gateway.emitToStaff).toHaveBeenCalledWith('message.created', base.data);
  });

  it('drops an unsigned event', () => {
    const { gateway, bridge } = build();
    bridge.forward(subject, base);
    expect(gateway.emitToStaff).not.toHaveBeenCalled();
  });

  it('drops an event signed with another secret or tampered after signing', () => {
    const { gateway, bridge } = build(true);
    bridge.forward(subject, signBusEvent('other-secret', subject, base));
    bridge.forward(subject, { ...signBusEvent(SIGNING, subject, base), data: { conversation_id: 'c2' } });
    expect(gateway.emitToStaff).not.toHaveBeenCalled();
  });

  it('drops a signed event replayed onto another tenant subject or another event name', () => {
    const { gateway, bridge } = build();
    const signed = signBusEvent(SIGNING, 'tm.tenant-a.messaging.message.created', base);
    bridge.forward(subject, signed);
    bridge.forward('tm.system.messaging.unknown', signBusEvent(SIGNING, 'tm.system.messaging.unknown', base));
    expect(gateway.emitToStaff).not.toHaveBeenCalled();
  });

  it('accepts an unsigned event only while the rollout flag is on', () => {
    const { gateway, bridge } = build(true);
    bridge.forward(subject, base);
    expect(gateway.emitToStaff).toHaveBeenCalledTimes(1);
  });
});
