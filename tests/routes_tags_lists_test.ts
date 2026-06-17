import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@^1";
import { ADMIN, appRequest, sessionCookie } from "./app.ts";
import { jsonResponse } from "./helpers.ts";

// ---- /tags --------------------------------------------------------------

Deno.test("GET /tags lists the tag catalog", async () => {
  const res = await appRequest("/tags", {
    cookie: sessionCookie(ADMIN),
    backend: {
      "/tags": () =>
        jsonResponse({
          tags: [{ tag_id: 1, name: "watchlist", org_count: 1 }],
        }),
    },
  });
  assertEquals(res.status, 200);
  assertStringIncludes(res.body, "Tags");
  assertStringIncludes(res.body, "watchlist");
});

Deno.test("GET /tags?tag=watchlist lists the tagged organizations", async () => {
  const res = await appRequest("/tags?tag=watchlist", {
    cookie: sessionCookie(ADMIN),
    backend: {
      "/tags": () =>
        jsonResponse({
          tags: [{ tag_id: 1, name: "watchlist", org_count: 1 }],
        }),
      "/tags/organizations": () =>
        jsonResponse({ tag: "watchlist", eins: ["000000001"] }),
    },
  });
  assertEquals(res.status, 200);
  assertStringIncludes(res.body, 'href="/orgs/000000001"');
});

Deno.test("POST /tags apply tags an org and redirects with a message", async () => {
  let applied = false;
  const res = await appRequest("/tags", {
    cookie: sessionCookie(ADMIN),
    form: { action: "apply", ein: "000000001", tag: "x" },
    backend: {
      "POST /tags": () => {
        applied = true;
        return jsonResponse({ ein: "000000001", tags: ["x"] });
      },
    },
  });
  assert(res.status === 302 || res.status === 303);
  assert(res.location !== null, "expected a redirect Location");
  assertStringIncludes(res.location!, "/tags?");
  assertStringIncludes(res.location!, "msg=");
  assert(applied, "backend apply was called");
});

// ---- /lists -------------------------------------------------------------

Deno.test("GET /lists renders the list catalog and create form", async () => {
  const res = await appRequest("/lists", {
    cookie: sessionCookie(ADMIN),
    backend: {
      "/lists": () =>
        jsonResponse({
          lists: [{
            list_id: 1,
            name: "Top Charities",
            visibility: "public",
            kind: "static",
          }],
        }),
    },
  });
  assertEquals(res.status, 200);
  assertStringIncludes(res.body, "Lists");
  assertStringIncludes(res.body, "Top Charities");
  assertStringIncludes(res.body, 'href="/lists/1"');
  // The create form (admin has list:write).
  assertStringIncludes(res.body, "Create list");
});

Deno.test("POST /lists create makes a list and redirects with a message", async () => {
  let created = false;
  const res = await appRequest("/lists", {
    cookie: sessionCookie(ADMIN),
    form: {
      action: "create",
      name: "My List",
      visibility: "private",
      kind: "static",
    },
    backend: {
      "POST /lists": () => {
        created = true;
        return jsonResponse({ list_id: 2, name: "My List" });
      },
    },
  });
  assert(res.status === 302 || res.status === 303);
  assert(res.location !== null, "expected a redirect Location");
  assertStringIncludes(res.location!, "/lists?");
  assertStringIncludes(res.location!, "msg=");
  assert(created, "backend create was called");
});

// ---- /lists/[id] --------------------------------------------------------

Deno.test("GET /lists/1 renders the list detail with members + add form", async () => {
  const res = await appRequest("/lists/1", {
    cookie: sessionCookie(ADMIN),
    backend: {
      "/lists/detail": () =>
        jsonResponse({
          list_id: 1,
          name: "Top Charities",
          visibility: "public",
          kind: "static",
          organizations: [{ ein: "000000001", name: "Acme" }],
        }),
    },
  });
  assertEquals(res.status, 200);
  assertStringIncludes(res.body, "Top Charities");
  assertStringIncludes(res.body, "Acme");
  assertStringIncludes(res.body, 'href="/orgs/000000001"');
  // The add-member form (admin has list:write).
  assertStringIncludes(res.body, "Add organization");
});

Deno.test("POST /lists/1 add-member adds an org and redirects back", async () => {
  let added = false;
  const res = await appRequest("/lists/1", {
    cookie: sessionCookie(ADMIN),
    form: { action: "add-member", ein: "000000001" },
    backend: {
      "POST /lists/members/add": () => {
        added = true;
        return jsonResponse({});
      },
    },
  });
  assert(res.status === 302 || res.status === 303);
  assert(res.location !== null, "expected a redirect Location");
  assertStringIncludes(res.location!, "/lists/1?");
  assertStringIncludes(res.location!, "msg=");
  assert(added, "backend add-member was called");
});
