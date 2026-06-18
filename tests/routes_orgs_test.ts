import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@^1";
import { ADMIN, appRequest, sessionCookie } from "./app.ts";
import { jsonResponse } from "./helpers.ts";

const VOCAB = {
  "/organizations/states": () =>
    jsonResponse({ states: [{ code: "IL", name: "Illinois" }] }),
  "/organizations/sectors": () =>
    jsonResponse({ sectors: [{ code: "E", name: "Health Care" }] }),
};

Deno.test("GET /search prompts when empty", async () => {
  const res = await appRequest("/search", {
    cookie: sessionCookie(ADMIN),
    backend: VOCAB,
  });
  assertEquals(res.status, 200);
  assertStringIncludes(res.body, "Enter a search");
});

Deno.test("GET /search renders results", async () => {
  const res = await appRequest("/search?q=acme", {
    cookie: sessionCookie(ADMIN),
    backend: {
      ...VOCAB,
      "/organizations/search": () =>
        jsonResponse({
          total: 1,
          organizations: [{
            ein: "000000001",
            name: "Acme Nonprofit",
            org_type: "nonprofit",
            address: { city: "Springfield", state: "IL" },
          }],
        }),
    },
  });
  assertEquals(res.status, 200);
  assertStringIncludes(res.body, "Acme Nonprofit");
  assertStringIncludes(res.body, "/orgs/000000001");
});

Deno.test("GET /orgs/:ein renders the org dashboard", async () => {
  const res = await appRequest("/orgs/000000001", {
    cookie: sessionCookie(ADMIN),
    backend: {
      "/organizations/full": () =>
        jsonResponse({
          ein: "000000001",
          name: "Acme Nonprofit",
          org_type: "nonprofit",
          following: false,
          filings: [{ filing_id: "f1", year: 2023, form_code: "990" }],
        }),
      "/scores": () =>
        jsonResponse({
          ein: "000000001",
          scores: [{
            score_id: 7,
            model_version: 30,
            year: 2023,
            total_score: 0.689,
            imputed: false,
          }],
        }),
      "/scores/history": () =>
        jsonResponse({
          ein: "000000001",
          model_version: 30,
          history: [{
            year: 2023,
            total_score: 0.689,
            imputed: false,
            score_id: 7,
          }],
        }),
      "/scores/ranking": () =>
        jsonResponse({
          ein: "000000001",
          model_version: 30,
          dimensions: {
            global: {
              ein: "000000001",
              rank: 1,
              of: 1,
              percentile: 100,
              total_score: 0.689,
            },
          },
        }),
      "/financials": () => jsonResponse({ ein: "000000001", facts: [] }),
      "/organizations/grants": () =>
        jsonResponse({
          summary: { grant_count: 0, total_amount: 0, counterparties: 0 },
        }),
    },
  });
  assertEquals(res.status, 200);
  assertStringIncludes(res.body, "Acme Nonprofit");
  assertStringIncludes(res.body, "OVERALL");
  assertStringIncludes(res.body, "Financial picture");
});

Deno.test("POST /orgs/:ein follow redirects back", async () => {
  let followed = false;
  const res = await appRequest("/orgs/000000001", {
    form: { action: "follow" },
    cookie: sessionCookie(ADMIN),
    backend: {
      "POST /follows/follow": () => {
        followed = true;
        return jsonResponse({});
      },
    },
  });
  assert(res.status === 302 || res.status === 303);
  assertEquals(res.location, "/orgs/000000001");
  assert(followed, "backend follow was called");
});

Deno.test("GET /orgs/:ein shows not-found on a 404", async () => {
  const res = await appRequest("/orgs/999999999", {
    cookie: sessionCookie(ADMIN),
    backend: {
      "/organizations/full": () => jsonResponse({ error: "not found" }, 404),
    },
  });
  assertEquals(res.status, 200);
  assertStringIncludes(res.body, "Organization not found");
});
