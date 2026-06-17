import { assert, assertEquals } from "jsr:@std/assert@^1";
import {
  clearSessionCookies,
  getCachedPrincipal,
  getSessionToken,
  setSessionCookies,
} from "../lib/session.ts";
import type { Principal } from "../lib/types.ts";

function reqWithCookie(cookie: string): Request {
  return new Request("http://x/", { headers: { cookie } });
}

const principal: Principal = {
  kind: "user",
  label: "a",
  permissions: ["org:read"],
  user: { user_id: 1, username: "a", is_active: true, roles: ["admin"] },
};

Deno.test("getSessionToken reads or_session", () => {
  assertEquals(getSessionToken(reqWithCookie("or_session=abc123")), "abc123");
  assertEquals(getSessionToken(reqWithCookie("other=x; or_session=t")), "t");
  assertEquals(getSessionToken(new Request("http://x/")), null);
});

Deno.test("getCachedPrincipal round-trips JSON, tolerates junk", () => {
  const enc = encodeURIComponent(JSON.stringify(principal));
  const got = getCachedPrincipal(reqWithCookie(`or_principal=${enc}`));
  assertEquals(got?.user?.username, "a");
  assertEquals(
    getCachedPrincipal(reqWithCookie("or_principal=not-json")),
    null,
  );
  assertEquals(getCachedPrincipal(new Request("http://x/")), null);
});

Deno.test("setSessionCookies sets two httpOnly cookies", () => {
  const headers = new Headers();
  setSessionCookies(headers, "tok", principal, "2026-07-17 20:30:00");
  const cookies = headers.getSetCookie();
  assertEquals(cookies.length, 2);
  assert(cookies.some((c) => c.startsWith("or_session=tok")));
  assert(cookies.some((c) => c.startsWith("or_principal=")));
  for (const c of cookies) {
    assert(c.includes("HttpOnly"));
    assert(c.includes("SameSite=Lax"));
    assert(c.includes("Expires="));
  }
});

Deno.test("clearSessionCookies expires both cookies", () => {
  const headers = new Headers();
  clearSessionCookies(headers);
  const cookies = headers.getSetCookie();
  assertEquals(cookies.length, 2);
  for (const c of cookies) assert(c.includes("Max-Age=0"));
});

Deno.test("round-trip: set then read the principal back", () => {
  const headers = new Headers();
  setSessionCookies(headers, "tok", principal);
  // Reconstruct a Cookie header from the Set-Cookie name=value pairs.
  const cookie = headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  assertEquals(getSessionToken(reqWithCookie(cookie)), "tok");
  assertEquals(getCachedPrincipal(reqWithCookie(cookie))?.label, "a");
});
