import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@^1";
import { ADMIN, appRequest, sessionCookie } from "./app.ts";
import { jsonResponse } from "./helpers.ts";

// A manual model with one factor, an org with one filing, no existing score.
const GRADE_BACKEND = {
  "/admin/models": () =>
    jsonResponse({
      models: [
        { version: 50, scoring_mode: "manual", description: "Whole-person" },
        { version: 10, scoring_mode: "computed", description: "Financial" },
      ],
    }),
  "/scores/factors": () =>
    jsonResponse({
      model_version: 50,
      scoring_mode: "manual",
      model_kind: "model",
      factors: [
        {
          factor_id: 1,
          name: "Mission clarity",
          weight: 1.0,
          manual_scale: "benchmark",
        },
      ],
    }),
  "/organizations/full": () =>
    jsonResponse({
      ein: "000000001",
      name: "Acme Ministry",
      filings: [{ filing_id: "f1", year: 2023, form_code: "990" }],
    }),
  "/scores": () => jsonResponse({ ein: "000000001", scores: [] }),
};

Deno.test("GET /grade (no version) lists manual models to pick", async () => {
  const res = await appRequest("/grade", {
    cookie: sessionCookie(ADMIN),
    backend: GRADE_BACKEND,
  });
  assertEquals(res.status, 200);
  assertStringIncludes(res.body, "Choose a manual model");
  assertStringIncludes(res.body, "v50");
  // The computed model is NOT offered for grading.
  assert(!res.body.includes("v10"), "computed models must not be gradable");
});

Deno.test("GET /grade?version=10 rejects a computed model", async () => {
  const res = await appRequest("/grade?version=10", {
    cookie: sessionCookie(ADMIN),
    backend: {
      ...GRADE_BACKEND,
      "/scores/factors": () =>
        jsonResponse({
          model_version: 10,
          scoring_mode: "computed",
          factors: [],
        }),
    },
  });
  assertEquals(res.status, 200);
  assertStringIncludes(res.body, "computed model");
});

Deno.test("GET /grade?version=50&ein=… renders the grading form", async () => {
  const res = await appRequest("/grade?version=50&ein=000000001", {
    cookie: sessionCookie(ADMIN),
    backend: GRADE_BACKEND,
  });
  assertEquals(res.status, 200);
  assertStringIncludes(res.body, "Acme Ministry");
  assertStringIncludes(res.body, "Mission clarity");
  assertStringIncludes(res.body, "Save grades");
  // Per-factor value + comment inputs and the year are present.
  assertStringIncludes(res.body, 'name="value_1"');
  assertStringIncludes(res.body, 'name="comment_1"');
  assertStringIncludes(res.body, "2023");
});

Deno.test("POST /grade saves a factor grade", async () => {
  let created = false;
  let graded = false;
  const res = await appRequest("/grade", {
    cookie: sessionCookie(ADMIN),
    form: {
      ein: "000000001",
      version: "50",
      year: "2023",
      value_1: "0.8",
      comment_1: "Strong",
    },
    backend: {
      "/organizations/full": () =>
        jsonResponse({
          ein: "000000001",
          name: "Acme Ministry",
          filings: [{ filing_id: "f1", year: 2023, form_code: "990" }],
        }),
      "/scores": () => jsonResponse({ ein: "000000001", scores: [] }),
      "POST /scores": () => {
        created = true;
        return jsonResponse({
          score_id: 7,
          filing_id: "f1",
          model_version: "50",
        });
      },
      "POST /scores/grade": () => {
        graded = true;
        return jsonResponse({
          score_id: 7,
          model_version: "50",
          year: 2023,
          total_score: 0.8,
          factors: [],
        });
      },
    },
  });
  assert(res.status === 302 || res.status === 303);
  assert(created, "a score row was created");
  assert(graded, "the factor was graded");
  assert(
    res.location?.includes("msg="),
    `expected a success redirect, got ${res.location}`,
  );
});
