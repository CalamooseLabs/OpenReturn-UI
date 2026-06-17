import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@^1";
import { ADMIN, appRequest, sessionCookie, VIEWER } from "./app.ts";
import { jsonResponse } from "./helpers.ts";

// --- /admin (users) ------------------------------------------------------

Deno.test("GET /admin is gated for non-admins", async () => {
  let usersHit = false;
  const res = await appRequest("/admin", {
    cookie: sessionCookie(VIEWER),
    backend: {
      "/admin/users": () => {
        usersHit = true;
        return jsonResponse({ users: [] });
      },
    },
  });
  assertEquals(res.status, 200);
  assertStringIncludes(res.body, "Administrator access required");
  assert(!usersHit, "privileged /admin/users endpoint must not be called");
});

Deno.test("GET /admin renders the user admin UI for admins", async () => {
  const res = await appRequest("/admin", {
    cookie: sessionCookie(ADMIN),
    backend: {
      "/admin/users": () =>
        jsonResponse({
          users: [{
            user_id: 1,
            username: "admin",
            is_active: true,
            roles: ["admin"],
          }],
        }),
      "/admin/roles": () =>
        jsonResponse({
          roles: [{
            code: "viewer",
            name: "Viewer",
            description: "",
            permissions: ["org:read"],
          }],
        }),
    },
  });
  assertEquals(res.status, 200);
  assertStringIncludes(res.body, "Users");
  assertStringIncludes(res.body, "admin");
  assertStringIncludes(res.body, "Create user");
});

Deno.test("POST /admin create user redirects with a message", async () => {
  let created = false;
  const res = await appRequest("/admin", {
    form: { action: "create", username: "bob", role: "viewer" },
    cookie: sessionCookie(ADMIN),
    backend: {
      "POST /admin/users": () => {
        created = true;
        return jsonResponse({ user_id: 3, username: "bob" });
      },
    },
  });
  assert(res.status === 302 || res.status === 303);
  assert(res.location?.startsWith("/admin?msg="), `got ${res.location}`);
  assert(created, "backend create-user was called");
});

// --- /admin/roles (roles & permissions) ----------------------------------

Deno.test("GET /admin/roles renders the roles UI for admins", async () => {
  const res = await appRequest("/admin/roles", {
    cookie: sessionCookie(ADMIN),
    backend: {
      "/admin/roles": () =>
        jsonResponse({
          roles: [{
            code: "viewer",
            name: "Viewer",
            description: "",
            permissions: ["org:read"],
          }],
        }),
      "/admin/permissions": () =>
        jsonResponse({
          permissions: [{ code: "org:read", description: "Read orgs" }],
        }),
    },
  });
  assertEquals(res.status, 200);
  assertStringIncludes(res.body, "Roles");
  assertStringIncludes(res.body, "org:read");
  // create-role form + grant form are both present
  assertStringIncludes(res.body, "Create role");
  assertStringIncludes(res.body, "Grant");
});

Deno.test("POST /admin/roles grant redirects with a message", async () => {
  let granted = false;
  const res = await appRequest("/admin/roles", {
    form: { action: "grant", role: "viewer", permission: "org:read" },
    cookie: sessionCookie(ADMIN),
    backend: {
      "POST /admin/roles/grant": () => {
        granted = true;
        return jsonResponse({});
      },
    },
  });
  assert(res.status === 302 || res.status === 303);
  assert(res.location?.startsWith("/admin/roles?msg="), `got ${res.location}`);
  assert(granted, "backend grant was called");
});
