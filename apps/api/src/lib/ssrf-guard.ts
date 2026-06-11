import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const PRIVATE_HOST_RE =
  /^(localhost|127\.|0\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)|\.(local|internal)$/i;

export function isPrivateIp(ip: string): boolean {
  if (PRIVATE_HOST_RE.test(ip)) return true;
  // IPv6 loopback, link-local, unique-local, and v4-mapped forms.
  const lower = ip.toLowerCase();
  return (
    lower === "::1" ||
    lower === "::" ||
    lower.startsWith("fe80:") ||
    lower.startsWith("fc") ||
    lower.startsWith("fd") ||
    lower.startsWith("::ffff:127.") ||
    lower.startsWith("::ffff:10.") ||
    lower.startsWith("::ffff:192.168.")
  );
}

export function isPrivateHostname(hostname: string): boolean {
  return PRIVATE_HOST_RE.test(hostname);
}

/** Resolve the hostname and reject if any address is private (DNS rebinding guard). */
export async function resolvesToPrivate(hostname: string): Promise<boolean> {
  if (isIP(hostname)) return isPrivateIp(hostname);
  try {
    const records = await lookup(hostname, { all: true });
    return records.some((r) => isPrivateIp(r.address));
  } catch {
    return true; // unresolvable → refuse
  }
}

/**
 * Validates that a user-supplied URL is http(s) and does not point into the
 * internal network. Returns the parsed URL or null when unsafe.
 */
export async function parsePublicHttpUrl(url: string): Promise<URL | null> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return null;
  }
  const hostname = parsed.hostname.replace(/^\[|\]$/g, "");
  if (isPrivateHostname(hostname) || (await resolvesToPrivate(hostname))) {
    return null;
  }
  return parsed;
}
