import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHmac } from 'node:crypto';
import { ServiceUnavailableException } from '@nestjs/common';
import { RealtimeGateway } from '../../../apps/realtime/src/realtime.gateway';
import { RealtimeTokenService } from '../../../apps/realtime/src/realtime-token.service';
import { NatsFanoutBridge } from '../../../apps/realtime/src/nats-fanout.bridge';
import { HealthController } from '../../../apps/realtime/src/health.controller';
import { signBusEvent } from '@shared/eventbus';

const SECRET = 'test-secret';
const ORIGIN = 'https://dev.truckmoov.com';
const SIGNING = 'bus-secret';
const config = {
  eventSigningSecret: SIGNING,
  eventAcceptUnsigned: false,
  identity: { signingKey: '', publicKeys: '', legacySecret: SECRET },
  realtime: { maxConnections: 10, allowedOrigins: [ORIGIN] },
  liveTracking: { frameIntervalMs: 1000 },
} as never;

function token(expOffsetSeconds: number) {
  const payload = Buffer.from(
    JSON.stringify({ sub: 'u', email: 'a@b.com', role: 'FLEET_ADMIN', tenantId: 'tenant-a', exp: Math.floor(Date.now() / 1000) + expOffsetSeconds }),
  ).toString('base64url');
  return `${payload}.${createHmac('sha256', SECRET).update(payload).digest('base64url')}`;
}

function socket(value: string) {
  return { handshake: { auth: { token: value }, headers: { origin: ORIGIN } }, data: {} as Record<string, unknown>, join: vi.fn(), emit: vi.fn(), disconnect: vi.fn() };
}

function busEvent(subject: string, data: Record<string, unknown>) {
  const tenant = subject.split('.')[1];
  return signBusEvent(SIGNING, subject, { id: 'e1', type: subject.split('.').slice(2).join('.'), version: 1, occurred_at: new Date().toISOString(), tenant_id: tenant, data });
}

afterEach(() => {
  vi.useRealTimers();
});

describe('a tenant socket', () => {
  it('is closed when its token expires', () => {
    vi.useFakeTimers();
    const gateway = new RealtimeGateway(config, new RealtimeTokenService(config));
    const client = socket(token(60));

    gateway.handleConnection(client as never);
    vi.advanceTimersByTime(59_000);
    expect(client.disconnect).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1_000);
    expect(client.disconnect).toHaveBeenCalledWith(true);
  });

  it('drops the expiry timer when it disconnects first', () => {
    vi.useFakeTimers();
    const gateway = new RealtimeGateway(config, new RealtimeTokenService(config));
    const client = socket(token(60));

    gateway.handleConnection(client as never);
    gateway.handleDisconnect(client as never);
    vi.advanceTimersByTime(60_000);
    expect(client.disconnect).not.toHaveBeenCalled();
  });

  it("is disconnected when its tenant is suspended", async () => {
    const handlers: Array<(subject: string, body: unknown) => void> = [];
    const link = { subscribe: vi.fn(async (_s: string, h: (subject: string, body: unknown) => void) => void handlers.push(h)) };
    const disconnectSockets = vi.fn();
    const gateway = new RealtimeGateway(config, new RealtimeTokenService(config));
    gateway.server = { to: vi.fn(() => ({ emit: vi.fn() })), in: vi.fn(() => ({ disconnectSockets })) } as never;
    const bridge = new NatsFanoutBridge(gateway, config, link as never);

    await bridge.onApplicationBootstrap();
    handlers[0]('tm.tenant-a.tenant.suspended', busEvent('tm.tenant-a.tenant.suspended', { reason: 'unpaid' }));
    bridge.onApplicationShutdown();

    expect(gateway.server.in).toHaveBeenCalledWith('tenant:tenant-a');
    expect(disconnectSockets).toHaveBeenCalledWith(true);

    const retry = socket(token(60));
    gateway.handleConnection(retry as never);
    expect(retry.disconnect).toHaveBeenCalledWith(true);
    expect(retry.join).not.toHaveBeenCalled();

    handlers[1]('tm.tenant-a.tenant.reinstated', busEvent('tm.tenant-a.tenant.reinstated', {}));
    const back = socket(token(60));
    gateway.handleConnection(back as never);
    expect(back.join).toHaveBeenCalledWith('tenant:tenant-a');
  });

  it('is not disconnected by an unsigned or cross-tenant suspension', async () => {
    const handlers: Array<(subject: string, body: unknown) => void> = [];
    const link = { subscribe: vi.fn(async (_s: string, h: (subject: string, body: unknown) => void) => void handlers.push(h)) };
    const disconnectSockets = vi.fn();
    const gateway = new RealtimeGateway(config, new RealtimeTokenService(config));
    gateway.server = { to: vi.fn(() => ({ emit: vi.fn() })), in: vi.fn(() => ({ disconnectSockets })) } as never;
    const bridge = new NatsFanoutBridge(gateway, config, link as never);

    await bridge.onApplicationBootstrap();
    handlers[0]('tm.tenant-a.tenant.suspended', { tenant_id: 'tenant-a', data: { reason: 'forged' } });
    handlers[0]('tm.tenant-a.tenant.suspended', busEvent('tm.tenant-b.tenant.suspended', {}));
    bridge.onApplicationShutdown();

    expect(disconnectSockets).not.toHaveBeenCalled();
    const client = socket(token(60));
    gateway.handleConnection(client as never);
    expect(client.join).toHaveBeenCalledWith('tenant:tenant-a');
  });
});

describe('the realtime pod without NATS', () => {
  it('fails boot when the bridge cannot subscribe', async () => {
    const link = { subscribe: vi.fn(async () => { throw new Error('ECONNREFUSED'); }) };
    const bridge = new NatsFanoutBridge({} as never, config, link as never);

    await expect(bridge.onApplicationBootstrap()).rejects.toThrow('ECONNREFUSED');
  });

  it('reports unhealthy while the link is down', () => {
    const gateway = { openConnections: () => 0 } as never;

    expect(() => new HealthController(gateway, { isUp: () => false } as never).health()).toThrow(ServiceUnavailableException);
    expect(new HealthController(gateway, { isUp: () => true } as never).health().status).toBe(true);
  });
});
