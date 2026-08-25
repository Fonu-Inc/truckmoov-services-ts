import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createHmac } from 'node:crypto';
import { RealtimeGateway } from '../../../apps/realtime/src/realtime.gateway';
import { RealtimeTokenService } from '../../../apps/realtime/src/realtime-token.service';

const SECRET = 'test-secret';
const ORIGIN = 'https://dev.truckmoov.com';

function config(maxConnections = 2000, origins = [ORIGIN]) {
  return {
    auth: { jwtSecret: SECRET },
    realtime: { maxConnections, allowedOrigins: origins, port: 3006, drainSeconds: 10 },
  } as never;
}

function makeToken(tenantId: string, secret = SECRET, expOffsetSeconds = 3600) {
  const payload = JSON.stringify({
    sub: 'user-1',
    email: 'a@b.com',
    role: 'FLEET_ADMIN',
    tenantId,
    exp: Math.floor(Date.now() / 1000) + expOffsetSeconds,
  });
  const encoded = Buffer.from(payload).toString('base64url');
  const signature = createHmac('sha256', secret).update(encoded).digest('base64url');
  return `${encoded}.${signature}`;
}

// origin is null for "handshake carried no Origin header". A default parameter
// would not express that: JS applies the default on an explicit undefined, so
// the case under test would silently receive the allowed origin instead.
function socket(token?: string, origin: string | null = ORIGIN) {
  return {
    handshake: { auth: token ? { token } : {}, headers: origin ? { origin } : {} },
    data: {} as Record<string, unknown>,
    join: vi.fn(),
    emit: vi.fn(),
    disconnect: vi.fn(),
  };
}

function build(maxConnections = 2000, origins = [ORIGIN]) {
  const cfg = config(maxConnections, origins);
  const gateway = new RealtimeGateway(cfg, new RealtimeTokenService(cfg));
  gateway.server = { to: vi.fn(() => ({ emit: vi.fn() })) } as never;
  return gateway;
}

describe('who gets a socket', () => {
  let gateway: RealtimeGateway;

  beforeEach(() => {
    gateway = build();
  });

  it('admits a valid token and joins the tenant room', () => {
    const client = socket(makeToken('tenant-a'));

    gateway.handleConnection(client as never);

    expect(client.join).toHaveBeenCalledWith('tenant:tenant-a');
    expect(client.disconnect).not.toHaveBeenCalled();
  });

  it('refuses a socket with no token', () => {
    const client = socket(undefined);

    gateway.handleConnection(client as never);

    expect(client.disconnect).toHaveBeenCalledWith(true);
    expect(client.join).not.toHaveBeenCalled();
  });

  it('refuses a token signed with a different secret', () => {
    const client = socket(makeToken('tenant-a', 'other-secret'));

    gateway.handleConnection(client as never);

    expect(client.disconnect).toHaveBeenCalledWith(true);
  });

  it('refuses an expired token', () => {
    const client = socket(makeToken('tenant-a', SECRET, -60));

    gateway.handleConnection(client as never);

    expect(client.disconnect).toHaveBeenCalledWith(true);
  });

  it('refuses a tampered payload', () => {
    const token = makeToken('tenant-a');
    const [, signature] = token.split('.');
    const forged = Buffer.from(
      JSON.stringify({ sub: 'x', email: 'x', role: 'x', tenantId: 'tenant-b', exp: 9999999999 }),
    ).toString('base64url');
    const client = socket(`${forged}.${signature}`);

    gateway.handleConnection(client as never);

    expect(client.disconnect).toHaveBeenCalledWith(true);
  });
});

// CORS does not apply to a WebSocket handshake, so this list is the only guard.
describe('origin allowlist', () => {
  it('refuses an origin that is not listed', () => {
    const gateway = build();
    const client = socket(makeToken('tenant-a'), 'https://evil.example.com');

    gateway.handleConnection(client as never);

    expect(client.disconnect).toHaveBeenCalledWith(true);
  });

  it('refuses a handshake carrying no origin at all', () => {
    const gateway = build();
    const client = socket(makeToken('tenant-a'), null);

    gateway.handleConnection(client as never);

    expect(client.disconnect).toHaveBeenCalledWith(true);
  });

  it('refuses everything when no origins are configured', () => {
    const gateway = build(2000, []);
    const client = socket(makeToken('tenant-a'));

    gateway.handleConnection(client as never);

    expect(client.disconnect).toHaveBeenCalledWith(true);
  });

  it('checks the origin before it looks at the token', () => {
    const gateway = build();
    const client = socket(undefined, 'https://evil.example.com');

    gateway.handleConnection(client as never);

    expect(client.emit).toHaveBeenCalledWith('refused', { reason: 'origin_not_allowed' });
  });
});

describe('connection cap', () => {
  it('refuses past the cap rather than degrading everyone', () => {
    const gateway = build(2);

    for (let i = 0; i < 2; i += 1) {
      gateway.handleConnection(socket(makeToken('tenant-a')) as never);
    }
    const overflow = socket(makeToken('tenant-a'));
    gateway.handleConnection(overflow as never);

    expect(gateway.openConnections()).toBe(2);
    expect(overflow.emit).toHaveBeenCalledWith('refused', { reason: 'capacity_reached' });
  });

  it('frees a slot on disconnect', () => {
    const gateway = build(1);
    const client = socket(makeToken('tenant-a'));
    gateway.handleConnection(client as never);

    gateway.handleDisconnect(client as never);

    expect(gateway.openConnections()).toBe(0);
  });

  it('does not free a slot for a socket that was never admitted', () => {
    const gateway = build(1);
    gateway.handleConnection(socket(makeToken('tenant-a')) as never);
    const refused = socket(undefined);
    gateway.handleConnection(refused as never);

    gateway.handleDisconnect(refused as never);

    expect(gateway.openConnections()).toBe(1);
  });
});

describe('delivery', () => {
  it('emits into the tenant room and nowhere else', () => {
    const gateway = build();
    const emit = vi.fn();
    const to = vi.fn(() => ({ emit }));
    gateway.server = { to } as never;

    gateway.emitToTenant('tenant-a', 'mailbox.updated', { newMessages: 2 });

    expect(to).toHaveBeenCalledWith('tenant:tenant-a');
    expect(emit).toHaveBeenCalledWith('mailbox.updated', { newMessages: 2 });
  });
});
