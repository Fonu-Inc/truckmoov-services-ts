import { describe, expect, it, vi } from 'vitest';
import { generateKeyPairSync, sign, type KeyObject } from 'node:crypto';
import { AppCheckVerifier } from '../../../apps/realtime/src/app-check.verifier';

const PROJECT = '123456789';
const APP = '1:123456789:ios:abc';
const NOW = 1_800_000_000_000;

const firebase = generateKeyPairSync('rsa', { modulusLength: 2048 });
const stranger = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwks = { keys: [{ ...firebase.publicKey.export({ format: 'jwk' }), kid: 'k1', alg: 'RS256', use: 'sig' }] };

const b64 = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');

function token(
  claims: Record<string, unknown> = {},
  { key = firebase.privateKey, header = {} }: { key?: KeyObject; header?: Record<string, unknown> } = {},
) {
  const h = b64({ alg: 'RS256', typ: 'JWT', kid: 'k1', ...header });
  const p = b64({
    iss: `https://firebaseappcheck.googleapis.com/${PROJECT}`,
    aud: [`projects/${PROJECT}`, 'projects/fleet-pro'],
    sub: APP,
    exp: NOW / 1000 + 3600,
    iat: NOW / 1000,
    ...claims,
  });
  return `${h}.${p}.${sign('RSA-SHA256', Buffer.from(`${h}.${p}`), key).toString('base64url')}`;
}

function verifier(settings: Partial<{ projectNumber: string; appIds: string[] }> = {}, load = vi.fn(async () => jwks)) {
  let now = NOW;
  const v = new AppCheckVerifier({ projectNumber: PROJECT, appIds: [APP], ...settings }, load, () => now);
  return { v, load, advance: (ms: number) => (now += ms) };
}

describe('App Check tokens', () => {
  it('accepts a token Firebase signed for this project and app', async () => {
    expect(await verifier().v.verify(token())).toBe(true);
  });

  it.each([
    ['another project', { iss: 'https://firebaseappcheck.googleapis.com/999' }],
    ['an audience without this project', { aud: ['projects/999'] }],
    ['a string audience', { aud: `projects/${PROJECT}` }],
    ['an expired token', { exp: NOW / 1000 - 1 }],
    ['an app that is not listed', { sub: '1:123456789:android:other' }],
    ['no app id', { sub: '' }],
  ])('refuses %s', async (_, claims) => {
    expect(await verifier().v.verify(token(claims))).toBe(false);
  });

  it('refuses a token signed by anyone but Firebase', async () => {
    expect(await verifier().v.verify(token({}, { key: stranger.privateKey }))).toBe(false);
  });

  it('refuses an unsigned token and an unknown key id', async () => {
    const { v } = verifier();
    expect(await v.verify(token({}, { header: { alg: 'none' } }))).toBe(false);
    expect(await v.verify(token({}, { header: { kid: 'nope' } }))).toBe(false);
  });

  it('refuses garbage and missing tokens', async () => {
    const { v } = verifier();
    for (const bad of [undefined, null, 42, '', 'a.b', 'a.b.c.d', `${token()}x`]) {
      expect(await v.verify(bad)).toBe(false);
    }
  });

  it('allows any app in the project when no app ids are listed', async () => {
    expect(await verifier({ appIds: [] }).v.verify(token({ sub: '1:123456789:android:x' }))).toBe(true);
  });

  it('refuses everything until the project number is configured', async () => {
    const { v, load } = verifier({ projectNumber: '' });
    expect(await v.verify(token())).toBe(false);
    expect(load).not.toHaveBeenCalled();
  });

  it('fails closed when Firebase keys cannot be fetched', async () => {
    const { v } = verifier({}, vi.fn(async () => Promise.reject(new Error('down'))));
    expect(await v.verify(token())).toBe(false);
  });
});

describe('Firebase key cache', () => {
  it('fetches the keys once and reuses them', async () => {
    const { v, load } = verifier();
    await v.verify(token());
    await v.verify(token());
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('refetches after 6 hours', async () => {
    const { v, load, advance } = verifier();
    await v.verify(token());
    advance(6 * 60 * 60 * 1000 + 1);
    await v.verify(token({ exp: (NOW + 7 * 60 * 60 * 1000) / 1000 }));
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('refetches for an unknown key id at most every 5 minutes', async () => {
    const { v, load, advance } = verifier();
    await v.verify(token());
    await v.verify(token({}, { header: { kid: 'rotated' } }));
    await v.verify(token({}, { header: { kid: 'rotated' } }));
    expect(load).toHaveBeenCalledTimes(1);

    advance(5 * 60 * 1000 + 1);
    await v.verify(token({}, { header: { kid: 'rotated' } }));
    expect(load).toHaveBeenCalledTimes(2);
  });
});
