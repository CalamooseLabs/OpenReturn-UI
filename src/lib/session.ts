// Session handling: the API session key and a cached principal live in two
// httpOnly cookies set at login. Reading them per request avoids an /auth/me
// round-trip on every page (and works against a dev backend without --auth,
// where /auth/me returns "not authenticated").

import type { Principal } from "./types.ts";

const SESSION_COOKIE = "or_session";
const PRINCIPAL_COOKIE = "or_principal";

// Secure flag is opt-in (must be off for plain-http localhost dev).
const SECURE = (Deno.env.get("COOKIE_SECURE") ?? "").toLowerCase() === "true";

function parseCookies(req: Request): Record<string, string> {
  const header = req.headers.get("cookie");
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (key) out[key] = decodeURIComponent(value);
  }
  return out;
}

export function getSessionToken(req: Request): string | null {
  return parseCookies(req)[SESSION_COOKIE] ?? null;
}

export function getCachedPrincipal(req: Request): Principal | null {
  const raw = parseCookies(req)[PRINCIPAL_COOKIE];
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Principal;
  } catch {
    return null;
  }
}

function cookieAttrs(extra: string[]): string {
  const attrs = ["Path=/", "HttpOnly", "SameSite=Lax", ...extra];
  if (SECURE) attrs.push("Secure");
  return attrs.join("; ");
}

/** Append Set-Cookie headers establishing a session on the given Headers. */
export function setSessionCookies(
  headers: Headers,
  token: string,
  principal: Principal,
  expiresAt?: string,
): void {
  const expires: string[] = [];
  if (expiresAt) {
    const d = new Date(expiresAt.replace(" ", "T") + "Z");
    if (!isNaN(d.getTime())) expires.push(`Expires=${d.toUTCString()}`);
  }
  headers.append(
    "Set-Cookie",
    `${SESSION_COOKIE}=${encodeURIComponent(token)}; ${cookieAttrs(expires)}`,
  );
  headers.append(
    "Set-Cookie",
    `${PRINCIPAL_COOKIE}=${encodeURIComponent(JSON.stringify(principal))}; ${
      cookieAttrs(expires)
    }`,
  );
}

/** Append Set-Cookie headers clearing the session. */
export function clearSessionCookies(headers: Headers): void {
  for (const name of [SESSION_COOKIE, PRINCIPAL_COOKIE]) {
    headers.append("Set-Cookie", `${name}=; ${cookieAttrs(["Max-Age=0"])}`);
  }
}
