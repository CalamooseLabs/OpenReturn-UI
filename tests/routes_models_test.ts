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
  // The admin builder section appears, now as the structured field-by-field
  // builder (with an Advanced JSON fallback) rather than a raw textarea.
  assertStringIncludes(res.body, "Create a model");
  assertStringIncludes(res.body, "Add factor");
  assertStringIncludes(res.body, "Advanced (JSON)");
  assertStringIncludes(res.body, "Preview definition JSON");
  // It still posts the same definition + dry-run/skip fields.
  assertStringIncludes(res.body, 'name="definition"');
  assertStringIncludes(res.body, "Validate only (dry run)");
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

Deno.test("GET /models?edit=20 (ADMIN) loads the model into the builder", async () => {
  const res = await appRequest("/models?edit=20", {
    cookie: sessionCookie(ADMIN),
    backend: {
      ...CATALOG,
      "/admin/models/definition": () =>
        jsonResponse({
          version: "20",
          definition: {
            model: {
              version: "20",
              type: "financial",
              kind: "composite",
              mode: "computed",
              description: "Financial composite",
            },
            factor: [{
              name: "Program efficiency",
              weight: 1.0,
              formula_type: "ratio",
              inputs: ["prog", "total_exp"],
              direction: "higher",
              benchmark_lo: 0,
              benchmark_hi: 1,
            }],
          },
        }),
    },
  });
  assertEquals(res.status, 200);
  // Edit-mode chrome + the loaded definition prefilled into the builder.
  assertStringIncludes(res.body, "Edit model v20");
  assertStringIncludes(res.body, "Save changes");
  assertStringIncludes(res.body, 'name="editing"');
  assertStringIncludes(res.body, "Program efficiency");
});

Deno.test("POST /models with editing=20 calls the update endpoint", async () => {
  let updated = false;
  const res = await appRequest("/models", {
    form: {
      definition: JSON.stringify({ model: { version: "20" }, factor: [] }),
      editing: "20",
    },
    cookie: sessionCookie(ADMIN),
    backend: {
      "POST /admin/models/update": () => {
        updated = true;
        return jsonResponse({
          updated: true,
          version: "20",
          recompute_needed: true,
        });
      },
    },
  });
  assert(res.status === 302 || res.status === 303);
  assert(updated, "the update endpoint was called");
});

Deno.test("GET /models (ADMIN) badges an archived model in the roster", async () => {
  const res = await appRequest("/models", {
    cookie: sessionCookie(ADMIN),
    backend: {
      ...CATALOG,
      "/admin/models": () =>
        jsonResponse({
          models: [
            { version: 10, description: "Active", model_kind: "model" },
            {
              version: 99,
              description: "Retired",
              model_kind: "model",
              archived: true,
            },
          ],
        }),
    },
  });
  assertEquals(res.status, 200);
  assertStringIncludes(res.body, "Archived");
});

Deno.test("GET /models/20 (ADMIN) shows Archive + Delete controls", async () => {
  const res = await appRequest("/models/20", {
    cookie: sessionCookie(ADMIN),
    backend: {
      "/templates": () => jsonResponse({ templates: [] }),
      "/admin/models": () =>
        jsonResponse({
          models: [{
            version: 20,
            description: "Financial composite",
            model_kind: "composite",
            archived: false,
          }],
        }),
      "/scores/factors": () =>
        jsonResponse({
          model_version: 20,
          model_type: "financial",
          scoring_mode: "computed",
          model_kind: "composite",
          factors: [],
        }),
    },
  });
  assertEquals(res.status, 200);
  // Both lifecycle forms render (archive since not archived, + delete), posting
  // to the /models POST handler.
  assertStringIncludes(res.body, 'value="archive"');
  assertStringIncludes(res.body, 'value="delete"');
  assertStringIncludes(res.body, 'action="/models"');
});

Deno.test("GET /models/20 (ADMIN) shows Un-archive + banner for an archived model", async () => {
  const res = await appRequest("/models/20", {
    cookie: sessionCookie(ADMIN),
    backend: {
      "/templates": () => jsonResponse({ templates: [] }),
      "/admin/models": () =>
        jsonResponse({
          models: [{
            version: 20,
            description: "Retired composite",
            model_kind: "composite",
            archived: true,
          }],
        }),
      "/scores/factors": () =>
        jsonResponse({
          model_version: 20,
          model_kind: "composite",
          scoring_mode: "computed",
          factors: [],
        }),
    },
  });
  assertEquals(res.status, 200);
  assertStringIncludes(res.body, 'value="unarchive"');
  assertStringIncludes(res.body, "excluded from scoring");
});

Deno.test("GET /models/20 (ADMIN) hides controls for a template-only model", async () => {
  // Not in the admin registry (manageable=false) → no archive/delete controls.
  const res = await appRequest("/models/20", {
    cookie: sessionCookie(ADMIN),
    backend: {
      "/templates": () => jsonResponse({ templates: [] }),
      "/admin/models": () => jsonResponse({ models: [] }),
      "/scores/factors": () =>
        jsonResponse({
          model_version: 20,
          scoring_mode: "computed",
          factors: [],
        }),
    },
  });
  assertEquals(res.status, 200);
  assert(
    !res.body.includes('value="delete"'),
    "delete control must not render for a non-registered (template-only) model",
  );
});

Deno.test("POST /models action=archive (VIEWER) is blocked server-side", async () => {
  const res = await appRequest("/models", {
    cookie: sessionCookie(VIEWER),
    form: { action: "archive", version: "20" },
    backend: {
      "POST /admin/models/archive": () => jsonResponse({ archived: true }),
    },
  });
  assert(res.status === 302 || res.status === 303);
  assertStringIncludes(res.location ?? "", "/login");
});

Deno.test("POST /models action=archive calls the archive endpoint", async () => {
  let hit = false;
  const res = await appRequest("/models", {
    cookie: sessionCookie(ADMIN),
    form: { action: "archive", version: "20" },
    backend: {
      "POST /admin/models/archive": () => {
        hit = true;
        return jsonResponse({ version: "20", archived: true });
      },
    },
  });
  assert(res.status === 302 || res.status === 303);
  assert(hit, "the archive endpoint was called");
  assertStringIncludes(res.location ?? "", "msg=");
});

Deno.test("POST /models action=delete calls the delete endpoint", async () => {
  let hit = false;
  const res = await appRequest("/models", {
    cookie: sessionCookie(ADMIN),
    form: { action: "delete", version: "20" },
    backend: {
      "POST /admin/models/delete": () => {
        hit = true;
        return jsonResponse({
          deleted: true,
          version: "20",
          scores_deleted: 0,
        });
      },
    },
  });
  assert(res.status === 302 || res.status === 303);
  assert(hit, "the delete endpoint was called");
  assertStringIncludes(res.location ?? "", "msg=");
});

Deno.test("POST /models action=delete surfaces a guardrail error", async () => {
  const res = await appRequest("/models", {
    cookie: sessionCookie(ADMIN),
    form: { action: "delete", version: "10" },
    backend: {
      "POST /admin/models/delete": () =>
        jsonResponse({
          error: "model version 10 is referenced by v20 (composite)",
        }),
    },
  });
  assert(res.status === 302 || res.status === 303);
  assertStringIncludes(res.location ?? "", "err=");
});
