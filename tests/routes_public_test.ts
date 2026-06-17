import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@^1";
import { ADMIN, appRequest, sessionCookie } from "./app.ts";
import { jsonResponse } from "./helpers.ts";

Deno.test("GET / shows the landing page when signed out", async () => {
  const res = await appRequest("/");
  assertEquals(res.status, 200);
  assertStringIncludes(res.body, "Explore nonprofit financial health");
});

Deno.test("GET / shows the dashboard when signed in", async () => {
  const res = await appRequest("/", {
    cookie: sessionCookie(ADMIN),
    backend: {
      "/organizations": () => jsonResponse({ total: 42 }),
      "/templates": () => jsonResponse({ templates: [{ version: 30 }] }),
      "/follows": () => jsonResponse({ organizations: [] }),
    },
  });
  assertEquals(res.status, 200);
  assertStringIncludes(res.body, "Dashboard");
  assertStringIncludes(res.body, "Your watchlist");
});

Deno.test("GET /login renders the form", async () => {
  const res = await appRequest("/login");
  assertEquals(res.status, 200);
  assertStringIncludes(res.body, "Sign in to OpenReturn");
});

Deno.test("POST /login sets cookies and redirects", async () => {
  const res = await appRequest("/login", {
    form: { username: "admin", password: "pw", next: "/" },
    backend: {
      "POST /auth/login": () =>
        jsonResponse({
          session_key: "sk",
          expires_at: "2026-07-17 00:00:00",
          user: {
            user_id: 1,
            username: "admin",
            is_active: true,
            roles: ["admin"],
          },
        }),
      "/auth/me": () => jsonResponse(ADMIN),
    },
  });
  assertEquals(res.status, 303);
  assertEquals(res.location, "/");
  assert(res.setCookies.some((c) => c.startsWith("or_session=sk")));
  assert(res.setCookies.some((c) => c.startsWith("or_principal=")));
});

Deno.test("POST /login shows an error on bad credentials", async () => {
  const res = await appRequest("/login", {
    form: { username: "admin", password: "bad", next: "/" },
    backend: {
      "POST /auth/login": () => jsonResponse({ error: "unauthorized" }, 401),
    },
  });
  assertEquals(res.status, 200);
  assertStringIncludes(res.body, "Invalid username or password");
});

Deno.test("POST /logout clears cookies and redirects to /login", async () => {
  const res = await appRequest("/logout", {
    method: "POST",
    cookie: sessionCookie(ADMIN),
    backend: { "POST /auth/logout": () => jsonResponse({}) },
  });
  assertEquals(res.status, 303);
  assertEquals(res.location, "/login");
  assert(res.setCookies.every((c) => c.includes("Max-Age=0")));
});

Deno.test("an upstream 401 redirects to /login", async () => {
  const res = await appRequest("/search?q=x", {
    cookie: sessionCookie(ADMIN),
    backend: {
      "/organizations/search": () =>
        jsonResponse({ error: "unauthorized" }, 401),
    },
  });
  assertEquals(res.status, 303);
  assert(res.location?.startsWith("/login"));
});

Deno.test("unknown route renders 404", async () => {
  const res = await appRequest("/does-not-exist");
  assertEquals(res.status, 404);
  assertStringIncludes(res.body, "Page not found");
});
