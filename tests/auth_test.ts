import { assertEquals } from "jsr:@std/assert@^1";
import { can, displayName, isAdmin, isLoggedIn } from "../src/lib/auth.ts";
import type { Principal } from "../src/lib/types.ts";

const viewer: Principal = {
  kind: "user",
  label: "v",
  permissions: ["org:read", "score:read"],
  user: { user_id: 2, username: "v", is_active: true, roles: ["viewer"] },
};
const admin: Principal = {
  kind: "user",
  label: "a",
  permissions: [],
  user: { user_id: 1, username: "a", is_active: true, roles: ["admin"] },
};

Deno.test("can() honors explicit permissions", () => {
  assertEquals(can(viewer, "org:read"), true);
  assertEquals(can(viewer, "user:admin"), false);
  assertEquals(can(null, "org:read"), false);
});

Deno.test("can() treats the admin role as all-permissions (dev/no-auth)", () => {
  assertEquals(can(admin, "user:admin"), true);
  assertEquals(can(admin, "upload:write"), true);
});

Deno.test("isAdmin / isLoggedIn", () => {
  assertEquals(isAdmin(admin), true);
  assertEquals(isAdmin(viewer), false);
  assertEquals(isLoggedIn(viewer), true);
  assertEquals(isLoggedIn(null), false);
});

Deno.test("displayName falls back through username/label", () => {
  assertEquals(displayName(viewer), "v");
  assertEquals(
    displayName({ kind: "program", label: "svc", permissions: [] }),
    "svc",
  );
  assertEquals(displayName(null), "account");
});
