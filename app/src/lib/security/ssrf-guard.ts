/**
 * SSRF guard — shared utility for any module that fetches a customer-supplied
 * hostname from server-side code. Placed in lib/security/ (not owned by any
 * single module) so Module 5.11 (Public Free-Check) can reuse it.
 *
 * Uses the same error base class as the AI provider errors
 * (app/src/lib/ai-providers/errors.ts) — no separate error hierarchy.
 */
import { AiProviderError } from "@/lib/ai-providers/errors";
import { promises as dns } from "node:dns";

const PRIVATE_IPV6_PREFIXES = ["::1", "fc00:", "fd00:"];

export class SsrfBlockedError extends AiProviderError {
  constructor(hostname: string, reason: string) {
    super("provider_unavailable");
    this.name = "SsrfBlockedError";
    this.message = `SSRF blocked: ${hostname} (${reason})`;
  }
}

function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) return false;

  // 10.0.0.0/8
  if (parts[0] === 10) return true;
  // 172.16.0.0/12
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
  // 192.168.0.0/16
  if (parts[0] === 192 && parts[1] === 168) return true;
  // 127.0.0.0/8
  if (parts[0] === 127) return true;
  // 169.254.0.0/16
  if (parts[0] === 169 && parts[1] === 254) return true;
  // 0.0.0.0
  if (parts[0] === 0 && parts[1] === 0 && parts[2] === 0 && parts[3] === 0) return true;

  return false;
}

function isPrivateIPv6(ip: string): boolean {
  const normalized = ip.toLowerCase();
  return PRIVATE_IPV6_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

/**
 * Rejects hostnames that resolve to private/reserved IP ranges (SSRF guard).
 * Throws SsrfBlockedError if the hostname is localhost or resolves to a
 * private IP. Resolves without throwing for normal public hostnames.
 */
export async function assertPublicHostname(hostname: string): Promise<void> {
  // Block localhost and its aliases before any DNS lookup
  const lower = hostname.toLowerCase();
  if (
    lower === "localhost" ||
    lower === "127.0.0.1" ||
    lower === "::1" ||
    lower === "0.0.0.0" ||
    lower.startsWith("127.") ||
    lower.startsWith("0.")
  ) {
    throw new SsrfBlockedError(hostname, "localhost or loopback address");
  }

  // If the hostname is already an IP, check it directly
  if (isPrivateIPv4(hostname)) {
    throw new SsrfBlockedError(hostname, "private IPv4 address");
  }
  if (isPrivateIPv6(hostname)) {
    throw new SsrfBlockedError(hostname, "private IPv6 address");
  }

  // DNS lookup to catch hostnames that resolve to private IPs
  try {
    const addresses = await dns.resolve4(hostname);
    for (const addr of addresses) {
      if (isPrivateIPv4(addr)) {
        throw new SsrfBlockedError(hostname, `resolves to private IPv4: ${addr}`);
      }
    }
  } catch (err) {
    if (err instanceof SsrfBlockedError) throw err;
    // DNS resolution failure for IPv4 — try IPv6
    try {
      const addresses = await dns.resolve6(hostname);
      for (const addr of addresses) {
        if (isPrivateIPv6(addr)) {
          throw new SsrfBlockedError(hostname, `resolves to private IPv6: ${addr}`);
        }
      }
    } catch (err6) {
      if (err6 instanceof SsrfBlockedError) throw err6;
      // DNS resolution failed entirely — this is a real domain lookup failure,
      // not an SSRF concern. Let the caller handle the fetch error.
    }
  }
}