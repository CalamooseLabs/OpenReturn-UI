// Permission helpers used for UI gating. The backend is the real enforcer;
// these only decide what to show. Against a dev backend without --auth the
// cached principal may carry no permissions, so we also honour the `admin` role.

import type { Principal } from "./types.ts";

export function can(principal: Principal | null, permission: string): boolean {
  if (!principal) return false;
  if (principal.permissions?.includes(permission)) return true;
  // An admin role implies everything (covers the no-permissions dev case).
  return principal.user?.roles?.includes("admin") ?? false;
}

export function isAdmin(principal: Principal | null): boolean {
  return can(principal, "user:admin");
}

export function isLoggedIn(principal: Principal | null): boolean {
  return principal !== null;
}

export function displayName(principal: Principal | null): string {
  return principal?.user?.username ?? principal?.label ?? "account";
}
