import { assert, assertEquals } from "jsr:@std/assert@^1";
import { createApi } from "../src/lib/api/mod.ts";
import { captureFetch } from "./helpers.ts";

Deno.test("orgs resource maps methods to endpoints", async () => {
  const { calls, restore } = captureFetch();
  const api = createApi("tok");
  try {
    await api.orgs.full("123");
    await api.orgs.search({ q: "acme", state: "IL", limit: 10 });
    await api.orgs.grants("123", "made");
    await api.orgs.sectors();
  } finally {
    restore();
  }
  assertEquals(calls[0].pathname, "/organizations/full");
  assertEquals(calls[0].query.get("ein"), "123");
  assertEquals(calls[0].headers.get("authorization"), "Bearer tok");
  assertEquals(calls[1].pathname, "/organizations/search");
  assertEquals(calls[1].query.get("q"), "acme");
  assertEquals(calls[1].query.get("state"), "IL");
  assertEquals(calls[2].pathname, "/organizations/grants");
  assertEquals(calls[2].query.get("direction"), "made");
  assertEquals(calls[3].pathname, "/organizations/sectors");
});

Deno.test("scores resource", async () => {
  const { calls, restore } = captureFetch();
  const api = createApi(null);
  try {
    await api.scores.history("1", "30");
    await api.scores.leaderboard({
      model: "30",
      state: "TX",
      limit: 25,
      offset: 0,
    });
    await api.scores.ranking("1", "30", 2023);
  } finally {
    restore();
  }
  assertEquals(calls[0].pathname, "/scores/history");
  assertEquals(calls[0].query.get("version"), "30");
  assertEquals(calls[1].pathname, "/scores/leaderboard");
  assertEquals(calls[1].query.get("model"), "30");
  assertEquals(calls[1].query.get("state"), "TX");
  assertEquals(calls[2].query.get("year"), "2023");
  // anonymous client sends no auth header
  assert(!calls[0].headers.has("authorization"));
});

Deno.test("POST resources send JSON bodies", async () => {
  const { calls, restore } = captureFetch();
  const api = createApi("tok");
  try {
    await api.people.create({ full_name: "Jane" });
    await api.tags.apply("000000001", "watchlist");
    await api.lists.addMember(1, "000000001");
    await api.financials.setCanonical({
      ein: "1",
      fiscal_year: 2023,
      concept: "prog",
      observation_id: 5,
    });
    await api.follows.follow("1");
    await api.admin.assignRole("bob", "editor");
  } finally {
    restore();
  }
  assertEquals(calls[0].method, "POST");
  assertEquals(calls[0].pathname, "/people");
  assertEquals(JSON.parse(calls[0].bodyText).full_name, "Jane");
  assertEquals(calls[1].pathname, "/tags");
  assertEquals(JSON.parse(calls[1].bodyText), {
    ein: "000000001",
    tag: "watchlist",
  });
  assertEquals(calls[2].pathname, "/lists/members/add");
  assertEquals(JSON.parse(calls[2].bodyText), { list_id: 1, ein: "000000001" });
  assertEquals(calls[3].pathname, "/financials/canonical");
  assertEquals(JSON.parse(calls[3].bodyText).observation_id, 5);
  assertEquals(calls[4].pathname, "/follows/follow");
  assertEquals(calls[5].pathname, "/admin/users/assign-role");
  assertEquals(JSON.parse(calls[5].bodyText), {
    username: "bob",
    role: "editor",
  });
});

Deno.test("financials conflictOrgs hits the inbox endpoint with paging", async () => {
  const { calls, restore } = captureFetch();
  const api = createApi("tok");
  try {
    await api.financials.conflictOrgs({ limit: 25, offset: 50 });
  } finally {
    restore();
  }
  assertEquals(calls[0].method, "GET");
  assertEquals(calls[0].pathname, "/financials/conflict-orgs");
  assertEquals(calls[0].query.get("limit"), "25");
  assertEquals(calls[0].query.get("offset"), "50");
});

Deno.test("upload grab sends a schedule when given (and omits it for 'now')", async () => {
  const { calls, restore } = captureFetch();
  const api = createApi("tok");
  try {
    await api.upload.grab("https://x/01A.zip", false, "01:00");
    await api.upload.grab("https://x/01A.zip", true, "now");
    await api.upload.grab("https://x/01A.zip");
  } finally {
    restore();
  }
  assertEquals(calls[0].pathname, "/upload/grab");
  assertEquals(JSON.parse(calls[0].bodyText).schedule, "01:00");
  // "now" and an omitted schedule both send no schedule field.
  assertEquals(JSON.parse(calls[1].bodyText).schedule, undefined);
  assertEquals(JSON.parse(calls[1].bodyText).force, true);
  assertEquals(JSON.parse(calls[2].bodyText).schedule, undefined);
});

Deno.test("upload resource forwards multipart without a JSON content-type", async () => {
  const { calls, restore } = captureFetch();
  const api = createApi("tok");
  const form = new FormData();
  form.append(
    "zipfile",
    new Blob(["PK"], { type: "application/zip" }),
    "a.zip",
  );
  try {
    await api.upload.zip(form);
    const form2 = new FormData();
    form2.append(
      "pdffile",
      new Blob(["%PDF"], { type: "application/pdf" }),
      "a.pdf",
    );
    await api.upload.pdf("000000001", 2023, form2);
  } finally {
    restore();
  }
  assertEquals(calls[0].method, "POST");
  assertEquals(calls[0].pathname, "/upload");
  assert(
    (calls[0].headers.get("content-type") ?? "").includes(
      "multipart/form-data",
    ),
    "zip upload is multipart",
  );
  assertEquals(calls[1].pathname, "/upload/pdf");
  assertEquals(calls[1].query.get("ein"), "000000001");
  assertEquals(calls[1].query.get("year"), "2023");
});
