import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@^1";
import { ADMIN, appRequest, sessionCookie } from "./app.ts";
import { jsonResponse } from "./helpers.ts";

// Subset-filter vocab the /reports page always loads (best-effort).
const VOCAB = {
  "/organizations/sectors": () =>
    jsonResponse({ sectors: [{ code: "E", name: "Health Care" }] }),
  "/organizations/states": () =>
    jsonResponse({ states: [{ code: "IL", name: "Illinois" }] }),
};

// listModelOptions(admin) hits /admin/models first; give it one model so the
// page defaults to v30 and renders the leaderboard.
const ADMIN_MODELS = {
  "/admin/models": () =>
    jsonResponse({
      models: [{
        version: 30,
        description: "Overall Score",
        model_kind: "super_composite",
        model_type: "financial",
      }],
    }),
};

function leaderboard(rows: {
  rank: number;
  ein: string;
  name: string;
  total_score: number;
  year: number;
}[]) {
  return () =>
    jsonResponse({
      model_version: 30,
      year: 2023,
      total: rows.length,
      limit: 25,
      offset: 0,
      leaderboard: rows,
    });
}

Deno.test("GET /reports renders the leaderboard with export links", async () => {
  const res = await appRequest("/reports", {
    cookie: sessionCookie(ADMIN),
    backend: {
      ...VOCAB,
      ...ADMIN_MODELS,
      "/scores/leaderboard": leaderboard([
        {
          rank: 1,
          ein: "000000001",
          name: "Acme Nonprofit",
          total_score: 0.912,
          year: 2023,
        },
        {
          rank: 2,
          ein: "000000002",
          name: "Beacon Foundation",
          total_score: 0.804,
          year: 2023,
        },
      ]),
    },
  });
  assertEquals(res.status, 200);
  assertStringIncludes(res.body, "Leaderboards");
  // A ranked org name from the leaderboard.
  assertStringIncludes(res.body, "Acme Nonprofit");
  // The two export affordances.
  assertStringIncludes(res.body, "Export PDF");
  assertStringIncludes(res.body, "Export CSV");
  // The export links point at /reports/export with a format param.
  assertStringIncludes(res.body, "/reports/export?");
  assertStringIncludes(res.body, "format=pdf");
  assertStringIncludes(res.body, "format=csv");
});

Deno.test("GET /reports renders the Non-Profits / Foundations toggle", async () => {
  const res = await appRequest("/reports", {
    cookie: sessionCookie(ADMIN),
    backend: {
      ...VOCAB,
      ...ADMIN_MODELS,
      "/scores/leaderboard": leaderboard([]),
    },
  });
  assertEquals(res.status, 200);
  assertStringIncludes(res.body, "Non-Profits");
  assertStringIncludes(res.body, "Foundations");
  assertStringIncludes(res.body, 'href="/reports?type=nonprofit"');
  assertStringIncludes(res.body, 'href="/reports?type=foundation"');
});

Deno.test("GET /reports?type=foundation scopes the leaderboard + picks the foundation model", async () => {
  let lbUrl = "";
  const res = await appRequest("/reports?type=foundation", {
    cookie: sessionCookie(ADMIN),
    backend: {
      ...VOCAB,
      "/admin/models": () =>
        jsonResponse({
          models: [
            {
              version: 30,
              description: "Overall Score",
              model_kind: "super_composite",
            },
            {
              version: 40,
              description: "Foundation stewardship",
              model_kind: "super_composite",
              applies_to: "foundation",
            },
          ],
        }),
      "/scores/leaderboard": (req) => {
        lbUrl = req.url;
        return jsonResponse({
          model_version: 40,
          year: 2023,
          total: 0,
          limit: 25,
          offset: 0,
          leaderboard: [],
        });
      },
    },
  });
  assertEquals(res.status, 200);
  const q = new URL(lbUrl).searchParams;
  assertEquals(q.get("type"), "foundation");
  assertEquals(q.get("model"), "40");
});

Deno.test("GET /reports shows the empty state when no models are registered", async () => {
  const res = await appRequest("/reports", {
    cookie: sessionCookie(ADMIN),
    backend: {
      ...VOCAB,
      // Admin model list 404s -> falls through to the template catalog,
      // which has no templates -> no model options at all.
      "/admin/models": () => jsonResponse({ error: "not found" }, 404),
      "/templates": () => jsonResponse({ templates: [] }),
    },
  });
  assertEquals(res.status, 200);
  assertStringIncludes(res.body, "No scoring models available");
});

Deno.test("GET /reports/export?format=csv returns a CSV download", async () => {
  const res = await appRequest("/reports/export?model=30&format=csv", {
    cookie: sessionCookie(ADMIN),
    backend: {
      ...ADMIN_MODELS,
      "/scores/leaderboard": leaderboard([
        {
          rank: 1,
          ein: "000000001",
          name: "Acme Nonprofit",
          total_score: 0.912,
          year: 2023,
        },
        {
          rank: 2,
          ein: "000000002",
          name: "Beacon Foundation",
          total_score: 0.804,
          year: 2023,
        },
      ]),
    },
  });
  assertEquals(res.status, 200);
  assertStringIncludes(
    res.headers.get("content-type") ?? "",
    "text/csv",
  );
  assertStringIncludes(
    res.headers.get("content-disposition") ?? "",
    ".csv",
  );
  // Header row + at least one data row.
  assertStringIncludes(res.body, "Rank,EIN,Organization");
  assertStringIncludes(res.body, "Acme Nonprofit");
});

Deno.test("GET /reports/export?format=pdf returns a PDF download", async () => {
  const res = await appRequest("/reports/export?model=30&format=pdf", {
    cookie: sessionCookie(ADMIN),
    backend: {
      ...ADMIN_MODELS,
      "/scores/leaderboard": leaderboard([
        {
          rank: 1,
          ein: "000000001",
          name: "Acme Nonprofit",
          total_score: 0.912,
          year: 2023,
        },
      ]),
    },
  });
  assertEquals(res.status, 200);
  assertStringIncludes(
    res.headers.get("content-type") ?? "",
    "application/pdf",
  );
  assertStringIncludes(
    res.headers.get("content-disposition") ?? "",
    ".pdf",
  );
  // A real PDF byte stream begins with the %PDF- magic.
  assert(
    res.body.startsWith("%PDF-"),
    "PDF body should start with the %PDF- magic header",
  );
});
