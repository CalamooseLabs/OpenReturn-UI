import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@^1";
import { ADMIN, appRequest, sessionCookie, VIEWER } from "./app.ts";
import { jsonResponse } from "./helpers.ts";

// routes/compare.tsx has two modes driven entirely by query params:
//   Mode 1 (?ein=…[&year=…]) — one org across every model, via /scores/compare
//                              (and /organizations/full only when no year given,
//                               to default to the org's latest filing year).
//   Mode 2 (?eins=…&model=…) — orgs head-to-head on one model, via /scores/history
//                              + /organizations/detail; the model picker is filled
//                              from listModelOptions (/admin/models for admins,
//                              else the /templates catalog).
// A score of 0.7 renders as "70.0%" (scorePct).

Deno.test("GET /compare with no params prompts and shows both form cards", async () => {
  const res = await appRequest("/compare", {
    cookie: sessionCookie(ADMIN),
    backend: {
      // listModelOptions (admin) — best-effort; provide a model so the picker fills.
      "/admin/models": () =>
        jsonResponse({
          models: [{ version: 30, description: "Overall Score" }],
        }),
    },
  });
  assertEquals(res.status, 200);
  // Empty-state prompt (neither mode active).
  assertStringIncludes(res.body, "Pick a comparison above");
  // Both input cards render.
  assertStringIncludes(res.body, "One org across models");
  assertStringIncludes(res.body, "Organizations head-to-head");
});

Deno.test("GET /compare?ein=&year= renders one org across models (mode 1)", async () => {
  let comparedYear: string | null = null;
  const res = await appRequest("/compare?ein=000000001&year=2023", {
    cookie: sessionCookie(ADMIN),
    backend: {
      "/admin/models": () =>
        jsonResponse({
          models: [{ version: 30, description: "Overall Score" }],
        }),
      "/scores/compare": (req) => {
        comparedYear = new URL(req.url).searchParams.get("year");
        return jsonResponse({
          ein: "000000001",
          year: 2023,
          scores: [
            {
              score_id: 1,
              model_version: 30,
              year: 2023,
              total_score: 0.7,
              imputed: false,
            },
          ],
        });
      },
    },
  });
  assertEquals(res.status, 200);
  // Year was supplied, so /scores/compare is hit with it (no /organizations/full lookup).
  assertEquals(comparedYear, "2023");
  // The model row + its score render.
  assertStringIncludes(res.body, "Model v30");
  assertStringIncludes(res.body, "70.0%");
});

Deno.test("GET /compare?eins=&model= renders orgs head-to-head (mode 2)", async () => {
  let historyHit = false;
  const res = await appRequest("/compare?eins=000000001&model=30", {
    // VIEWER → listModelOptions falls back to the /templates catalog.
    cookie: sessionCookie(VIEWER),
    backend: {
      "/templates": () =>
        jsonResponse({
          templates: [
            {
              code: "overall",
              name: "Overall Score",
              kind: "super_composite",
              type: "financial",
              version: 30,
            },
          ],
        }),
      "/scores/history": () => {
        historyHit = true;
        return jsonResponse({
          ein: "000000001",
          model_version: 30,
          history: [
            { year: 2023, total_score: 0.7, imputed: false, score_id: 1 },
          ],
        });
      },
      "/organizations/detail": () =>
        jsonResponse({ ein: "000000001", name: "Acme" }),
    },
  });
  assertEquals(res.status, 200);
  assert(historyHit, "/scores/history was called for the head-to-head row");
  // Head-to-head section header + the org name + its latest score.
  assertStringIncludes(res.body, "Head-to-head");
  assertStringIncludes(res.body, "Acme");
  assertStringIncludes(res.body, "70.0%");
});
