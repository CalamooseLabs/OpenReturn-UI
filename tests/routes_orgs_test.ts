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

Deno.test("GET /orgs/:ein surfaces grant flows when present", async () => {
  const res = await appRequest("/orgs/000000001", {
    cookie: sessionCookie(ADMIN),
    backend: {
      "/organizations/full": () =>
        jsonResponse({
          ein: "000000001",
          name: "Acme Foundation",
          org_type: "foundation",
          following: false,
          filings: [{ filing_id: "f1", year: 2023, form_code: "990PF" }],
        }),
      "/scores": () => jsonResponse({ ein: "000000001", scores: [] }),
      "/scores/history": () => jsonResponse({ history: [] }),
      "/scores/ranking": () => jsonResponse({ dimensions: {} }),
      "/financials": () => jsonResponse({ facts: [] }),
      // Both directions hit this path, so both grant cards render; rows carry
      // both recipient (made card) and grantor (received card) names.
      "/organizations/grants": () =>
        jsonResponse({
          summary: {
            grant_count: 12,
            total_amount: 4500000,
            counterparties: 8,
          },
          grants: [
            {
              year: 2023,
              amount: 2000000,
              recipient: "Helping Hands Inc",
              grantor: "Big Funder Trust",
              purpose: "General support",
            },
            {
              year: 2022,
              amount: 1500000,
              recipient: "Community Aid",
              grantor: "Another Foundation",
            },
          ],
        }),
    },
  });
  assertEquals(res.status, 200);
  assertStringIncludes(res.body, "Grants made");
  assertStringIncludes(res.body, "Grants received");
  assertStringIncludes(res.body, "Recipients");
  assertStringIncludes(res.body, "Funders");
  // The detail list renders the largest grants by name (made + received).
  assertStringIncludes(res.body, "Helping Hands Inc");
  assertStringIncludes(res.body, "Big Funder Trust");
  // 12 in the summary, 2 shown → "+10 more".
  assertStringIncludes(res.body, "10 more");
});

Deno.test("GET /orgs/:ein renders the score-trend chart with ≥2 years", async () => {
  const res = await appRequest("/orgs/000000001", {
    cookie: sessionCookie(ADMIN),
    backend: {
      "/organizations/full": () =>
        jsonResponse({
          ein: "000000001",
          name: "Acme Nonprofit",
          org_type: "nonprofit",
          following: false,
          filings: [
            { filing_id: "f1", year: 2021, form_code: "990" },
            { filing_id: "f2", year: 2022, form_code: "990" },
            { filing_id: "f3", year: 2023, form_code: "990" },
          ],
        }),
      "/scores": () =>
        jsonResponse({
          ein: "000000001",
          scores: [{
            score_id: 7,
            model_version: 30,
            year: 2023,
            total_score: 0.71,
            imputed: false,
          }],
        }),
      "/scores/history": () =>
        jsonResponse({
          ein: "000000001",
          model_version: 30,
          history: [
            { year: 2021, total_score: 0.62, imputed: false, score_id: 5 },
            // An imputed (estimated) interior year, donor 2021.
            {
              year: 2022,
              total_score: 0.66,
              imputed: true,
              score_id: 6,
              source_year: 2021,
            },
            { year: 2023, total_score: 0.71, imputed: false, score_id: 7 },
          ],
        }),
      "/scores/ranking": () => jsonResponse({ dimensions: {} }),
      "/financials": () => jsonResponse({ ein: "000000001", facts: [] }),
      "/organizations/grants": () =>
        jsonResponse({
          summary: { grant_count: 0, total_amount: 0, counterparties: 0 },
        }),
    },
  });
  assertEquals(res.status, 200);
  // The chart (its accessible label) + the year-range caption render.
  assertStringIncludes(res.body, "Score trend over filing years");
  assertStringIncludes(res.body, "Score trend · 2021 → 2023");
  // The imputed year flips on the "estimated" note.
  assertStringIncludes(res.body, "estimated");
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
