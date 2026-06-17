import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@^1";
import { ADMIN, appRequest, sessionCookie } from "./app.ts";
import { jsonResponse } from "./helpers.ts";

Deno.test("GET /people lists people with the add-person form for an admin", async () => {
  const res = await appRequest("/people", {
    cookie: sessionCookie(ADMIN),
    backend: {
      "/people": () =>
        jsonResponse({
          total: 1,
          limit: 50,
          offset: 0,
          people: [{
            person_id: 1,
            full_name: "Jane Doe",
            title: "Director",
            email: "j@x.org",
          }],
        }),
    },
  });
  assertEquals(res.status, 200);
  assertStringIncludes(res.body, "People");
  assertStringIncludes(res.body, "Jane Doe");
  assertStringIncludes(res.body, "/people/1");
  assertStringIncludes(res.body, "Add person");
});

Deno.test("POST /people create redirects with a confirmation message", async () => {
  let created = false;
  const res = await appRequest("/people", {
    form: { action: "create", full_name: "Bob" },
    cookie: sessionCookie(ADMIN),
    backend: {
      "POST /people": () => {
        created = true;
        return jsonResponse({ person_id: 2, full_name: "Bob" });
      },
    },
  });
  assert(res.status === 302 || res.status === 303);
  assert(res.location?.startsWith("/people?msg="), `got ${res.location}`);
  assert(created, "backend create was called");
});

Deno.test("GET /people/1 renders detail with edit + membership forms", async () => {
  const res = await appRequest("/people/1", {
    cookie: sessionCookie(ADMIN),
    backend: {
      "/people/detail": () =>
        jsonResponse({
          person_id: 1,
          full_name: "Jane Doe",
          title: "Director",
          memberships: [{
            membership_id: 1,
            person_id: 1,
            org_ein: "000000001",
            org_name: "Acme",
            role_title: "Board Chair",
            is_primary: true,
          }],
        }),
    },
  });
  assertEquals(res.status, 200);
  assertStringIncludes(res.body, "Jane Doe");
  assertStringIncludes(res.body, "Acme");
  assertStringIncludes(res.body, "Board Chair");
  assertStringIncludes(res.body, "Edit person");
  assertStringIncludes(res.body, "Add membership");
});

Deno.test("POST /people/1 add-membership redirects back with a message", async () => {
  let added = false;
  const res = await appRequest("/people/1", {
    form: { action: "add-membership", ein: "000000001", role_title: "Chair" },
    cookie: sessionCookie(ADMIN),
    backend: {
      "POST /people/membership": () => {
        added = true;
        return jsonResponse({});
      },
    },
  });
  assert(res.status === 302 || res.status === 303);
  assert(res.location?.startsWith("/people/1?msg="), `got ${res.location}`);
  assert(added, "backend add-membership was called");
});

Deno.test("GET /people/999 shows not-found on a 404", async () => {
  const res = await appRequest("/people/999", {
    cookie: sessionCookie(ADMIN),
    backend: {
      "/people/detail": () => jsonResponse({ error: "not found" }, 404),
    },
  });
  assertEquals(res.status, 200);
  assertStringIncludes(res.body, "Person not found");
});
