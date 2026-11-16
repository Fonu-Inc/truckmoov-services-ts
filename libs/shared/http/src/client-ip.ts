/**
 * The caller's address, when it can be established honestly.
 *
 * Every proxy header is client-controlled: anyone can send `X-Forwarded-For`.
 * It is therefore only read when the connection actually came from a proxy we
 * trust, and the gateway must overwrite rather than append the header so a
 * client-supplied copy cannot survive.
 *
 * Returns null rather than a guess. An audit row saying "unknown" is honest; a
 * row carrying an address the caller chose is worse than no row at all,
 * because it will be believed.
 */

import { BlockList, isIP } from "node:net";

export type ClientIpOptions = {
  /**
   * Socket addresses whose forwarding headers may be believed. An entry may be
   * a CIDR range, because gateway pods change address on every reschedule.
   */
  trustedProxies: string[];
  /** Header the gateway writes the real client address into. */
  header: string;
};

export type IncomingLike = {
  headers: Record<string, string | string[] | undefined>;
  socket?: { remoteAddress?: string | null } | null;
};

export function clientIpFrom(request: IncomingLike, options: ClientIpOptions): string | null {
  const peer = normalizeIp(request.socket?.remoteAddress ?? null);
  if (!peer) return null;

  // Direct connection: the socket is the client, and no header is consulted.
  if (!isTrusted(peer, options.trustedProxies)) return peer;

  const forwarded = firstHeaderValue(request.headers[options.header.toLowerCase()]);
  if (!forwarded) return peer;

  // A list means several proxies appended to it. The left-most is the original
  // client as the nearest trusted hop reported it.
  const candidate = normalizeIp(forwarded.split(",")[0]?.trim() ?? null);
  return candidate ?? peer;
}

function isTrusted(peer: string, trustedProxies: string[]): boolean {
  return trustedProxies.some((entry) => matchesProxy(peer, entry));
}

/** Whether an address equals, or falls inside, any entry: an exact IP or a CIDR range. */
export function ipMatchesAny(ip: string, entries: readonly string[]): boolean {
  const address = normalizeIp(ip);
  return address !== null && entries.some((entry) => matchesProxy(address, entry));
}

function matchesProxy(peer: string, entry: string): boolean {
  const proxy = normalizeIp(entry);
  if (!proxy) return false;
  return proxy.includes("/") ? inSubnet(peer, proxy) : proxy === peer;
}

function inSubnet(peer: string, cidr: string): boolean {
  const [network = "", prefix = ""] = cidr.split("/");
  const family = isIP(network);
  if (family === 0 || isIP(peer) !== family || !/^\d+$/.test(prefix)) return false;

  const type = family === 4 ? "ipv4" : "ipv6";
  const subnet = new BlockList();
  try {
    subnet.addSubnet(network, Number(prefix), type);
  } catch {
    return false;
  }
  return subnet.check(peer, type);
}

function firstHeaderValue(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

/**
 * Strips the IPv6 mapping Node reports for IPv4 sockets, so `::ffff:10.0.0.1`
 * and `10.0.0.1` compare equal against a configured proxy address.
 */
function normalizeIp(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (trimmed === "") return null;
  return trimmed.startsWith("::ffff:") ? trimmed.slice(7) : trimmed;
}
