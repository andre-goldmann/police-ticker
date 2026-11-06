import { promises as dnsPromises } from 'node:dns';

/**
 * DNS lookup function used to resolve feed hostnames. Takes an options object
 * with `all: true` so every resolved address is checked. Replaceable in tests
 * so no live network call is made.
 */
export type HostLookup = (
  hostname: string,
  options: { all: true },
) => Promise<Array<{ address: string; family: number }>>;

const defaultLookup: HostLookup = (hostname, options) => dnsPromises.lookup(hostname, options);

export type UrlCheck = { ok: true; url: URL } | { ok: false; error: string };

/** Resolved addresses from `ensurePublicHost`, safe to pin for the outbound fetch. */
export type ResolvedAddress = { address: string; family: number };

export type HostCheck =
  | { ok: true; addresses: ResolvedAddress[] }
  | { ok: false; error: string };

/** IPv4 ranges (as [min, max] integers) that must not be requested. */
const RESTRICTED_IPV4_RANGES: Array<[number, number]> = [
  [0x00000000, 0x00ffffff], // 0.0.0.0/8 "this network" (reaches loopback on Linux)
  [0x7f000000, 0x7fffffff], // 127.0.0.0/8 loopback
  [0x0a000000, 0x0affffff], // 10.0.0.0/8 private
  [0xac100000, 0xac1fffff], // 172.16.0.0/12 private
  [0xc0a80000, 0xc0a8ffff], // 192.168.0.0/16 private
  [0xa9fe0000, 0xa9feffff], // 169.254.0.0/16 link-local
];

const IPV6_UNSPECIFIED = 0n;
const IPV6_LOOPBACK = 1n;
const IPV6_UNIQUE_LOCAL_MIN = 0xfc000000000000000000000000000000n; // fc00::/7
const IPV6_UNIQUE_LOCAL_MAX = 0xfdffffffffffffffffffffffffffffffn;
const IPV6_LINK_LOCAL_MIN = 0xfe800000000000000000000000000000n; // fe80::/10
const IPV6_LINK_LOCAL_MAX = 0xfebfffffffffffffffffffffffffffffn;

/**
 * Checks that the pasted feed URL parses and uses the http or https scheme.
 * Used by the /api/custom-rss handler before any feed is fetched.
 */
export function validateCustomRssUrl(rawUrl: string): UrlCheck {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { ok: false, error: 'Invalid URL format' };
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, error: 'Only http and https URLs are allowed' };
  }

  return { ok: true, url };
}

/**
 * Resolves the hostname of an http(s) URL and rejects targets that resolve to
 * private, loopback, or link-local addresses, so the server is not tricked into
 * requesting internal hosts. Used by the /api/custom-rss handler before the
 * feed is fetched.
 */
export async function ensurePublicHost(
  url: URL,
  lookup: HostLookup = defaultLookup,
): Promise<HostCheck> {
  // IPv6 literals are wrapped in brackets in URL.hostnames.
  const hostname = url.hostname.replace(/^\[(.+)\]$/, '$1');

  let addresses: Array<{ address: string; family: number }>;
  try {
    addresses = await lookup(hostname, { all: true });
  } catch {
    addresses = [];
  }

  if (addresses.length === 0) {
    return { ok: false, error: `Could not resolve host: ${hostname}` };
  }

  if (addresses.some((entry) => isRestrictedAddress(entry.address, entry.family))) {
    return {
      ok: false,
      error: 'Requests to private, loopback, or link-local addresses are not allowed',
    };
  }

  return { ok: true, addresses };
}

function isRestrictedAddress(address: string, family: number): boolean {
  if (family === 4) {
    return isRestrictedIpv4(address);
  }
  if (family === 6) {
    return isRestrictedIpv6(address);
  }
  return false;
}

function isRestrictedIpv4(address: string): boolean {
  const value = parseIpv4(address);
  if (value === null) {
    return false;
  }
  return RESTRICTED_IPV4_RANGES.some(([min, max]) => value >= min && value <= max);
}

/**
 * Strips an IPv6 zone identifier (`fe80::a%eth0` → `fe80::a`) so scoped
 * link-local addresses are classified the same as unscoped ones.
 */
function stripIpv6ZoneId(address: string): string {
  const zone = address.indexOf('%');
  return zone === -1 ? address : address.slice(0, zone);
}

function isRestrictedIpv6(address: string): boolean {
  const withoutZone = stripIpv6ZoneId(address);
  const value = parseIpv6(withoutZone);
  if (value === null) {
    return false;
  }
  if (
    value === IPV6_UNSPECIFIED ||
    value === IPV6_LOOPBACK ||
    (value >= IPV6_UNIQUE_LOCAL_MIN && value <= IPV6_UNIQUE_LOCAL_MAX) ||
    (value >= IPV6_LINK_LOCAL_MIN && value <= IPV6_LINK_LOCAL_MAX)
  ) {
    return true;
  }
  // IPv4-mapped (::ffff:a.b.c.d) and IPv4-compatible (::a.b.c.d) forms embed an
  // IPv4 address in their low 32 bits; it must pass the IPv4 restrictions too.
  const embeddedIpv4 = embeddedIpv4Of(value);
  return embeddedIpv4 !== null && isRestrictedIpv4(embeddedIpv4);
}

/**
 * Returns the dotted quad embedded in an IPv4-mapped or IPv4-compatible IPv6
 * address, or null when the address does not embed an IPv4 address.
 */
function embeddedIpv4Of(value: bigint): string | null {
  const high = value >> 32n;
  if (high !== 0n && high !== 0xffffn) {
    return null;
  }
  const ipv4 = value & 0xffffffffn;
  const octet = (shift: bigint) => ((ipv4 >> shift) & 0xffn).toString();
  return `${octet(24n)}.${octet(16n)}.${octet(8n)}.${octet(0n)}`;
}

function parseIpv6(address: string): bigint | null {
  const sections = address.split('::');
  if (sections.length > 2) {
    return null;
  }
  const head = sections[0] ? sections[0].split(':') : [];
  const tail = sections.length === 2 && sections[1] ? sections[1].split(':') : [];

  // Expand an embedded IPv4 suffix (e.g. ::ffff:192.168.0.1) into hex groups.
  const lastGroups = tail.length > 0 ? tail : head;
  const lastGroup = lastGroups[lastGroups.length - 1];
  if (lastGroup && lastGroup.includes('.')) {
    const value = parseIpv4(lastGroup);
    if (value === null) {
      return null;
    }
    const hexGroups = [((value >> 16) & 0xffff).toString(16), (value & 0xffff).toString(16)];
    if (tail.length > 0) {
      tail.splice(-1, 1, ...hexGroups);
    } else {
      head.splice(-1, 1, ...hexGroups);
    }
  }

  if (head.length + tail.length > 8) {
    return null;
  }
  const groups = [...head, ...Array<string>(8 - head.length - tail.length).fill('0'), ...tail];
  if (sections.length === 1 && groups.length !== 8) {
    return null;
  }

  let value = 0n;
  for (const group of groups) {
    if (!/^[0-9a-fA-F]{1,4}$/.test(group)) {
      return null;
    }
    value = (value << 16n) | BigInt(parseInt(group, 16));
  }
  return value;
}

function parseIpv4(address: string): number | null {
  const parts = address.split('.');
  if (parts.length !== 4) {
    return null;
  }
  let value = 0;
  for (const part of parts) {
    if (!/^\d+$/.test(part)) {
      return null;
    }
    const octet = Number(part);
    if (octet > 255) {
      return null;
    }
    value = value * 256 + octet;
  }
  return value;
}
