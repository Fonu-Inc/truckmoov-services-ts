import { describe, expect, it } from 'vitest';
import { isMailPort, isPubliclyRoutableHost } from '@shared/http';

describe('isPubliclyRoutableHost', () => {
  it('accepts a real mail host', () => {
    expect(isPubliclyRoutableHost('imap.gmail.com')).toBe(true);
    expect(isPubliclyRoutableHost('mail.omnirelay.tech')).toBe(true);
  });

  it('refuses loopback by name and by address', () => {
    expect(isPubliclyRoutableHost('localhost')).toBe(false);
    expect(isPubliclyRoutableHost('127.0.0.1')).toBe(false);
    expect(isPubliclyRoutableHost('127.1.2.3')).toBe(false);
    expect(isPubliclyRoutableHost('::1')).toBe(false);
    expect(isPubliclyRoutableHost('[::1]')).toBe(false);
  });

  it('refuses the cloud metadata endpoint, however it is written', () => {
    expect(isPubliclyRoutableHost('169.254.169.254')).toBe(false);
    expect(isPubliclyRoutableHost('metadata.google.internal')).toBe(false);
    expect(isPubliclyRoutableHost('metadata')).toBe(false);
  });

  it('refuses private ranges', () => {
    expect(isPubliclyRoutableHost('10.0.0.5')).toBe(false);
    expect(isPubliclyRoutableHost('172.16.0.1')).toBe(false);
    expect(isPubliclyRoutableHost('172.31.255.255')).toBe(false);
    expect(isPubliclyRoutableHost('192.168.1.1')).toBe(false);
  });

  it('accepts the addresses just outside the private ranges', () => {
    expect(isPubliclyRoutableHost('172.15.0.1')).toBe(true);
    expect(isPubliclyRoutableHost('172.32.0.1')).toBe(true);
    expect(isPubliclyRoutableHost('11.0.0.1')).toBe(true);
  });

  it('refuses an in-cluster service name, which has no dot', () => {
    expect(isPubliclyRoutableHost('auth-service')).toBe(false);
    expect(isPubliclyRoutableHost('postgres')).toBe(false);
    expect(isPubliclyRoutableHost('nats')).toBe(false);
  });

  it('refuses an IPv4 private address smuggled through an IPv6 literal', () => {
    expect(isPubliclyRoutableHost('::ffff:127.0.0.1')).toBe(false);
    expect(isPubliclyRoutableHost('::ffff:169.254.169.254')).toBe(false);
    expect(isPubliclyRoutableHost('::ffff:10.0.0.1')).toBe(false);
  });

  it('refuses IPv6 loopback, link-local and unique-local', () => {
    expect(isPubliclyRoutableHost('fe80::1')).toBe(false);
    expect(isPubliclyRoutableHost('fd00::1')).toBe(false);
    expect(isPubliclyRoutableHost('fc00::1')).toBe(false);
  });

  it('refuses carrier-grade NAT and reserved space', () => {
    expect(isPubliclyRoutableHost('100.64.0.1')).toBe(false);
    expect(isPubliclyRoutableHost('0.0.0.0')).toBe(false);
    expect(isPubliclyRoutableHost('224.0.0.1')).toBe(false);
  });

  it('refuses anything carrying a path, space or credentials', () => {
    expect(isPubliclyRoutableHost('imap.gmail.com/../admin')).toBe(false);
    expect(isPubliclyRoutableHost('user@imap.gmail.com')).toBe(false);
    expect(isPubliclyRoutableHost('imap.gmail.com ')).toBe(true); // trimmed, still fine
    expect(isPubliclyRoutableHost('imap gmail com')).toBe(false);
  });

  it('refuses an empty host', () => {
    expect(isPubliclyRoutableHost('')).toBe(false);
    expect(isPubliclyRoutableHost('   ')).toBe(false);
  });
});

describe('isMailPort', () => {
  it('accepts the ports mail servers listen on', () => {
    for (const port of [25, 143, 465, 587, 993, 2525]) {
      expect(isMailPort(port)).toBe(true);
    }
  });

  it('refuses ports that point somewhere else', () => {
    expect(isMailPort(22)).toBe(false);
    expect(isMailPort(5432)).toBe(false);
    expect(isMailPort(6379)).toBe(false);
    expect(isMailPort(8001)).toBe(false);
    expect(isMailPort(80)).toBe(false);
  });

  it('refuses nonsense', () => {
    expect(isMailPort(0)).toBe(false);
    expect(isMailPort(-1)).toBe(false);
    expect(isMailPort(993.5)).toBe(false);
    expect(isMailPort(Number.NaN)).toBe(false);
  });
});
