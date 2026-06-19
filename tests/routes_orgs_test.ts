import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@^1";
import { ADMIN, appRequest, sessionCookie, VIEWER } from "./app.ts";
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
          in_portfolio: false,
          website: "https://acme.org",
          mission: "Feeding the hungry across the region.",
          filings: [{
            filing_id: "f1",
            year: 2023,
            form_code: "990",
            links: {
              detail: "/filings/detail?filing_id=f1",
              data: "/filings/data?filing_id=f1",
              lookup: "/filings/lookup?ein=000000001&year=2023",
            },
          }],
        }),
      "/organizations/personnel": () =>
        jsonResponse({
          ein: "000000001",
          year: 2023,
          personnel: [{
            name: "Jane Doe",
            title: "President",
            is_officer: true,
          }],
        }),
      "/tags": () => jsonResponse({ ein: "000000001", tags: ["watchlist"] }),
      "/notes": () =>
        jsonResponse({
          ein: "000000001",
          notes: [{
            note_id: 1,
            body: "Promising programs.",
            author_label: "alice",
            created_at: "2026-06-19 10:00:00",
          }],
        }),
      "/giving": () =>
        jsonResponse({
          ein: "000000001",
          gifts: [],
          summary: { gift_count: 0, total_amount: 0 },
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
  // Description from the API + website link.
  assertStringIncludes(res.body, "Feeding the hungry");
  assertStringIncludes(res.body, "acme.org");
  // Tags chip, personnel, notes, and filing links.
  assertStringIncludes(res.body, "watchlist");
  assertStringIncludes(res.body, "Jane Doe");
  assertStringIncludes(res.body, "Updates");
  assertStringIncludes(res.body, "Promising programs.");
  assertStringIncludes(res.body, "Filings &amp; data");
  assertStringIncludes(res.body, "View detail"); // opens a modal (client island)
  // A nonprofit gets "Add to portfolio" (not Follow); an editor sees Edit.
  assertStringIncludes(res.body, "Add to portfolio");
  assertStringIncludes(res.body, "/orgs/000000001/edit");
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
  // The grants panel renders a tab per available direction + Our giving. Only
  // the active tab's content is server-rendered (it's a client island); the
  // default tab for an org with outbound grants is "Grants made".
  assertStringIncludes(res.body, "Grants &amp; giving");
  assertStringIncludes(res.body, "Grants made");
  assertStringIncludes(res.body, "Grants received");
  assertStringIncludes(res.body, "Our giving");
  // Active (made) tab: the Recipients figure + the largest recipient name, and
  // the year-grouped headers.
  assertStringIncludes(res.body, "Recipients");
  assertStringIncludes(res.body, "Helping Hands Inc");
  // A foundation gets a Follow action (not Add to portfolio).
  assertStringIncludes(res.body, "Follow");
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

Deno.test("GET /orgs/:ein breaks down the score by pillar factors", async () => {
  const res = await appRequest("/orgs/000000001", {
    cookie: sessionCookie(ADMIN),
    backend: {
      "/organizations/full": () =>
        jsonResponse({
          ein: "000000001",
          name: "Acme Nonprofit",
          org_type: "nonprofit",
          filings: [{ filing_id: "f1", year: 2023, form_code: "990" }],
        }),
      // A composite financial model (not a super_composite) is the pillar source.
      "/scores": () =>
        jsonResponse({
          ein: "000000001",
          scores: [{
            score_id: 7,
            model_version: 20,
            year: 2023,
            total_score: 0.7,
            imputed: false,
            model_type: "financial",
            model_kind: "composite",
          }],
        }),
      "/scores/history": () => jsonResponse({ history: [] }),
      "/scores/ranking": () => jsonResponse({ dimensions: {} }),
      "/financials": () => jsonResponse({ facts: [] }),
      "/organizations/grants": () =>
        jsonResponse({
          summary: { grant_count: 0, total_amount: 0, counterparties: 0 },
        }),
      // The per-pillar factor detail the breakdown renders.
      "/scores/detail": () =>
        jsonResponse({
          score_id: 7,
          model_version: "20",
          year: 2023,
          total_score: 0.7,
          factors: [
            {
              factor_id: 1,
              name: "Operating Efficiency",
              weight: 0.5,
              raw_value: 1.2,
              weighted_value: 0.35, // 0.35/0.5 = 0.70 → grade 70
              comment: null,
              manual_scale: null,
            },
          ],
        }),
    },
  });
  assertEquals(res.status, 200);
  assertStringIncludes(res.body, "Why this score");
  assertStringIncludes(res.body, "Financial Health");
  assertStringIncludes(res.body, "Operating Efficiency");
  assertStringIncludes(res.body, "weight 0.5");
});

Deno.test("GET /orgs/:ein?panel= opens the model-data modal", async () => {
  const res = await appRequest("/orgs/000000001?panel=20&panelYear=2023", {
    cookie: sessionCookie(ADMIN),
    backend: {
      "/organizations/full": () =>
        jsonResponse({
          ein: "000000001",
          name: "Acme Nonprofit",
          org_type: "nonprofit",
          filings: [{ filing_id: "f1", year: 2023, form_code: "990" }],
        }),
      "/scores": () =>
        jsonResponse({
          ein: "000000001",
          scores: [{
            score_id: 7,
            model_version: 20,
            year: 2023,
            total_score: 0.7,
            imputed: false,
            model_type: "financial",
            model_kind: "composite",
          }],
        }),
      "/scores/history": () => jsonResponse({ history: [] }),
      "/scores/ranking": () => jsonResponse({ dimensions: {} }),
      "/scores/detail": () =>
        jsonResponse({
          score_id: 7,
          model_version: "20",
          year: 2023,
          total_score: 0.7,
          factors: [],
        }),
      "/scores/factors": () =>
        jsonResponse({
          model_version: "20",
          scoring_mode: "computed",
          factors: [],
        }),
      "/financials": () =>
        jsonResponse({
          ein: "000000001",
          facts: [{
            fiscal_year: 2023,
            concept_code: "cy_rev",
            canonical_value: 1000000,
          }],
        }),
      "/financials/concepts": () =>
        jsonResponse({
          concepts: [{
            code: "cy_rev",
            label: "Current-year total revenue",
            category: "revenue",
          }],
        }),
      "/model-data": () =>
        jsonResponse({
          ein: "000000001",
          model_version: "20",
          fiscal_year: 2023,
          notes: [{
            note_id: 1,
            body: "board policy changed",
            author_label: "alice",
            created_at: "x",
          }],
          fields: [],
        }),
      "/organizations/grants": () =>
        jsonResponse({
          summary: { grant_count: 0, total_amount: 0, counterparties: 0 },
        }),
    },
  });
  assertEquals(res.status, 200);
  assertStringIncludes(res.body, "Financial figures");
  assertStringIncludes(res.body, "Custom data");
  assertStringIncludes(res.body, "board policy changed"); // the model-year note
  assertStringIncludes(res.body, "Current-year total revenue"); // financial figure label
});

Deno.test("POST /orgs/:ein mdnote_add reopens the panel", async () => {
  let posted = "";
  const res = await appRequest("/orgs/000000001", {
    form: { action: "mdnote_add", version: "20", year: "2023", body: "a note" },
    cookie: sessionCookie(ADMIN),
    backend: {
      "POST /model-data/note": async (req) => {
        posted = await req.text();
        return jsonResponse({ note_id: 1, body: "a note" });
      },
    },
  });
  assert(res.status === 302 || res.status === 303);
  assertStringIncludes(res.location ?? "", "panel=20");
  assertStringIncludes(res.location ?? "", "panelYear=2023");
  assertStringIncludes(posted, "a note");
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

Deno.test("POST /orgs/:ein portfolio_add toggles the shared portfolio", async () => {
  let called = false;
  const res = await appRequest("/orgs/000000001", {
    form: { action: "portfolio_add" },
    cookie: sessionCookie(ADMIN),
    backend: {
      "POST /organizations/portfolio": () => {
        called = true;
        return jsonResponse({ ein: "000000001", in_portfolio: true });
      },
    },
  });
  assert(res.status === 302 || res.status === 303);
  assertEquals(res.location, "/orgs/000000001");
  assert(called, "backend portfolio toggle was called");
});

Deno.test("POST /orgs/:ein note_add posts a note", async () => {
  let body = "";
  const res = await appRequest("/orgs/000000001", {
    form: { action: "note_add", body: "First contact made." },
    cookie: sessionCookie(ADMIN),
    backend: {
      "POST /notes": async (req) => {
        body = await req.text();
        return jsonResponse({ note_id: 1, body: "First contact made." });
      },
    },
  });
  assert(res.status === 302 || res.status === 303);
  assertEquals(res.location, "/orgs/000000001");
  assertStringIncludes(body, "First contact made.");
});

Deno.test("POST /orgs/:ein gift_add records giving", async () => {
  let payload = "";
  const res = await appRequest("/orgs/000000001", {
    form: {
      action: "gift_add",
      amount: "2500",
      fiscal_year: "2023",
      purpose: "ops",
    },
    cookie: sessionCookie(ADMIN),
    backend: {
      "POST /giving": async (req) => {
        payload = await req.text();
        return jsonResponse({ gift_id: 1, amount: 2500 });
      },
    },
  });
  assert(res.status === 302 || res.status === 303);
  assertEquals(res.location, "/orgs/000000001");
  assertStringIncludes(payload, "2500");
});

Deno.test("GET /orgs/:ein/edit renders the edit form", async () => {
  const res = await appRequest("/orgs/000000001/edit", {
    cookie: sessionCookie(ADMIN),
    backend: {
      "/organizations/full": () =>
        jsonResponse({
          ein: "000000001",
          name: "Acme Nonprofit",
          website: "https://acme.org",
          address: { city: "Springfield", state: "IL" },
          filings: [],
        }),
      "/organizations/sectors": () =>
        jsonResponse({ sectors: [{ code: "E", name: "Health Care" }] }),
    },
  });
  assertEquals(res.status, 200);
  assertStringIncludes(res.body, "Edit organization");
  assertStringIncludes(res.body, "Acme Nonprofit");
  assertStringIncludes(res.body, "Health Care");
});

Deno.test("POST /orgs/:ein/edit saves and redirects to the profile", async () => {
  let saved = false;
  const res = await appRequest("/orgs/000000001/edit", {
    form: { action: "save", name: "Acme Renamed", website: "https://acme.org" },
    cookie: sessionCookie(ADMIN),
    backend: {
      "POST /organizations/edit": () => {
        saved = true;
        return jsonResponse({ ein: "000000001", name: "Acme Renamed" });
      },
    },
  });
  assert(res.status === 302 || res.status === 303);
  assertStringIncludes(res.location ?? "", "/orgs/000000001?msg=");
  assert(saved, "backend edit was called");
});

Deno.test("GET /orgs/:ein/edit gates on org:write", async () => {
  const res = await appRequest("/orgs/000000001/edit", {
    cookie: sessionCookie(VIEWER),
    backend: {
      "/organizations/full": () =>
        jsonResponse({ ein: "000000001", name: "Acme Nonprofit", filings: [] }),
      "/organizations/sectors": () => jsonResponse({ sectors: [] }),
    },
  });
  assertEquals(res.status, 200);
  assertStringIncludes(res.body, "org:write");
});
