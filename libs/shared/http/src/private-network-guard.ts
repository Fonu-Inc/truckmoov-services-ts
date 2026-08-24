import { isIP } from "node:net";

/**
 * Whether this server may open a connection to a host a tenant supplied.
 *
 * A tenant-supplied mail server is a destination THIS server connects to on
 * their behalf, which makes it the same SSRF vector as a webhook URL: an
 * internal admin port, a cloud metadata endpoint, or a service on loopback.
 *
 * A hostname that resolves to a private address still passes here — DNS is not
 * resolved at this layer. The connecting code must re-check the resolved
 * address, because DNS can change between the check and the connection.
 */
const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "metadata.google.internal",
  "metadata",
  "instance-data",
]);

export function isPubliclyRoutableHost(rawHost: string): boolean {
  const host = rawHost.trim().toLowerCase().replace(/^\[|\]$/g, "");
  if (!host) return false;
  if (BLOCKED_HOSTNAMES.has(host)) return false;

  // A bare hostname must still look like one. Rejecting the odd shapes here
  // keeps them out of a connection string later.
  if (host.includes("/") || host.includes(" ") || host.includes("@")) return false;

  const ipVersion = isIP(host);
  if (ipVersion) return isPubliclyRoutableIp(host, ipVersion);

  // A single label with no dot is a local name on most resolvers, which is how
  // an internal service gets reached without looking like an IP address.
  if (!host.includes(".")) return false;

  return true;
}

export function isPubliclyRoutableIp(address: string, ipVersion: number = isIP(address)): boolean {
  if (ipVersion === 4) return isPublicIpv4(address);
  if (ipVersion === 6) return isPublicIpv6(address);
  return false;
}

function isPublicIpv4(address: string): boolean {
  const octets = address.split(".").map(Number);
  if (octets.length !== 4 || octets.some((octet) => Number.isNaN(octet))) return false;
  const [first, second] = octets;

  if (first === 127) return false; // loopback
  if (first === 10) return false; // private
  if (first === 172 && second >= 16 && second <= 31) return false; // private
  if (first === 192 && second === 168) return false; // private
  if (first === 169 && second === 254) return false; // link-local, incl. cloud metadata
  if (first === 100 && second >= 64 && second <= 127) return false; // carrier-grade NAT
  if (first === 0) return false; // "this network"
  if (first >= 224) return false; // multicast and reserved

  return true;
}

function isPublicIpv6(address: string): boolean {
  const normalized = address.toLowerCase();
  if (normalized === "::1" || normalized === "::") return false; // loopback, unspecified
  if (normalized.startsWith("fe80:")) return false; // link-local
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return false; // unique local
  // IPv4 reachable through an IPv6 literal, which would otherwise bypass the
  // IPv4 rules entirely.
  const mapped = normalized.match(/(?:^|:)((?:\d{1,3}\.){3}\d{1,3})$/);
  if (mapped?.[1]) return isPublicIpv4(mapped[1]);

  return true;
}

/** Ports a mail server actually listens on. Anything else is pointed elsewhere. */
const ALLOWED_MAIL_PORTS = new Set([25, 143, 465, 587, 993, 2525]);

export function isMailPort(port: number): boolean {
  return Number.isInteger(port) && ALLOWED_MAIL_PORTS.has(port);
}
