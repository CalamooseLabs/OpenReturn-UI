import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@^1";
import { ADMIN, appRequest, sessionCookie, VIEWER } from "./app.ts";
import { jsonResponse } from "./helpers.ts";

// Shared catalog + vocab stubs the /models GET handler always calls.
const CATALOG = {
  "/templates": () =>
    jsonResponse({
      templates: [
        {
          code: "10-op",
          name: "Program Expense Ratio",
          description: "Share of expenses spent on programs.",
          kind: "model",
          type: "financial",
          version: 10,
          factor_count: 1,
        },
        {
          code: "90-overall",
          name: "Overall Score",
          kind: "super_composite",
          type: "financial",
          version: 90,
          factor_count: 3,
        },
      ],
    }),
  "/scores/kinds": () =>
    jsonResponse({
      kinds: [
        { code: "model", name: "Model" },
        { code: "composite", name: "Composite" },
      ],
    }),
  "/scores/types": () =>
    jsonResponse({
      types: [
        { code: "financial", name: "Financial" },
        { code: "governance", name: "Governance" },
      ],
    }),
  // Registered models (ADMIN reads /admin/models authoritatively).
  "/admin/models": () =>
    jsonResponse({
      models: [
        {
          version: 10,
          description: "Program Expense Ratio",
          model_type: "financial",
          model_kind: "model",
        },
        {
          version: 20,
          description: "Financial composite",
          model_type: "financial",
          model_kind: "composite",
        },
      ],
    }),
};

Deno.test("GET /models (ADMIN) renders catalog, registered models, and the builder", async () => {
  const res = await appRequest("/models", {
    cookie: sessionCookie(ADMIN),
    backend: CATALOG,
  });
  assertEquals(res.status, 200);
  assertStringIncludes(res.body, "Model catalog");
  assertStringIncludes(res.body, "Registered models");
  // A template code/name is listed.
  assertStringIncludes(res.body, "Program Expense Ratio");
  assertStringIncludes(res.body, "10-op");
  // The admin builder section appears.
  assertStringIncludes(res.body, "Create a model");
});

Deno.test("GET /models?version=20 (ADMIN) renders the factor breakdown", async () => {
  const res = await appRequest("/models?version=20", {
    cookie: sessionCookie(ADMIN),
    backend: {
      ...CATALOG,
      "/scores/factors": () =>
        jsonResponse({
          model_version: 20,
          model_type: "financial",
          scoring_mode: "computed",
          model_kind: "composite",
          factors: [
            {
              factor_id: 1,
              name: "Financial pillar",
              weight: 1.0,
              formula_type: "weighted",
              inputs: '["model:10"]',
              direction: "higher",
              benchmark_lo: 0.0,
              benchmark_hi: 1.0,
              formula_description: "Blends the base financial models.",
              manual_scale: null,
            },
          ],
        }),
    },
  });
  assertEquals(res.status, 200);
  assertStringIncludes(res.body, "Financial pillar");
  assertStringIncludes(res.body, "Weight");
});

Deno.test("GET /models?template=10-op prefills the definition", async () => {
  const res = await appRequest("/models?template=10-op", {
    cookie: sessionCookie(ADMIN),
    backend: {
      ...CATALOG,
      "/templates/detail": () =>
        jsonResponse({
          code: "10-op",
          definition: {
            model: { version: 10 },
            factor: [{ name: "Program Expense Ratio", weight: 0.3 }],
          },
        }),
    },
  });
  assertEquals(res.status, 200);
  // The selected template's definition is prefilled into the builder textarea.
  assertStringIncludes(res.body, "Program Expense Ratio");
});

Deno.test("POST /models (ADMIN) with invalid JSON redirects to /models?err=", async () => {
  let created = false;
  const res = await appRequest("/models", {
    cookie: sessionCookie(ADMIN),
    form: { definition: "not json", dry_run: "1" },
    backend: {
      "POST /admin/models": () => {
        created = true;
        return jsonResponse({});
      },
    },
  });
  assert(res.status === 302 || res.status === 303);
  assert(
    res.location?.startsWith("/models?err="),
    `expected an /models?err= redirect, got ${res.location}`,
  );
  assert(!created, "invalid JSON must not reach the create endpoint");
});

Deno.test("GET /models (VIEWER) hides the builder and shows a read-only note", async () => {
  const res = await appRequest("/models", {
    cookie: sessionCookie(VIEWER),
    backend: CATALOG,
  });
  assertEquals(res.status, 200);
  // Still browses the catalog.
  assertStringIncludes(res.body, "Model catalog");
  // No admin builder.
  assert(
    !res.body.includes("Create a model"),
    "viewer must not see the model builder",
  );
  // Read-only note explaining admin is required.
  assertStringIncludes(res.body, "Administrator access is required");
});
